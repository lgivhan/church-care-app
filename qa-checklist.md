# Church Care Contact App — QA Checklist

Use this checklist to verify the app is working correctly end-to-end after deployment.
Mark each item ✅ when confirmed or ❌ if something needs fixing.

---

## 1. Environment Variables

- [ ] `VITE_SUPABASE_URL` is set correctly in Vercel (no trailing slash, no `/rest/v1`)
- [ ] `VITE_SUPABASE_ANON_KEY` is set correctly in Vercel
- [ ] `PCO_PERSONAL_ACCESS_TOKEN` is set in Supabase secrets (`supabase secrets list`)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` appears in Supabase secrets (auto-injected)
- [ ] `.env.local` exists locally and is NOT committed to GitHub (`git status` should not show it)

---

## 2. Database

- [ ] All four tables exist: `profiles`, `members`, `assignments`, `contact_logs`
  ```sql
  SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
  ```
- [ ] RLS is enabled on all four tables
  ```sql
  SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
  ```
- [ ] All 12 RLS policies exist
  ```sql
  SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
  ```
- [ ] `members` table has `membership_type` column
  ```sql
  SELECT column_name FROM information_schema.columns WHERE table_name = 'members';
  ```
- [ ] `generate_weekly_assignments()` function exists
  ```sql
  SELECT routine_name FROM information_schema.routines WHERE routine_name = 'generate_weekly_assignments';
  ```
- [ ] Both triggers exist: `on_auth_user_created`, `on_contact_log_inserted`
  ```sql
  SELECT trigger_name FROM information_schema.triggers;
  ```

---

## 3. Planning Center Sync

- [ ] Manual sync runs successfully
  ```bash
  curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/syncMembersDaily \
    -H "Authorization: Bearer YOUR_ANON_KEY"
  ```
  Expected response: `{"success":true,"total_fetched":...}`
- [ ] Members table is populated after sync
  ```sql
  SELECT COUNT(*) FROM members;
  ```
- [ ] `membership_type` is populated for most members
  ```sql
  SELECT membership_type, COUNT(*) FROM members GROUP BY membership_type ORDER BY count DESC;
  ```
- [ ] Children and teens are present in members table but will be excluded from assignments
  ```sql
  SELECT first_name, last_name, membership_type FROM members
  WHERE membership_type ILIKE '%child%' OR membership_type ILIKE '%teen%';
  ```
- [ ] No members with both null email and null phone are being assigned
  ```sql
  SELECT COUNT(*) FROM members WHERE email IS NULL AND phone IS NULL;
  ```

---

## 4. Supabase Auth — Signup and Login

- [ ] Signup form appears when clicking "Sign up" on login page
- [ ] Confirm password field appears on signup form
- [ ] Mismatched passwords show an error message, do not submit
- [ ] Successful signup shows "Check your email" screen with correct email address
- [ ] Confirmation email is received and clicking the link confirms the account
- [ ] New account has `role = 'volunteer'` and `is_active = false` in profiles table
  ```sql
  SELECT full_name, email, role, is_active FROM profiles ORDER BY created_at DESC LIMIT 5;
  ```
- [ ] Logging in with an unconfirmed email shows an appropriate error
- [ ] Logging in with wrong password shows an appropriate error
- [ ] "Forgot your password?" link appears on login form
- [ ] Entering email and clicking "Forgot your password?" sends a reset email
- [ ] Clicking reset link shows "Set New Password" screen
- [ ] Setting a new password redirects to login with success message
- [ ] Logging in with new password works correctly

---

## 5. Volunteer Approval Flow

- [ ] New unconfirmed volunteer sees "Your account is pending approval" screen after login
- [ ] Admin sees orange pending volunteers alert when volunteers are waiting
- [ ] Clicking alert scrolls to Volunteers tab
- [ ] Approve button sets `is_active = true` in profiles table
  ```sql
  SELECT full_name, is_active FROM profiles WHERE role = 'volunteer';
  ```
- [ ] Approved volunteer is automatically assigned contacts for the current week
- [ ] Deactivate button shows confirmation dialog before deactivating
- [ ] Deactivated volunteer is excluded from future assignment generation
- [ ] Deactivated volunteer's contact history is preserved in `contact_logs`

---

## 6. Weekly Assignment Generation

- [ ] Manual assignment generation runs without error
  ```sql
  SELECT generate_weekly_assignments();
  ```
- [ ] Assignments are created for all active volunteers
  ```sql
  SELECT p.full_name, COUNT(*) as assigned
  FROM assignments a JOIN profiles p ON p.id = a.caller_id
  WHERE a.week_starting = (date_trunc('week', CURRENT_DATE + INTERVAL '1 day') - INTERVAL '1 day')::DATE
  GROUP BY p.full_name;
  ```
- [ ] No member is assigned to more than one volunteer in the same week
  ```sql
  SELECT member_id, week_starting, COUNT(*) FROM assignments
  GROUP BY member_id, week_starting HAVING COUNT(*) > 1;
  ```
  Expected: zero rows
- [ ] No child or teen members are assigned
  ```sql
  SELECT a.member_id, m.first_name, m.last_name, m.membership_type
  FROM assignments a JOIN members m ON m.id = a.member_id
  WHERE m.membership_type ILIKE '%child%' OR m.membership_type ILIKE '%teen%';
  ```
  Expected: zero rows
- [ ] No members with no contact info are assigned
  ```sql
  SELECT a.member_id FROM assignments a JOIN members m ON m.id = a.member_id
  WHERE m.email IS NULL AND m.phone IS NULL;
  ```
  Expected: zero rows
- [ ] Running generation twice in one week does not duplicate assignments (idempotent)
  ```sql
  SELECT generate_weekly_assignments(); -- run twice
  SELECT COUNT(*) FROM assignments WHERE week_starting = CURRENT_DATE; -- count should not double
  ```
- [ ] `week_starting` is always a Sunday
  ```sql
  SELECT DISTINCT week_starting, EXTRACT(DOW FROM week_starting) AS day_of_week FROM assignments;
  ```
  Expected: `day_of_week = 0` (Sunday) for all rows

---

## 7. Volunteer Dashboard

- [ ] Volunteer is redirected to `/dashboard` after login
- [ ] Weekly assignment cards appear for the current week
- [ ] Each card shows member name, phone, email
- [ ] Birthday appears on cards where available, hidden where not
- [ ] Membership type badge appears on each card with correct label and color
- [ ] Call link opens phone dialer
- [ ] Text link opens SMS app
- [ ] Email link opens email client
- [ ] Member with no contact info shows "No contact details on file"
- [ ] "Complete Contact" button opens the contact modal
- [ ] Modal shows member name as subtitle
- [ ] Submitting modal without notes shows validation error
- [ ] Submitting modal with notes marks assignment as completed
- [ ] Completed card shows green "Contacted" badge
- [ ] Progress bar updates correctly as contacts are completed
- [ ] "Edit Notes" button on completed card reopens modal with existing notes pre-filled
- [ ] Editing notes saves correctly
- [ ] "Flag for follow-up" checkbox works and saves to database
- [ ] Empty state message appears if volunteer has no assignments
- [ ] Sign out button works and redirects to login
- [ ] Complete Contact modal shows the dropdown with only relevant options (no Call/Text/Voicemail if member has no phone)
- [ ] Submitting without selecting a method shows error and highlights dropdown red
- [ ] Voicemail shows the follow-up suggestion note
- [ ] Saving works correctly with a method selected
- [ ] Edit Notes modal pre-fills the previously selected method

---

## 8. Admin Dashboard

- [ ] Admin is redirected to `/admin` after login
- [ ] All six tabs are visible: Overview, Assignments, Members, Volunteers, Contact History, Follow-ups
- [ ] Pending volunteers alert appears when volunteers are waiting
- [ ] Alert shows correct count of pending volunteers
- [ ] Clicking alert navigates to Volunteers tab and scrolls to pending section
- [ ] Admin Contact History tab shows Method column
- [ ] Admin Follow-ups tab shows Method column
- [ ] Existing logs without a method show — in the Method column

**Overview tab:**

- [ ] Stat cards show correct counts for assigned, completed, pending, follow-ups
- [ ] Members with no contact info warning appears if applicable

**Assignments tab:**

- [ ] All assignments for selected week are shown
- [ ] Volunteer name and member name are correct
- [ ] Status shows correctly as Pending or Completed
- [ ] Completed timestamp shows for completed assignments
- [ ] Week selector changes displayed assignments

**Members tab:**

- [ ] All members are listed
- [ ] Membership type badges show correct labels and colors
- [ ] Members with no contact info are highlighted in orange

**Volunteers tab:**

- [ ] All active volunteers are listed
- [ ] Assigned and completed counts are correct for selected week
- [ ] Volunteers with assignments but zero completions are highlighted in red
- [ ] Approve button works for pending volunteers
- [ ] Deactivate button shows confirmation and works correctly
- [ ] Week selector changes displayed activity

**Contact History tab:**

- [ ] All contact logs are shown (most recent first)
- [ ] Member name, volunteer name, notes, and date are correct
- [ ] Follow-up flag is visible where applicable

**Follow-ups tab:**

- [ ] Only members flagged as needing follow-up are shown
- [ ] Badge count on tab shows correct number
- [ ] Member name, volunteer name, notes, and date are correct

- [ ] Sign out button works and redirects to login

---

## 9. RLS Policy Verification

- [ ] Volunteer cannot read another volunteer's assignments
  - Log in as volunteer A, note their `user id`
  - In Supabase SQL Editor, check that querying assignments for volunteer B returns nothing when authenticated as A
- [ ] Volunteer cannot update their own `role` or `is_active` field
  - Attempt via browser console:
  ```javascript
  const { data, error } = await supabase
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", "your-user-id");
  console.log(error); // should show RLS error
  ```
- [ ] Volunteer cannot read contact logs belonging to another volunteer
- [ ] Volunteer cannot delete contact logs
  ```javascript
  const { error } = await supabase
    .from("contact_logs")
    .delete()
    .eq("id", "any-log-id");
  console.log(error); // should show RLS error
  ```
- [ ] Unauthenticated user gets no data from any table
  - Sign out, then in browser console attempt a query — should return empty or error

---

## 10. pg_cron Scheduling

- [ ] Both cron jobs exist in the database
  ```sql
  SELECT jobname, schedule, active FROM cron.job ORDER BY jobid;
  ```
  Expected:
  - `sync-members-daily` | `0 8 * * *` | `true`
  - `generate-weekly-assignments` | `0 8 * * 0` | `true`
- [ ] After first scheduled run, check execution logs
  ```sql
  SELECT jobid, status, return_message, start_time
  FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
  ```
  Expected: `status = 'succeeded'` for both jobs

---

## 11. Deployment

- [ ] App loads correctly at Vercel URL
- [ ] Login page appears at `/login`
- [ ] Navigating to `/` redirects to `/login`
- [ ] Navigating to `/dashboard` without a session redirects to `/login`
- [ ] Navigating to `/admin` without a session redirects to `/login`
- [ ] Page refresh on `/dashboard` keeps the user logged in
- [ ] Page refresh on `/admin` keeps the user logged in
- [ ] Sign out on Vercel URL redirects correctly to `/login` (not a 404)
- [ ] Vercel auto-deploys when pushing to `main` branch on GitHub

---

## 12. Post-Deployment Smoke Test

Run through this quick end-to-end flow on the live Vercel URL:

1. [ ] Sign up as a new volunteer
2. [ ] Confirm email
3. [ ] Log in — see pending approval screen
4. [ ] Log in as admin — see pending volunteer alert
5. [ ] Approve the volunteer
6. [ ] Log out as admin
7. [ ] Log in as volunteer — see assigned contacts
8. [ ] Complete one contact with notes
9. [ ] Flag one contact for follow-up
10. [ ] Log in as admin — see completed assignment and follow-up flag
11. [ ] Check Follow-ups tab — flagged member appears
12. [ ] Sign out — redirects to login cleanly
