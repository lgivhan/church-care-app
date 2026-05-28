-- Migration 008: Anchor assignment cycles to Friday instead of Sunday
--
-- The cron fires on Friday. Previously the function targeted the upcoming
-- Sunday, meaning volunteers had to wait 2 days after receiving their paper
-- list before the app reflected the new cycle. Now the cycle starts on Friday
-- so distribution day and app start day are the same.
--
-- Only the v_week_starting calculation changes. Everything else (mid-cycle
-- guard, all-member distribution, idempotency check) stays identical.

CREATE OR REPLACE FUNCTION generate_weekly_assignments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_starting   DATE;
  v_volunteer_count INT;
BEGIN
  -- Most recent Friday: subtract the number of days since last Friday.
  -- DOW: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  -- (DOW - 5 + 7) % 7 gives days since last Friday (0 on Friday itself).
  v_week_starting := CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::INT - 5 + 7) % 7);

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
    RAISE NOTICE 'No active volunteers found for cycle starting %. Skipping.', v_week_starting;
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
