-- Migration 040: Let a volunteer be restricted to contacting only
-- "church members," mirroring how gender_filter already restricts by
-- gender and contact_cap restricts by count.
--
-- There's no first-class PCO field for this (unlike is_child, which PCO
-- exposes directly) -- membership_type is free-text from PCO's
-- "Membership" dropdown. src/lib/utils.js's getMembershipLabel() already
-- buckets these raw strings into categories for display; is_eligible_
-- member_type() below mirrors the same three buckets chosen as "member"
-- for assignment purposes (Active Member, Online Member, Occasional
-- Attender). Keep the two in sync if that bucketing ever changes.
--
-- This is a hard rule, not a soft preference: if a members_only
-- volunteer's eligible pool runs dry, they simply get fewer contacts
-- that cycle rather than falling back to a non-member -- enforced in
-- Pass 1/2 (each volunteer's own INSERT) and in the Pass 3 stranded-
-- member fallback.
--
-- Scope: applies prospectively to assignment generation only. Flipping
-- the toggle does not reshuffle already-pending assignments in the
-- current cycle.

ALTER TABLE profiles
  ADD COLUMN members_only BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION is_eligible_member_type(p_membership_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_membership_type IS NOT NULL AND (
    p_membership_type ILIKE '%regular attends%'
    OR p_membership_type ILIKE '%regular attendee%'
    OR p_membership_type ILIKE '%haitian church%'
    OR p_membership_type ILIKE '%online%'
    OR p_membership_type ILIKE '%attends occasionally%'
    OR p_membership_type ILIKE '%non-member attends%'
    OR p_membership_type ILIKE '%non member attends%'
  );
$$;

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
  v_vol_caps          INT[];
  v_vol_members_only  BOOLEAN[];
  v_vol_counts        INT[];
  v_vol_count         INT;
  v_pointer           INT := 0;
  v_tries             INT;
  v_i                 INT;
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
      SELECT id, is_non_technical, email AS vol_email, contact_cap, members_only
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
        AND (vol.members_only = false OR is_eligible_member_type(m.membership_type))
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
      SELECT id, is_non_technical, email AS vol_email, members_only
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
        AND (vol.members_only = false OR is_eligible_member_type(m.membership_type))
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
  -- Pass 2: unrestricted (no gender_filter) volunteers
  -- Stage 2a: capped volunteers each take up to their own cap.
  -- Stage 2b: uncapped volunteers fair-share the true remainder
  -- left after every capped volunteer has taken their share.
  -- --------------------------------------------------------
  FOR vol IN
    SELECT id, is_non_technical, email AS vol_email, contact_cap, members_only
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
      AND (vol.members_only = false OR is_eligible_member_type(m.membership_type))
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
      SELECT id, is_non_technical, email AS vol_email, members_only
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
        AND (vol.members_only = false OR is_eligible_member_type(m.membership_type))
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
  -- Pass 3: fallback safety net, capped and members_only-aware.
  -- Anyone still unassigned after Pass 1/2 gets handed to an
  -- active volunteer/admin in round-robin rotation, ignoring the
  -- no-repeat rule but NEVER a volunteer's contact_cap or a
  -- members_only volunteer's membership restriction. Self-
  -- assignment and the non-technical/phone-or-address constraint
  -- are still honored. A member with no eligible under-cap
  -- volunteer is left unassigned for the cycle.
  -- --------------------------------------------------------
  SELECT array_agg(id ORDER BY created_at ASC),
         array_agg(email ORDER BY created_at ASC),
         array_agg(is_non_technical ORDER BY created_at ASC),
         array_agg(contact_cap ORDER BY created_at ASC),
         array_agg(members_only ORDER BY created_at ASC)
    INTO v_vol_ids, v_vol_emails, v_vol_non_technical, v_vol_caps, v_vol_members_only
  FROM profiles
  WHERE role IN ('volunteer', 'admin')
    AND is_active = true;

  v_vol_count := COALESCE(array_length(v_vol_ids, 1), 0);

  IF v_vol_count > 0 THEN
    v_vol_counts := ARRAY[]::INT[];
    FOR v_i IN 1..v_vol_count LOOP
      SELECT COUNT(*) INTO v_target
      FROM assignments
      WHERE caller_id = v_vol_ids[v_i]
        AND week_starting = v_week_starting;
      v_vol_counts := v_vol_counts || v_target;
    END LOOP;

    FOR m2 IN
      SELECT m.id, m.email, m.phone, m.address, m.membership_type
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
          AND (v_vol_caps[v_pointer + 1] IS NULL
            OR v_vol_counts[v_pointer + 1] < v_vol_caps[v_pointer + 1])
          AND (v_vol_members_only[v_pointer + 1] = false
            OR is_eligible_member_type(m2.membership_type))
        THEN
          INSERT INTO assignments (caller_id, member_id, status, week_starting)
          VALUES (v_vol_ids[v_pointer + 1], m2.id, 'pending', v_week_starting);
          v_vol_counts[v_pointer + 1] := v_vol_counts[v_pointer + 1] + 1;
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
