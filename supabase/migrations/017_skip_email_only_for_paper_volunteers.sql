-- Migration 017: Skip email-only members for paper-only (non-technical) volunteers.
--
-- Paper-only volunteers won't email contacts, so assigning them a member
-- whose only contact method is email wastes an assignment slot.
--
-- Each pass is split into two sub-passes:
--   a) Members with phone OR address  → assigned to all volunteers
--   b) Email-only members             → assigned only to non-paper-only volunteers
--
-- "Email-only" means email IS NOT NULL AND phone IS NULL AND address IS NULL.
-- Members who have email plus phone/address still go in sub-pass (a).

CREATE OR REPLACE FUNCTION generate_weekly_assignments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_starting          DATE;
  v_filtered_count         INT;
  v_filtered_tech_count    INT;
  v_unfiltered_count       INT;
  v_unfiltered_tech_count  INT;
  r                        RECORD;
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
  -- Pass 1: gender-filtered volunteers, capped at 12 rounds
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

    -- 1a: gender-matched members with phone/address → all gender-filtered volunteers
    INSERT INTO assignments (caller_id, member_id, status, week_starting)
    SELECT v.id, m.member_id, 'pending', v_week_starting
    FROM (
      SELECT
        id AS member_id,
        row_number() OVER (ORDER BY last_contacted ASC NULLS FIRST) AS member_rank
      FROM members
      WHERE (phone IS NOT NULL OR address IS NOT NULL)
        AND is_child = false
        AND excluded_from_assignments = false
        AND gender = r.gender_filter
        AND id NOT IN (SELECT member_id FROM assignments WHERE week_starting = v_week_starting)
    ) m
    JOIN (
      SELECT id, row_number() OVER (ORDER BY created_at ASC) AS vol_index
      FROM profiles
      WHERE role IN ('volunteer', 'admin')
        AND is_active = true
        AND gender_filter = r.gender_filter
    ) v ON ((m.member_rank - 1) % v_filtered_count) + 1 = v.vol_index
    WHERE CEIL(m.member_rank::FLOAT / v_filtered_count) <= 12;

    -- 1b: gender-matched email-only members → non-paper-only gender-filtered volunteers
    SELECT COUNT(*) INTO v_filtered_tech_count
    FROM profiles
    WHERE role IN ('volunteer', 'admin')
      AND is_active = true
      AND gender_filter = r.gender_filter
      AND is_non_technical = false;

    IF v_filtered_tech_count > 0 THEN
      INSERT INTO assignments (caller_id, member_id, status, week_starting)
      SELECT v.id, m.member_id, 'pending', v_week_starting
      FROM (
        SELECT
          id AS member_id,
          row_number() OVER (ORDER BY last_contacted ASC NULLS FIRST) AS member_rank
        FROM members
        WHERE email IS NOT NULL AND phone IS NULL AND address IS NULL
          AND is_child = false
          AND excluded_from_assignments = false
          AND gender = r.gender_filter
          AND id NOT IN (SELECT member_id FROM assignments WHERE week_starting = v_week_starting)
      ) m
      JOIN (
        SELECT id, row_number() OVER (ORDER BY created_at ASC) AS vol_index
        FROM profiles
        WHERE role IN ('volunteer', 'admin')
          AND is_active = true
          AND gender_filter = r.gender_filter
          AND is_non_technical = false
      ) v ON ((m.member_rank - 1) % v_filtered_tech_count) + 1 = v.vol_index
      WHERE CEIL(m.member_rank::FLOAT / v_filtered_tech_count) <= 12;
    ELSE
      RAISE NOTICE 'No non-paper-only gender-filtered (%) volunteers — email-only members skipped for this filter.', r.gender_filter;
    END IF;

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

  -- 2a: remaining members with phone/address → all unrestricted volunteers
  INSERT INTO assignments (caller_id, member_id, status, week_starting)
  SELECT v.id, m.member_id, 'pending', v_week_starting
  FROM (
    SELECT
      id AS member_id,
      row_number() OVER (ORDER BY last_contacted ASC NULLS FIRST) AS member_rank
    FROM members
    WHERE (phone IS NOT NULL OR address IS NOT NULL)
      AND is_child = false
      AND excluded_from_assignments = false
      AND id NOT IN (SELECT member_id FROM assignments WHERE week_starting = v_week_starting)
  ) m
  JOIN (
    SELECT id, row_number() OVER (ORDER BY created_at ASC) AS vol_index
    FROM profiles
    WHERE role IN ('volunteer', 'admin')
      AND is_active = true
      AND gender_filter IS NULL
  ) v ON ((m.member_rank - 1) % v_unfiltered_count) + 1 = v.vol_index;

  -- 2b: remaining email-only members → non-paper-only unrestricted volunteers
  SELECT COUNT(*) INTO v_unfiltered_tech_count
  FROM profiles
  WHERE role IN ('volunteer', 'admin')
    AND is_active = true
    AND gender_filter IS NULL
    AND is_non_technical = false;

  IF v_unfiltered_tech_count > 0 THEN
    INSERT INTO assignments (caller_id, member_id, status, week_starting)
    SELECT v.id, m.member_id, 'pending', v_week_starting
    FROM (
      SELECT
        id AS member_id,
        row_number() OVER (ORDER BY last_contacted ASC NULLS FIRST) AS member_rank
      FROM members
      WHERE email IS NOT NULL AND phone IS NULL AND address IS NULL
        AND is_child = false
        AND excluded_from_assignments = false
        AND id NOT IN (SELECT member_id FROM assignments WHERE week_starting = v_week_starting)
    ) m
    JOIN (
      SELECT id, row_number() OVER (ORDER BY created_at ASC) AS vol_index
      FROM profiles
      WHERE role IN ('volunteer', 'admin')
        AND is_active = true
        AND gender_filter IS NULL
        AND is_non_technical = false
    ) v ON ((m.member_rank - 1) % v_unfiltered_tech_count) + 1 = v.vol_index;
  ELSE
    RAISE NOTICE 'No non-paper-only unrestricted volunteers — email-only members not assigned.';
  END IF;

  RAISE NOTICE 'Cycle assignments generated for week starting %.', v_week_starting;
END;
$$;
