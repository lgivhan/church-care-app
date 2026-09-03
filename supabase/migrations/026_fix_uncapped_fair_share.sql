-- Migration 026: Fix uncapped volunteers not receiving the true remainder.
--
-- Bug in 025: every volunteer (capped or not) received LEAST(fair_share,
-- cap), where fair_share was CEIL(remaining_members / remaining_volunteers)
-- computed fresh at that volunteer's turn in the created_at loop. An
-- uncapped volunteer's cap is NULL, so LEAST() was skipped for them and
-- they simply received that turn's fair_share snapshot -- never the actual
-- leftover pool after every capped volunteer took their fixed allotment.
-- In practice this meant capped volunteers always got exactly their cap,
-- and any single uncapped volunteer got an arbitrary small slice instead
-- of "everyone else's cap, plus whatever's left over."
--
-- Fix: split each pass into two stages. Capped volunteers go first and
-- each take up to their own cap directly (no fair-share division; the cap
-- already defines their target). Uncapped volunteers go second and fair-
-- share whatever members remain after every capped volunteer has taken
-- their share -- exactly the original pre-cap Pass 2 behavior, now scoped
-- to just the uncapped subset.

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
    RAISE NOTICE 'Cycle assignments generated for week starting %.', v_week_starting;
    RETURN;
  END IF;

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

  RAISE NOTICE 'Cycle assignments generated for week starting %.', v_week_starting;
END;
$$;
