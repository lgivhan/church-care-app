-- Migration 021: Prevent volunteers from being assigned to contact themselves.
--
-- A volunteer who is also a church member (matched by email) would previously
-- appear in their own assignment list. Both Pass 1 and Pass 2 now carry the
-- volunteer's email and exclude any member with the same email.

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
  -- Pass 1: gender-filtered volunteers, capped at 12 members each
  -- --------------------------------------------------------
  FOR r IN
    SELECT DISTINCT gender_filter
    FROM profiles
    WHERE gender_filter IS NOT NULL
      AND is_active = true
      AND role IN ('volunteer', 'admin')
  LOOP
    FOR vol IN
      SELECT id, is_non_technical, email AS vol_email
      FROM profiles
      WHERE role IN ('volunteer', 'admin')
        AND is_active = true
        AND gender_filter = r.gender_filter
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
      LIMIT 12;
    END LOOP;
  END LOOP;

  -- --------------------------------------------------------
  -- Pass 2: unrestricted volunteers share all remaining members
  -- --------------------------------------------------------
  SELECT COUNT(*) INTO v_remaining_vols
  FROM profiles
  WHERE role IN ('volunteer', 'admin')
    AND is_active = true
    AND gender_filter IS NULL;

  IF v_remaining_vols = 0 THEN
    RAISE NOTICE 'No unrestricted volunteers for cycle starting %. Pass 2 skipped.', v_week_starting;
    RETURN;
  END IF;

  FOR vol IN
    SELECT id, is_non_technical, email AS vol_email
    FROM profiles
    WHERE role IN ('volunteer', 'admin')
      AND is_active = true
      AND gender_filter IS NULL
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
