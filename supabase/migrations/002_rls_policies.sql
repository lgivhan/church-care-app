-- ============================================================
-- Church Care Contact App — Row Level Security Policies
-- Run this in Supabase SQL Editor after 001_initial_schema.sql
-- ============================================================


-- ============================================================
-- HELPER FUNCTION: is_admin()
--
-- Returns true if the currently authenticated user has
-- role = 'admin' in the profiles table.
-- Using a function keeps policies readable and ensures the
-- admin check is defined in one place.
-- SECURITY DEFINER so it can read profiles regardless of RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$;


-- ============================================================
-- HELPER FUNCTION: is_active_volunteer()
--
-- Returns true if the current user is an active volunteer.
-- Used to block inactive (unapproved) volunteers from
-- reading or writing any data.
-- ============================================================

CREATE OR REPLACE FUNCTION is_active_volunteer()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'volunteer'
    AND is_active = true
  );
END;
$$;


-- ============================================================
-- TABLE: profiles
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Volunteers can read their own profile only.
CREATE POLICY "Volunteers can read own profile"
  ON profiles FOR SELECT
  USING (
    auth.uid() = id
  );

-- Volunteers can update their own profile (e.g. full_name).
-- They cannot change their own role or is_active — those fields
-- are protected by the admin-only update policy below.
CREATE POLICY "Volunteers can update own profile"
  ON profiles FOR UPDATE
  USING (
    auth.uid() = id
    AND is_active_volunteer()
  )
  WITH CHECK (
    auth.uid() = id
    -- Prevent volunteers from escalating their own role or
    -- activating themselves. Only admins may change these fields.
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
    AND is_active = (SELECT is_active FROM profiles WHERE id = auth.uid())
  );

-- Admins can read all profiles (needed for dashboard views).
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  USING (is_admin());

-- Admins can update any profile — specifically to set
-- is_active = true (approve) or is_active = false (deactivate),
-- and to change roles if needed.
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- The handle_new_user() trigger function uses SECURITY DEFINER
-- so it can insert into profiles without a specific INSERT policy.
-- No INSERT policy is needed here for normal users.


-- ============================================================
-- TABLE: members
-- ============================================================

ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- Active volunteers can read all members.
-- They need this to see contact details on their assignment cards.
CREATE POLICY "Active volunteers can read members"
  ON members FOR SELECT
  USING (is_active_volunteer());

-- Admins can read all members.
CREATE POLICY "Admins can read all members"
  ON members FOR SELECT
  USING (is_admin());

-- Only the Edge Function (service role) may insert or update members.
-- The service role bypasses RLS entirely, so no explicit policy
-- is needed for the sync function. We intentionally omit INSERT/UPDATE
-- policies here to prevent any client from writing to this table.


-- ============================================================
-- TABLE: assignments
-- ============================================================

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- Active volunteers can only read their own assignments.
CREATE POLICY "Volunteers can read own assignments"
  ON assignments FOR SELECT
  USING (
    caller_id = auth.uid()
    AND is_active_volunteer()
  );

-- Active volunteers can update their own assignments.
-- This is needed to mark status = 'completed' and set completed_at.
CREATE POLICY "Volunteers can update own assignments"
  ON assignments FOR UPDATE
  USING (
    caller_id = auth.uid()
    AND is_active_volunteer()
  )
  WITH CHECK (
    caller_id = auth.uid()
  );

-- Admins can read all assignments (for dashboard reporting).
CREATE POLICY "Admins can read all assignments"
  ON assignments FOR SELECT
  USING (is_admin());

-- The generate_weekly_assignments() function uses SECURITY DEFINER,
-- so it inserts assignments without needing a client INSERT policy.


-- ============================================================
-- TABLE: contact_logs
-- ============================================================

ALTER TABLE contact_logs ENABLE ROW LEVEL SECURITY;

-- Active volunteers can insert their own logs.
CREATE POLICY "Volunteers can insert own logs"
  ON contact_logs FOR INSERT
  WITH CHECK (
    volunteer_id = auth.uid()
    AND is_active_volunteer()
  );

-- Active volunteers can update their own logs (to edit notes).
-- They cannot update logs belonging to other volunteers.
CREATE POLICY "Volunteers can update own logs"
  ON contact_logs FOR UPDATE
  USING (
    volunteer_id = auth.uid()
    AND is_active_volunteer()
  )
  WITH CHECK (
    volunteer_id = auth.uid()
  );

-- Active volunteers can read their own logs.
CREATE POLICY "Volunteers can read own logs"
  ON contact_logs FOR SELECT
  USING (
    volunteer_id = auth.uid()
    AND is_active_volunteer()
  );

-- Admins can read all contact logs.
CREATE POLICY "Admins can read all logs"
  ON contact_logs FOR SELECT
  USING (is_admin());

-- NO DELETE policies exist on contact_logs for anyone.
-- Contact history is permanent by design.

-- Prayer team can read contact logs where prayer_request = true
CREATE POLICY "Prayer team can read prayer requests"
  ON contact_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'prayer_team'
      AND is_active = true
    )
    AND prayer_request = true
  );

-- Prayer team can update prayer_request_resolved on prayer request logs
CREATE POLICY "Prayer team can resolve prayer requests"
  ON contact_logs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'prayer_team'
      AND is_active = true
    )
    AND prayer_request = true
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'prayer_team'
      AND is_active = true
    )
  );

-- Allow admins to update their own assignments (to mark as completed)
CREATE POLICY "Admins can update own assignments"
  ON assignments FOR UPDATE
  USING (
    caller_id = auth.uid()
    AND is_admin()
  )
  WITH CHECK (
    caller_id = auth.uid()
  );

-- Allow admins to insert their own contact logs
CREATE POLICY "Admins can insert own logs"
  ON contact_logs FOR INSERT
  WITH CHECK (
    volunteer_id = auth.uid()
    AND is_admin()
  );

-- Allow admins to update their own contact logs (to edit notes)
CREATE POLICY "Admins can update own logs"
  ON contact_logs FOR UPDATE
  USING (
    volunteer_id = auth.uid()
    AND is_admin()
  )
  WITH CHECK (
    volunteer_id = auth.uid()
  );

-- Allow admins to insert new profiles (for creating volunteer accounts)
CREATE POLICY "Admins can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (is_admin());

-- Admins can insert contact logs on behalf of volunteers
CREATE POLICY "Admins can insert logs on behalf of volunteers"
  ON contact_logs FOR INSERT
  WITH CHECK (is_admin());

-- Admins can update contact logs on behalf of volunteers
CREATE POLICY "Admins can update logs on behalf of volunteers"
  ON contact_logs FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
