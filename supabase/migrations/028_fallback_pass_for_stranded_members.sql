-- Migration 028: Fallback pass for members stranded by the no-repeat rule.
--
-- Bug: when there's only one (or few) uncapped/unrestricted volunteer(s),
-- the "don't repeat last cycle's caller" rule (migration 021) can block
-- that volunteer from taking back any of their previous cycle's members,
-- with no one else having spare capacity/priority to absorb them (they
-- sort to the back of every capped volunteer's last-contacted-ordered
-- queue because they were JUST contacted). Those members then get no
-- assignment at all for the cycle -- confirmed against live data where
-- every one of the ~172 members left unassigned in a cycle were exactly
-- the previous cycle's contacts of the sole uncapped volunteer.
--
-- Fix: after Pass 1 and Pass 2 run as before, add a Pass 3 safety net.
-- Any eligible member still unassigned gets handed to an active
-- volunteer/admin in simple round-robin rotation, ignoring both the
-- no-repeat rule and contact_cap (a repeat contact beats no contact).
-- Self-assignment and the non-technical/phone-or-address constraint are
-- still respected. This only ever fires for members the normal passes
-- failed to cover, so ordinary rotation behavior is unchanged.
--
-- Also removes the early RETURN when there are zero uncapped/unrestricted
-- volunteers, so Pass 3 still runs as a safety net in that case too.

CREATE OR REPLACE FUNCTION generate_weekly_assignments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_starting     DATE;
  v_prev_week         DATE;
  v_remaining_members INT;
  v_remaining_vols    INT;
  v_target            INT;
  r                   RECORD;
  vol                 RECORD;
  v_vol_ids           UUID[];
  v_vol_emails        TEXT[];
  v_vol_non_technical BOOLEAN[];
  v_vol_count         INT;
  v_pointer           INT := 0;
  v_tries             INT;
  m2                  RECORD;
BEGIN
  v_week_starting := CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::INT - 5 + 7) % 7);

  IF EXISTS (
    SELECT 1 FROM assignments WHERE week_starting = v_week_starting
  ) THEN
    RAISE NOTICE 'Assignments already exist for %. Skipping.', v_week_starting;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM assignments
    WHERE week_starting >= v_week_starting - 13
      AND week_starting < v_week_starting
  ) THEN
    RAISE NOTICE 'Mid-cycle: active assignments found within 13 days of %. Skipping.', v_week_starting;
    RETURN;
  END IF;

  SELECT MAX(week_starting) INTO v_prev_week
  FROM assignments
  WHERE week_starting < v_week_starting;

  -- --------------------------------------------------------
  -- Pass 1: gender-filtered volunteers
  -- Stage 1a: capped volunteers each take up to their own cap.
  -- Stage 1b: uncapped volunteers fair-share whatever's left of
  -- that gender pool, among themselves only.
  -- --------------------------------------------------------
  FOR r IN
    SELECT DISTINCT gender_filter
    FROM profiles
    WHERE gender_filter IS NOT NULL
      AND is_active = true
      AND role IN ('volunteer', 'admin')
  LOOP
    FOR vol IN
      SELECT id, is_non_technical, email AS vol_email, contact_cap
      FROM profiles
      WHERE role IN ('volunteer', 'admin')
        AND is_active = true
        AND gender_filter = r.gender_filter
        AND contact_cap IS NOT NULL
      ORDER BY created_at ASC
    LOOP
      INSERT INTO assignments (caller_id, member_id, status, week_starting)
      SELECT vol.id, m.id, 'pending', v_week_starting
      FROM members m
      WHERE m.gender = r.gender_filter
        AND (m.phone IS NOT NULL OR m.address IS NOT NULL OR m.email IS NOT NULL)
        AND m.is_child = false
        AND m.excluded_from_assignments = false
        AND m.id NOT IN (
          SELECT member_id FROM assignments WHERE week_starting = v_week_starting
        )
        AND (v_prev_week IS NULL OR m.id NOT IN (
          SELECT member_id FROM assignments
          WHERE week_starting = v_prev_week AND caller_id = vol.id
        ))
        AND (vol.is_non_technical = false OR m.phone IS NOT NULL OR m.address IS NOT NULL)
        AND m.email IS DISTINCT FROM vol.vol_email
      ORDER BY m.last_contacted ASC NULLS FIRST
      LIMIT vol.contact_cap;
    END LOOP;

    SELECT COUNT(*) INTO v_remaining_vols
    FROM profiles
    WHERE role IN ('volunteer', 'admin')
      AND is_active = true
      AND gender_filter = r.gender_filter
      AND contact_cap IS NULL;

    IF v_remaining_vols = 0 THEN
      CONTINUE;
    END IF;

    FOR vol IN
      SELECT id, is_non_technical, email AS vol_email
      FROM profiles
      WHERE role IN ('volunteer', 'admin')
        AND is_active = true
        AND gender_filter = r.gender_filter
        AND contact_cap IS NULL
      ORDER BY created_at ASC
    LOOP
      SELECT COUNT(*) INTO v_remaining_members
      FROM members m
      WHERE m.gender = r.gender_filter
        AND (m.phone IS NOT NULL OR m.address IS NOT NULL OR m.email IS NOT NULL)
        AND m.is_child = false
        AND m.excluded_from_assignments = false
        AND m.id NOT IN (
          SELECT member_id FROM assignments WHERE week_starting = v_week_starting
        );

      v_target := CEIL(v_remaining_members::FLOAT / v_remaining_vols);

      INSERT INTO assignments (caller_id, member_id, status, week_starting)
      SELECT vol.id, m.id, 'pending', v_week_starting
      FROM members m
      WHERE m.gender = r.gender_filter
        AND (m.phone IS NOT NULL OR m.address IS NOT NULL OR m.email IS NOT NULL)
        AND m.is_child = false
        AND m.excluded_from_assignments = false
        AND m.id NOT IN (
          SELECT member_id FROM assignments WHERE week_starting = v_week_starting
        )
        AND (v_prev_week IS NULL OR m.id NOT IN (
          SELECT member_id FROM assignments
          WHERE week_starting = v_prev_week AND caller_id = vol.id
        ))
        AND (vol.is_non_technical = false OR m.phone IS NOT NULL OR m.address IS NOT NULL)
        AND m.email IS DISTINCT FROM vol.vol_email
      ORDER BY m.last_contacted ASC NULLS FIRST
      LIMIT v_target;

      v_remaining_vols := v_remaining_vols - 1;
    END LOOP;
  END LOOP;

  -- --------------------------------------------------------
  -- Pass 2: unrestricted volunteers
  -- Stage 2a: capped volunteers each take up to their own cap.
  -- Stage 2b: uncapped volunteers fair-share the true remainder
  -- left after every capped volunteer has taken their share.
  -- --------------------------------------------------------
  FOR vol IN
    SELECT id, is_non_technical, email AS vol_email, contact_cap
    FROM profiles
    WHERE role IN ('volunteer', 'admin')
      AND is_active = true
      AND gender_filter IS NULL
      AND contact_cap IS NOT NULL
    ORDER BY created_at ASC
  LOOP
    INSERT INTO assignments (caller_id, member_id, status, week_starting)
    SELECT vol.id, m.id, 'pending', v_week_starting
    FROM members m
    WHERE (m.phone IS NOT NULL OR m.address IS NOT NULL OR m.email IS NOT NULL)
      AND m.is_child = false
      AND m.excluded_from_assignments = false
      AND m.id NOT IN (
        SELECT member_id FROM assignments WHERE week_starting = v_week_starting
      )
      AND (v_prev_week IS NULL OR m.id NOT IN (
        SELECT member_id FROM assignments
        WHERE week_starting = v_prev_week AND caller_id = vol.id
      ))
      AND (vol.is_non_technical = false OR m.phone IS NOT NULL OR m.address IS NOT NULL)
      AND m.email IS DISTINCT FROM vol.vol_email
    ORDER BY m.last_contacted ASC NULLS FIRST
    LIMIT vol.contact_cap;
  END LOOP;

  SELECT COUNT(*) INTO v_remaining_vols
  FROM profiles
  WHERE role IN ('volunteer', 'admin')
    AND is_active = true
    AND gender_filter IS NULL
    AND contact_cap IS NULL;

  IF v_remaining_vols = 0 THEN
    RAISE NOTICE 'No uncapped unrestricted volunteers for cycle starting %. Pass 2b skipped.', v_week_starting;
  ELSE
    FOR vol IN
      SELECT id, is_non_technical, email AS vol_email
      FROM profiles
      WHERE role IN ('volunteer', 'admin')
        AND is_active = true
        AND gender_filter IS NULL
        AND contact_cap IS NULL
      ORDER BY created_at ASC
    LOOP
      SELECT COUNT(*) INTO v_remaining_members
      FROM members m
      WHERE (m.phone IS NOT NULL OR m.address IS NOT NULL OR m.email IS NOT NULL)
        AND m.is_child = false
        AND m.excluded_from_assignments = false
        AND m.id NOT IN (
          SELECT member_id FROM assignments WHERE week_starting = v_week_starting
        );

      v_target := CEIL(v_remaining_members::FLOAT / v_remaining_vols);

      INSERT INTO assignments (caller_id, member_id, status, week_starting)
      SELECT vol.id, m.id, 'pending', v_week_starting
      FROM members m
      WHERE (m.phone IS NOT NULL OR m.address IS NOT NULL OR m.email IS NOT NULL)
        AND m.is_child = false
        AND m.excluded_from_assignments = false
        AND m.id NOT IN (
          SELECT member_id FROM assignments WHERE week_starting = v_week_starting
        )
        AND (v_prev_week IS NULL OR m.id NOT IN (
          SELECT member_id FROM assignments
          WHERE week_starting = v_prev_week AND caller_id = vol.id
        ))
        AND (vol.is_non_technical = false OR m.phone IS NOT NULL OR m.address IS NOT NULL)
        AND m.email IS DISTINCT FROM vol.vol_email
      ORDER BY m.last_contacted ASC NULLS FIRST
      LIMIT v_target;

      v_remaining_vols := v_remaining_vols - 1;
    END LOOP;
  END IF;

  -- --------------------------------------------------------
  -- Pass 3: fallback safety net.
  -- Anyone still unassigned after Pass 1/2 gets handed to an
  -- active volunteer/admin in round-robin rotation, ignoring the
  -- no-repeat rule and contact_cap. Self-assignment and the
  -- non-technical/phone-or-address constraint are still honored.
  -- --------------------------------------------------------
  SELECT array_agg(id ORDER BY created_at ASC),
         array_agg(email ORDER BY created_at ASC),
         array_agg(is_non_technical ORDER BY created_at ASC)
    INTO v_vol_ids, v_vol_emails, v_vol_non_technical
  FROM profiles
  WHERE role IN ('volunteer', 'admin')
    AND is_active = true;

  v_vol_count := COALESCE(array_length(v_vol_ids, 1), 0);

  IF v_vol_count > 0 THEN
    FOR m2 IN
      SELECT m.id, m.email, m.phone, m.address
      FROM members m
      WHERE (m.phone IS NOT NULL OR m.address IS NOT NULL OR m.email IS NOT NULL)
        AND m.is_child = false
        AND m.excluded_from_assignments = false
        AND m.id NOT IN (
          SELECT member_id FROM assignments WHERE week_starting = v_week_starting
        )
      ORDER BY m.last_contacted ASC NULLS FIRST
    LOOP
      v_tries := 0;
      WHILE v_tries < v_vol_count LOOP
        IF v_vol_emails[v_pointer + 1] IS DISTINCT FROM m2.email
          AND (v_vol_non_technical[v_pointer + 1] = false
            OR m2.phone IS NOT NULL OR m2.address IS NOT NULL)
        THEN
          INSERT INTO assignments (caller_id, member_id, status, week_starting)
          VALUES (v_vol_ids[v_pointer + 1], m2.id, 'pending', v_week_starting);
          v_pointer := (v_pointer + 1) % v_vol_count;
          EXIT;
        END IF;
        v_pointer := (v_pointer + 1) % v_vol_count;
        v_tries := v_tries + 1;
      END LOOP;
    END LOOP;
  END IF;

  RAISE NOTICE 'Cycle assignments generated for week starting %.', v_week_starting;
END;
$$;
