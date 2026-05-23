-- ============================================================
-- Migration 004: Add physical address to members + snail_mail contact method
-- ============================================================

-- 1. Add address column to members
ALTER TABLE members ADD COLUMN IF NOT EXISTS address TEXT;

-- 2. Drop and recreate the contact_method CHECK constraint to include snail_mail.
--    PostgreSQL auto-names inline constraints as <table>_<column>_check.
ALTER TABLE contact_logs DROP CONSTRAINT IF EXISTS contact_logs_contact_method_check;
ALTER TABLE contact_logs
  ADD CONSTRAINT contact_logs_contact_method_check
  CHECK (contact_method IN ('call', 'text', 'email', 'voicemail', 'in_person', 'snail_mail'));

-- 3. Update generate_weekly_assignments() to include members who have only
--    a physical address (no email or phone).
CREATE OR REPLACE FUNCTION generate_weekly_assignments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_starting DATE;
  v_volunteer_count INT;
BEGIN
  v_week_starting := (date_trunc('week', CURRENT_DATE + INTERVAL '1 day') - INTERVAL '1 day')::DATE;

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
      -- Must have at least one way to be contacted (phone, email, or physical address)
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
