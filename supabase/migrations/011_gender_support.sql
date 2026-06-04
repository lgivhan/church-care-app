-- Migration 011: Gender-based assignment filtering
--
-- Adds gender to the members table (synced from Planning Center) and
-- gender_filter to the profiles table (admin-controlled).
--
-- Volunteers with gender_filter = 'male' or 'female' are only assigned
-- members of that gender. NULL means "contacts all genders."
--
-- Members with no gender set are only assigned to unrestricted volunteers,
-- since we cannot safely assume their gender matches a filtered volunteer's scope.

ALTER TABLE members
  ADD COLUMN gender TEXT CHECK (gender IN ('male', 'female'));

ALTER TABLE profiles
  ADD COLUMN gender_filter TEXT CHECK (gender_filter IN ('male', 'female'));

-- gender is synced from PCO — no extra policy needed (service role bypasses RLS).
-- gender_filter is admin-controlled. The existing "Admins can update any profile"
-- policy already covers this new column — no new policy required.

-- ============================================================
-- Update generate_weekly_assignments() for gender-aware routing
--
-- Two-pass approach:
--   Pass 1 — for each gender_filter value ('male', 'female'),
--             assign members of that gender round-robin across
--             filtered volunteers.
--   Pass 2 — assign all remaining members (no gender set, or
--             overflow from gender pools) round-robin across
--             unrestricted volunteers (gender_filter IS NULL).
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
  -- Most recent Friday: (DOW - 5 + 7) % 7 gives days since last Friday.
  v_week_starting := CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::INT - 5 + 7) % 7);

  -- Already generated for this exact cycle start — idempotent, skip.
  IF EXISTS (
    SELECT 1 FROM assignments WHERE week_starting = v_week_starting
  ) THEN
    RAISE NOTICE 'Assignments already exist for %. Skipping.', v_week_starting;
    RETURN;
  END IF;

  -- Mid-cycle guard: if a cycle started within the last 13 days we are
  -- still inside that 2-week window — do not start a new cycle yet.
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
  -- Each distinct gender_filter value gets its own round-robin
  -- pool from members of that gender.
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
        AND (
          membership_type IS NULL
          OR (
            membership_type NOT ILIKE '%child%'
            AND membership_type NOT ILIKE '%teen%'
          )
        )
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
  -- Pass 2: unrestricted volunteers get all remaining members.
  -- "Remaining" means: members not assigned in Pass 1 (i.e.
  -- members with no gender, or overflow from gender pools that
  -- exceeded the filtered volunteers' capacity).
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
      AND (
        membership_type IS NULL
        OR (
          membership_type NOT ILIKE '%child%'
          AND membership_type NOT ILIKE '%teen%'
        )
      )
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
