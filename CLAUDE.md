# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server (port 5173)
npm run build     # Production build
npm run lint      # ESLint
npm run preview   # Preview production build locally
```

There is no test suite. Verify changes manually via `npm run dev`.

For Edge Functions:

```bash
supabase functions serve   # Test Edge Functions locally
```

## Architecture

**Church Care** is a volunteer contact management app for churches. Volunteers are assigned members each week, complete contacts, and log notes. Admins monitor progress and manage follow-ups.

**Stack:** React 19 + Vite, Tailwind CSS, React Router 7, Supabase (auth, Postgres, Edge Functions).

### Three User Roles

- `volunteer` — sees their weekly assignments, logs contacts
- `admin` — full analytics, volunteer approval, follow-up management
- `prayer_team` — views and resolves prayer requests flagged by volunteers

### Data Flow

1. Planning Center (PCO) members sync daily via `syncMembersDaily` Edge Function → `members` table
2. Every Sunday at 3am EST, `generateWeeklyAssignments` Edge Function calls the SQL function `generate_weekly_assignments()` (round-robin distribution) → `assignments` table
3. Volunteers complete contacts → `contact_logs` table (immutable, no DELETE policy)
4. A trigger on `contact_logs` updates `members.last_contacted` automatically

### Key Scheduling

`supabase/migrations/003_cron_jobs.sql` defines pg_cron jobs that invoke Edge Functions. The `week_starting` column (Sunday `YYYY-MM-DD`) is the anchor for all assignment lookups. Use `getThisSunday()` from `src/lib/utils.js` for consistent week calculation.

### Auth & Routing

- `src/components/ProtectedRoute.jsx` guards all private pages: checks Supabase session, loads profile, redirects by role (`/dashboard`, `/admin`, `/prayer`)
- Unconfirmed or unapproved volunteers see a pending-approval screen rather than an empty dashboard
- Session uses localStorage persistence with Supabase auto-refresh; a 5-second timeout in ProtectedRoute redirects to login if loading stalls

### Database

Migrations live in `supabase/migrations/`:

- `001_initial_schema.sql` — tables, triggers, `generate_weekly_assignments()` SQL function
- `002_rls_policies.sql` — RLS via helper functions `is_admin()` / `is_active_volunteer()`
- `003_cron_jobs.sql` — pg_cron schedules

Row-level security means volunteers only see their own rows; never bypass RLS with the service role key in client code.

### Edge Functions

`supabase/functions/` contains Deno TypeScript functions. Secrets (Supabase service role key, PCO token) are stored only in Supabase secrets — never in Vercel env vars or client code.

### Environment Variables

Two vars required (set in `.env.local` locally, Vercel dashboard in production):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Deployment

Frontend → Vercel (SPA routing via `vercel.json` rewrite to `index.html`).
Backend → Supabase (database, Edge Functions, auth).
