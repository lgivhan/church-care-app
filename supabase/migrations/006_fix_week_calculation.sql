-- Migration 006: Fix week_starting calculation in generate_weekly_assignments
--
-- Previously the function used date_trunc('week', ...) which always returned
-- the most recent past Sunday. When the cron fires on Friday, that was 5 days
-- ago — creating assignments for the week that just ended, not the upcoming one.
--
-- New logic:
--   Friday (DOW=5) or Saturday (DOW=6) → target the upcoming Sunday
--   Sunday (DOW=0) through Thursday (DOW=1-4)  → target the current Sunday
--
-- This way a Friday cron run creates assignments that volunteers can see
-- starting Sunday, and manual triggers mid-week target the current week.

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

  -- On Friday (5) or Saturday (6) advance to the upcoming Sunday so that
  -- assignments are ready when the new week opens. All other days target
  -- the Sunday that started the current week.
  IF v_dow >= 5 THEN
    v_week_starting := CURRENT_DATE + (7 - v_dow);
  ELSE
    v_week_starting := CURRENT_DATE - v_dow;
  END IF;

  -- Count active volunteers who don't yet have assignments this week
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
    RAISE NOTICE 'All active volunteers already have assignments for week starting %. Skipping.', v_week_starting;
    RETURN;
  END IF;

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
    ON ((m.member_rank - 1) % v_volunteer_count) + 1 = v.vol_index
  WHERE
    CEIL(m.member_rank::FLOAT / v_volunteer_count) <= 15;

  RAISE NOTICE 'Weekly assignments generated for week starting %.', v_week_starting;
END;
$$;
