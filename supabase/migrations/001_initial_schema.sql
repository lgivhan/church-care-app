-- ============================================================
-- Church Care Contact App — Initial Schema
-- Run this in Supabase SQL Editor in one pass.
-- ============================================================


-- ============================================================
-- SECTION 1: PROFILES
-- Mirrors auth.users. Auto-populated by trigger on signup.
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL DEFAULT '',
  email            TEXT NOT NULL DEFAULT '',
  role             TEXT NOT NULL DEFAULT 'volunteer' CHECK (role IN ('admin', 'volunteer', 'prayer_team')),
  is_active        BOOLEAN NOT NULL DEFAULT false,
  ministry         TEXT CHECK (ministry IN ('elder', 'deacon', 'greeter', 'other')),
  is_non_technical BOOLEAN NOT NULL DEFAULT false,
  invite_pending   BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger function: fires after a new auth.users row is inserted.
-- Copies id, email, and full_name (from signup metadata) into profiles.
-- SECURITY DEFINER allows it to write to profiles regardless of RLS.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'volunteer',
    false
  );
  RETURN NEW;
END;
$$;

-- Drop trigger if it exists so this script is safely re-runnable.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();


-- ============================================================
-- SECTION 2: MEMBERS
-- Mirrored from Planning Center. Primary key is the PCO id (text).
-- ============================================================

CREATE TABLE IF NOT EXISTS members (
  id              TEXT PRIMARY KEY,         -- Planning Center person ID
  first_name      TEXT NOT NULL DEFAULT '',
  last_name       TEXT NOT NULL DEFAULT '',
  email           TEXT,
  phone           TEXT,
  birthday        DATE,                     -- nullable; sourced from PCO if available
  membership_type TEXT, 
  last_contacted  TIMESTAMPTZ,              -- updated when a contact_log is inserted
  last_synced     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- SECTION 3: ASSIGNMENTS
-- One row per volunteer-member pairing per week.
-- week_starting is always the Sunday that begins the week.
-- ============================================================

CREATE TABLE IF NOT EXISTS assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_id     TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  week_starting DATE NOT NULL,
  completed_at  TIMESTAMPTZ,

  -- Prevent the same member from being assigned twice in one week.
  UNIQUE (member_id, week_starting)
);

-- Index for the most common volunteer dashboard query.
CREATE INDEX IF NOT EXISTS idx_assignments_caller_week
  ON assignments (caller_id, week_starting);

-- Index for admin week-based lookups.
CREATE INDEX IF NOT EXISTS idx_assignments_week
  ON assignments (week_starting);


-- ============================================================
-- SECTION 4: CONTACT LOGS
-- Permanent history of every contact attempt.
-- Volunteers insert; no one deletes.
-- ============================================================

CREATE TABLE IF NOT EXISTS contact_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  volunteer_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignment_id   UUID REFERENCES assignments(id) ON DELETE SET NULL,
  notes           TEXT,
  contact_method  TEXT CHECK (contact_method IN ('call', 'text', 'email', 'voicemail', 'in_person')),
  contacted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  needs_follow_up BOOLEAN NOT NULL DEFAULT false,
  follow_up_resolved      BOOLEAN NOT NULL DEFAULT false,
  prayer_request          BOOLEAN NOT NULL DEFAULT false,
  prayer_request_resolved BOOLEAN NOT NULL DEFAULT false,
  logged_by               UUID REFERENCES profiles(id)
);

-- Index for admin follow-up queries.
CREATE INDEX IF NOT EXISTS idx_contact_logs_follow_up
  ON contact_logs (needs_follow_up)
  WHERE needs_follow_up = true;

-- Index for member contact history.
CREATE INDEX IF NOT EXISTS idx_contact_logs_member
  ON contact_logs (member_id);


-- ============================================================
-- SECTION 5: GENERATE WEEKLY ASSIGNMENTS FUNCTION
--
-- Called by the generateWeeklyAssignments Edge Function.
-- Logic:
--   1. Determine this week's Sunday (week_starting).
--   2. Bail out early if assignments already exist for this week.
--   3. Get all active volunteers.
--   4. Get all members NOT already assigned this week,
--      ordered by last_contacted ASC NULLS FIRST (longest-waiting first).
--   5. Use row_number() to distribute members round-robin across
--      volunteers, capped at 15 per volunteer.
--   6. Insert the resulting assignments.
--
-- This approach uses a single ranked query to prevent duplicates.
-- We do NOT loop with LIMIT 15 per volunteer, which would cause
-- overlapping member selections.
-- ============================================================

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
      -- Must have at least one way to be contacted
      (email IS NOT NULL OR phone IS NOT NULL)
      -- Exclude children and teens based on membership type.
      -- We check for 'Child' and 'Teen' case-insensitively to catch
      -- all PCO membership type variations e.g:
      --   'Child of Member - Regular Attendee'
      --   'Child Non Member Adventurer'
      --   'Child/Teen Non Member Attends'
      AND (
        membership_type IS NULL
        OR (
          membership_type NOT ILIKE '%child%'
          AND membership_type NOT ILIKE '%teen%'
        )
      )
      -- Exclude members already assigned this week
      AND id NOT IN (
        SELECT member_id 
        FROM assignments 
        WHERE week_starting = v_week_starting
      )
  ) m
  JOIN (
    -- Only assign to volunteers without assignments this week
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

-- ============================================================
-- SECTION 6: AUTO-UPDATE last_contacted ON MEMBERS
--
-- When a contact_log row is inserted, update the member's
-- last_contacted timestamp so the assignment rotation stays accurate.
-- ============================================================

CREATE OR REPLACE FUNCTION update_member_last_contacted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE members
  SET last_contacted = NEW.contacted_at
  WHERE id = NEW.member_id
    -- Only update if this contact is more recent than the last recorded one.
    AND (last_contacted IS NULL OR NEW.contacted_at > last_contacted);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_contact_log_inserted ON contact_logs;

CREATE TRIGGER on_contact_log_inserted
  AFTER INSERT ON contact_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_member_last_contacted();
