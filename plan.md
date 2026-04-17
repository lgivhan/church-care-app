# Church Care Contact App — Build Progress

## Quick Reference

- **Supabase Project:** `oalianolefwfpusfsgnv`
- **Repo:** `github.com/lgivhan/church-care-app`
- **Stack:** React + Vite, Tailwind CSS v3, Supabase, Vercel

---

## Overall Progress

### ✅ Step 1 — Supabase Project Setup

- Created Supabase project
- Enabled extensions: `pg_cron`, `pgcrypto`, `pg_net`

### ✅ Step 2 — PostgreSQL Schema, Trigger, and SQL Function

- Created tables: `profiles`, `members`, `assignments`, `contact_logs`
- Auto-create profile trigger on signup (`handle_new_user`)
- `generate_weekly_assignments()` SQL function (round-robin, Sunday-anchored)
- `update_member_last_contacted()` trigger on contact log insert
- **Note:** Schema lives in `supabase/migrations/001_initial_schema.sql`

### ✅ Step 3 — Row Level Security Policies

- RLS enabled on all four tables
- Helper functions: `is_admin()`, `is_active_volunteer()`
- Volunteers locked out until `is_active = true`
- No DELETE policy on `contact_logs` (history is permanent)
- **Note:** Policies live in `supabase/migrations/002_rls_policies.sql`

### ✅ Step 4 — Edge Function: `syncMembersDaily`

- Fetches all members from Planning Center API (paginated)
- Upserts into `members` table including birthday
- Handles primary email/phone fallback logic
- Deployed to Supabase, `PCO_PERSONAL_ACCESS_TOKEN` secret set

### ✅ Step 5 — Edge Function: `generateWeeklyAssignments`

- Thin wrapper that calls `generate_weekly_assignments()` SQL function
- Idempotent — safe to call multiple times
- Deployed to Supabase

### ✅ Step 6 — pg_cron Scheduling

- Daily sync: `syncMembersDaily` every day at 8am UTC (3am EST)
- Weekly assignments: `generateWeeklyAssignments` every Sunday at 8am UTC
- **Note:** Cron SQL in `supabase/migrations/003_cron_jobs.sql`

### ✅ Step 7 — React Project Scaffolding

- Vite + React scaffolded into project root
- Tailwind CSS v3 configured
- `@supabase/supabase-js` and `react-router-dom` installed
- `.env.local` created (gitignored), `.env.example` committed
- Supabase client in `src/lib/supabaseClient.js`
- Shared date utility in `src/lib/dateUtils.js`

### ✅ Step 8 — Auth: Login and Signup Page

- Single `/login` page with login/signup toggle
- Confirm password field on signup
- Email confirmation required before login
- Pending approval screen for inactive volunteers
- Role-based redirect: admin → `/admin`, volunteer → `/dashboard`
- Session persisted across browser closes

### ✅ Step 9 — Volunteer Dashboard

- Weekly assignment cards with member name, phone, email, birthday
- Call, Text, and Email action links
- Complete Contact button opens modal
- Notes required before saving (validation on submit)
- Follow-up flag checkbox
- Edit Notes button reopens modal pre-filled
- Progress bar showing contacts completed
- Empty state message if no assignments
- Sign out button

### ✅ Step 10 — Admin Dashboard

- Tabbed layout: Overview, Assignments, Members, Volunteers, History, Follow-ups
- Pending volunteers alert with scroll-to behavior
- Week selector (last 8 weeks)
- Approve volunteer → auto-generates assignments for current week
- Deactivate volunteer with confirmation dialog
- Zero-completion volunteers highlighted in red
- Members with no contact info flagged and excluded from assignments
- Follow-up flags surfaced in dedicated tab
- Sign out button

---

## 🚧 In Progress

### Step 10b — Planning Center List/Tag Integration

**Why:** Filter out children from assignments; show member type on volunteer cards.

**Planned changes:**

- [ ] Add `member_type TEXT` column to `members` table
- [ ] Update `syncMembersDaily` to fetch PCO list memberships
- [ ] Update `generate_weekly_assignments()` to exclude children
- [ ] Show member type badge on volunteer dashboard contact cards
- [x] Generate contacts for volunteers when they are activated

**Blocked on:** Confirming exact list names in Planning Center account

---

## 📋 Remaining Steps

### Step 11 — Deployment

- Run SQL schema via Supabase SQL Editor (already done for dev)
- Deploy Edge Functions via Supabase CLI (already done for dev)
- Set environment variables in Vercel
- Deploy frontend to Vercel (connect GitHub repo)

### Step 12 — README.md

- Non-technical language for church administrator
- Cover: setup, env vars, deployment, inviting volunteers, approving volunteers,
  manually triggering sync or assignment generation

### Step 13 — QA Checklist

- End-to-end verification of all features
- RLS policy verification
- Deployment smoke test

---

## Known Issues / Pending Fixes

- [ ] Sign out button intermittently not working (investigate session state)
- [ ] Confirm Planning Center list names before building tag sync
- [ ] On volunteer page, make people who are contacted go to bottom of list instead of staying at top
- [ ] In admin page, stop showing PC id

## Key Decisions Made

- Week starts on **Sunday** (not Monday)
- Admins and volunteers are **separate accounts** (no dual role)
- Members with **no contact info** are excluded from assignments
- Contact notes are **required** before marking a contact complete
- Contact history is **permanent** — no one can delete logs
- Email confirmation is **on** — users confirm email before logging in
- New volunteers are **auto-assigned** contacts when approved by admin
- **Tailwind v3** used (v4 incompatible with current config approach)

## File Structure

```
church-care-app/
├── src/
│   ├── components/
│   │   ├── AdminDashboard.jsx
│   │   ├── ContactModal.jsx
│   │   ├── LoginPage.jsx
│   │   ├── MemberCard.jsx
│   │   ├── ProtectedRoute.jsx
│   │   └── VolunteerDashboard.jsx
│   ├── lib/
│   │   ├── dateUtils.js
│   │   └── supabaseClient.js
│   ├── App.jsx
│   └── main.jsx
├── supabase/
│   ├── functions/
│   │   ├── syncMembersDaily/index.ts
│   │   └── generateWeeklyAssignments/index.ts
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_rls_policies.sql
│       └── 003_cron_jobs.sql
├── .env.local          (gitignored)
├── .env.example        (committed)
├── tailwind.config.js
├── vite.config.js
└── package.json
```

## Useful Commands

```bash
# Run dev server
npm run dev

# Deploy edge functions
supabase functions deploy syncMembersDaily
supabase functions deploy generateWeeklyAssignments

# Manually trigger sync
curl -X POST https://oalianolefwfpusfsgnv.supabase.co/functions/v1/syncMembersDaily \
  -H "Authorization: Bearer YOUR_ANON_KEY"

# Manually trigger assignment generation
curl -X POST https://oalianolefwfpusfsgnv.supabase.co/functions/v1/generateWeeklyAssignments \
  -H "Authorization: Bearer YOUR_ANON_KEY"

# Manually generate assignments via SQL (for testing)
SELECT generate_weekly_assignments();

# Check assignment counts by volunteer
SELECT a.week_starting, p.full_name, COUNT(*) as assigned_count
FROM assignments a
JOIN profiles p ON p.id = a.caller_id
GROUP BY a.week_starting, p.full_name
ORDER BY a.week_starting DESC;

# View contact logs
SELECT cl.notes, cl.needs_follow_up, cl.contacted_at,
       m.first_name, m.last_name, p.full_name AS volunteer_name
FROM contact_logs cl
JOIN members m ON m.id = cl.member_id
JOIN profiles p ON p.id = cl.volunteer_id
ORDER BY cl.contacted_at DESC;
```
