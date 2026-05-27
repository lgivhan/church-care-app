-- Migration 007: Switch to 2-week assignment cycles, cover all members
--
-- Two changes to generate_weekly_assignments():
--
-- 1. Mid-cycle guard: if assignments already exist within the past 13 days
--    the function exits early. This lets the Friday cron keep its schedule
--    while silently skipping the second Friday of each 2-week cycle.
--
-- 2. Remove the per-volunteer cap of 15. Every contactable member is now
--    assigned to a volunteer each cycle (divided evenly across all volunteers).

CREATE OR REPLACE FUNCTION generate_weekly_assignments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dow             INT;
  v_week_starting   DATE;
  v_volunteer_count INT;
BEGIN
  v_dow := EXTRACT(DOW FROM CURRENT_DATE)::INT;

  -- On Friday (5) or Saturday (6) target the upcoming Sunday.
  -- On Sunday (0) through Thursday (1-4) target the current Sunday.
  IF v_dow >= 5 THEN
    v_week_starting := CURRENT_DATE + (7 - v_dow);
  ELSE
    v_week_starting := CURRENT_DATE - v_dow;
  END IF;

  -- Already generated for this exact cycle start — idempotent, skip.
  IF EXISTS (
    SELECT 1 FROM assignments WHERE week_starting = v_week_starting
  ) THEN
    RAISE NOTICE 'Assignments already exist for %. Skipping.', v_week_starting;
    RETURN;
  END IF;

  -- Mid-cycle guard: if a cycle started within the last 13 days, we are
  -- still inside that 2-week window — do not start a new cycle yet.
  IF EXISTS (
    SELECT 1 FROM assignments
    WHERE week_starting >= v_week_starting - 13
      AND week_starting < v_week_starting
  ) THEN
    RAISE NOTICE 'Mid-cycle: active assignments found within 13 days of %. Skipping.', v_week_starting;
    RETURN;
  END IF;

  -- Count active volunteers who don't yet have assignments this cycle.
  SELECT COUNT(*) INTO v_volunteer_count
  FROM profiles
  WHERE role IN ('volunteer', 'admin')
    AND is_active = true
    AND id NOT IN (
      SELECT DISTINCT caller_id
      FROM assignments
      WHERE week_starting = v_week_starting
    );

  IF v_volunteer_count = 0 THEN
    RAISE NOTICE 'No active volunteers found for week starting %. Skipping.', v_week_starting;
    RETURN;
  END IF;

  -- Assign ALL contactable members evenly across volunteers (no cap).
  INSERT INTO assignments (caller_id, member_id, status, week_starting)
  SELECT
    v.id        AS caller_id,
    m.member_id AS member_id,
    'pending'   AS status,
    v_week_starting
  FROM (
    SELECT
      id AS member_id,
      row_number() OVER (ORDER BY last_contacted ASC NULLS FIRST) AS member_rank
    FROM members
    WHERE
      (email IS NOT NULL OR phone IS NOT NULL OR address IS NOT NULL)
      AND (
        membership_type IS NULL
        OR (
          membership_type NOT ILIKE '%child%'
          AND membership_type NOT ILIKE '%teen%'
        )
      )
      AND id NOT IN (
        SELECT member_id
        FROM assignments
        WHERE week_starting = v_week_starting
      )
  ) m
  JOIN (
    SELECT
      id,
      row_number() OVER (ORDER BY created_at ASC) AS vol_index
    FROM profiles
    WHERE role IN ('volunteer', 'admin')
      AND is_active = true
      AND id NOT IN (
        SELECT DISTINCT caller_id
        FROM assignments
        WHERE week_starting = v_week_starting
      )
  ) v
    ON ((m.member_rank - 1) % v_volunteer_count) + 1 = v.vol_index;

  RAISE NOTICE 'Cycle assignments generated for week starting %.', v_week_starting;
END;
$$;
