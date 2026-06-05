-- Migration 012: Replace membership_type child/teen heuristic with PCO's
-- native child boolean.
--
-- PCO has a first-class "child" flag on every person (the checkbox in
-- Edit Profile → "This person is a child"). Using it is more reliable than
-- pattern-matching on membership_type strings, which vary by church config.
--
-- is_child is synced from PCO daily via syncMembersDaily and is intentionally
-- NOT excluded from the upsert payload (unlike excluded_from_assignments).

ALTER TABLE members
  ADD COLUMN is_child BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- Update generate_weekly_assignments() to use is_child
-- ============================================================

CREATE OR REPLACE FUNCTION generate_weekly_assignments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_starting    DATE;
  v_filtered_count   INT;
  v_unfiltered_count INT;
  r                  RECORD;
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

  -- --------------------------------------------------------
  -- Pass 1: gender-filtered volunteers
  -- --------------------------------------------------------
  FOR r IN
    SELECT DISTINCT gender_filter
    FROM profiles
    WHERE gender_filter IS NOT NULL
      AND is_active = true
      AND role IN ('volunteer', 'admin')
  LOOP
    SELECT COUNT(*) INTO v_filtered_count
    FROM profiles
    WHERE role IN ('volunteer', 'admin')
      AND is_active = true
      AND gender_filter = r.gender_filter;

    IF v_filtered_count = 0 THEN CONTINUE; END IF;

    INSERT INTO assignments (caller_id, member_id, status, week_starting)
    SELECT v.id, m.member_id, 'pending', v_week_starting
    FROM (
      SELECT
        id AS member_id,
        row_number() OVER (ORDER BY last_contacted ASC NULLS FIRST) AS member_rank
      FROM members
      WHERE (email IS NOT NULL OR phone IS NOT NULL OR address IS NOT NULL)
        AND is_child = false
        AND excluded_from_assignments = false
        AND gender = r.gender_filter
        AND id NOT IN (
          SELECT member_id FROM assignments WHERE week_starting = v_week_starting
        )
    ) m
    JOIN (
      SELECT
        id,
        row_number() OVER (ORDER BY created_at ASC) AS vol_index
      FROM profiles
      WHERE role IN ('volunteer', 'admin')
        AND is_active = true
        AND gender_filter = r.gender_filter
    ) v ON ((m.member_rank - 1) % v_filtered_count) + 1 = v.vol_index;
  END LOOP;

  -- --------------------------------------------------------
  -- Pass 2: unrestricted volunteers get all remaining members
  -- --------------------------------------------------------
  SELECT COUNT(*) INTO v_unfiltered_count
  FROM profiles
  WHERE role IN ('volunteer', 'admin')
    AND is_active = true
    AND gender_filter IS NULL;

  IF v_unfiltered_count = 0 THEN
    RAISE NOTICE 'No unrestricted volunteers for cycle starting %. Pass 2 skipped.', v_week_starting;
    RETURN;
  END IF;

  INSERT INTO assignments (caller_id, member_id, status, week_starting)
  SELECT v.id, m.member_id, 'pending', v_week_starting
  FROM (
    SELECT
      id AS member_id,
      row_number() OVER (ORDER BY last_contacted ASC NULLS FIRST) AS member_rank
    FROM members
    WHERE (email IS NOT NULL OR phone IS NOT NULL OR address IS NOT NULL)
      AND is_child = false
      AND excluded_from_assignments = false
      AND id NOT IN (
        SELECT member_id FROM assignments WHERE week_starting = v_week_starting
      )
  ) m
  JOIN (
    SELECT
      id,
      row_number() OVER (ORDER BY created_at ASC) AS vol_index
    FROM profiles
    WHERE role IN ('volunteer', 'admin')
      AND is_active = true
      AND gender_filter IS NULL
  ) v ON ((m.member_rank - 1) % v_unfiltered_count) + 1 = v.vol_index;

  RAISE NOTICE 'Cycle assignments generated for week starting %.', v_week_starting;
END;
$$;
