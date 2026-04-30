# Church Care Contact App

A simple web application that helps your church ensure every member receives a weekly phone call or email from a volunteer. Volunteers log in, see who they need to contact, and record notes after each conversation. Administrators can track progress, approve new volunteers, and follow up on members who need extra pastoral attention.

---

## What This App Does

Every Sunday morning, the app automatically assigns up to 5 church members to each active volunteer. Volunteers log in, see their list of contacts for the week, and mark each one as complete after reaching out. If a member needs special follow-up (prayer request, health issue, etc.), the volunteer can flag them and the admin will see it immediately in the dashboard.

---

## Before You Begin

You will need accounts with the following services. All have free tiers that are sufficient for most churches:

- **Supabase** (supabase.com) — stores all the app data
- **Vercel** (vercel.com) — hosts the app online
- **Planning Center** (planningcenter.com) — your existing church management system
- **GitHub** (github.com) — stores the app code

If you are setting this up for the first time, ask your developer to walk you through creating these accounts.

---

## Environment Variables

Environment variables are secret configuration values the app needs to connect to your database and Planning Center. They should never be shared publicly or committed to GitHub.

You will need the following values:

| Variable                    | Where to Find It                                                     |
| --------------------------- | -------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`         | Supabase dashboard → Settings → API → Project URL                    |
| `VITE_SUPABASE_ANON_KEY`    | Supabase dashboard → Settings → API → anon public key                |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API → service_role key (keep secret) |
| `PCO_PERSONAL_ACCESS_TOKEN` | Planning Center → your profile → Developer → Personal Access Tokens  |

**For local development:** create a file called `.env.local` in the project root and add each variable on its own line:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**For Vercel:** go to your Vercel project → Settings → Environments and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The service role key and PCO token are stored in Supabase (see Deployment Steps below).

---

## Deployment Steps

Follow these steps in order. Do not skip ahead.

### Step 1 — Run the Database Schema

1. Log in to [supabase.com](https://supabase.com) and open your project
2. Click **SQL Editor** in the left sidebar
3. Click **New query**
4. Open the file `supabase/migrations/001_initial_schema.sql` from the project folder and paste its entire contents into the editor
5. Click **Run**
6. Repeat for `supabase/migrations/002_rls_policies.sql`
7. Repeat for `supabase/migrations/003_cron_jobs.sql` — but first, open the file and replace `YOUR_ANON_KEY` (appears twice) with your actual anon key from Supabase

### Step 2 — Enable Required Database Extensions

1. In Supabase, go to **Database → Extensions**
2. Search for and enable each of the following:
   - `pg_cron`
   - `pgcrypto`
   - `pg_net`

### Step 3 — Deploy Edge Functions

Edge Functions are small programs that run on Supabase's servers. They handle syncing members from Planning Center and generating weekly assignments.

Open your terminal and run the following commands from the project root folder:

```bash
# Log in to Supabase CLI
supabase login

# Link to your Supabase project (find your project ref in Supabase → Settings → General)
supabase link --project-ref YOUR_PROJECT_REF

# Deploy both functions
supabase functions deploy syncMembersDaily
supabase functions deploy generateWeeklyAssignments

# Set your Planning Center credentials (format: app_id:secret)
supabase secrets set PCO_PERSONAL_ACCESS_TOKEN=your_app_id:your_secret
```

### Step 4 — Configure Supabase Auth Settings

1. In Supabase, go to **Authentication → URL Configuration**
2. Set **Site URL** to your Vercel app URL (e.g. `https://church-care-app.vercel.app`)
3. Under **Redirect URLs**, add:
   - `https://church-care-app.vercel.app/**`
   - `http://localhost:5173/**` (for local development)
4. Click **Save**

### Step 5 — Deploy the Frontend to Vercel

1. Push your code to GitHub
2. Log in to [vercel.com](https://vercel.com)
3. Click **Add New → Project**
4. Select your `church-care-app` repository
5. Before clicking Deploy, scroll to **Environment Variables** and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Click **Deploy**
7. Once deployed, add a `vercel.json` file to your project root with the following contents and push again:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

This ensures page refreshes and sign-outs work correctly.

### Step 6 — Create the First Admin Account

1. Open your deployed app and click **Sign up**
2. Create an account with your email address
3. Confirm your email by clicking the link Supabase sends you
4. In Supabase, go to **SQL Editor** and run:

```sql
UPDATE profiles
SET role = 'admin', is_active = true
WHERE email = 'your-email@example.com';
```

Replace `your-email@example.com` with the email you signed up with. This gives you full admin access.

### Step 7 — Run Your First Member Sync

In your terminal, run:

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/syncMembersDaily \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

This pulls all active members from Planning Center into the app. It will run automatically every day after this, but you need to run it once manually to get started.

---

## How to Invite Volunteers

1. Share the app URL with your volunteers
2. Ask them to click **Sign up** and create an account using their name, email, and a password
3. They will receive a confirmation email — they must click the link before they can log in
4. Once confirmed, they will see a **"Your account is pending approval"** screen until you approve them

---

## How to Approve Volunteers

1. Log in to the app as an admin
2. If there are volunteers waiting for approval, you will see an orange alert at the top of the page showing how many are pending
3. Click the alert to go to the Volunteers tab
4. Click **Approve** next to each volunteer's name
5. The volunteer will immediately receive their first set of contacts for the current week

To **deactivate** a volunteer (for example, if they are no longer able to participate):

1. Go to the **Volunteers** tab in the admin dashboard
2. Click **Deactivate** next to their name
3. They will be excluded from future assignments but their contact history is preserved

---

## How to Manually Trigger a Sync or Assignment Generation

In most cases, syncing and assignment generation happen automatically. However, you can trigger them manually if needed.

### Manually sync members from Planning Center

Run this command in your terminal:

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/syncMembersDaily \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

Or go to **Supabase dashboard → Edge Functions → syncMembersDaily → Invoke**.

### Manually generate weekly assignments

Run this in the Supabase SQL Editor:

```sql
SELECT generate_weekly_assignments();
```

This is useful if you approve a new volunteer mid-week and want to assign them contacts immediately, or if the automatic Sunday job did not run for any reason.

---

## How to Flag a Member for Follow-up

Volunteers can flag a member during the contact logging process by checking the **"Flag for follow-up"** checkbox before saving their notes. Flagged members appear in the **Follow-ups** tab of the admin dashboard so pastoral staff can give them additional attention.

---

## How to Remove a Member from Contacts

To stop a member from being assigned to volunteers:

1. Log in to Planning Center
2. Find the member and set their **Profile Status** to **Inactive**
3. The next daily sync (or a manual sync) will remove them from the contact pool automatically

Children and teenagers are automatically excluded from assignments based on their membership type in Planning Center. No manual action is needed for them.

---

## Keeping Planning Center Up to Date

The app syncs with Planning Center every day at 3am EST. For the app to work correctly:

- Every member should have a **Membership Type** assigned in Planning Center
- Members who have moved away, passed away, or are no longer part of the church should be set to **Inactive** in Planning Center
- Children should have a membership type that includes the word "Child" or "Teen" — the app uses this to exclude them from volunteer assignments

---

## Scheduled Jobs

The following jobs run automatically:

| Job                  | Schedule                | What it does                               |
| -------------------- | ----------------------- | ------------------------------------------ |
| Sync members         | Every day at 3am EST    | Pulls active members from Planning Center  |
| Generate assignments | Every Sunday at 3am EST | Assigns members to volunteers for the week |

If either job fails, you will not see an error in the app — check **Supabase → Database → pg_cron → job_run_details** for logs.

---

## Troubleshooting

**Volunteers see "No contacts assigned yet this week"**
Assignments may not have generated yet. Run `SELECT generate_weekly_assignments();` in the Supabase SQL Editor.

**A volunteer's account is stuck on "pending approval"**
Go to the admin dashboard → Volunteers tab and click Approve next to their name.

**Members from Planning Center are not showing up**
Run the manual sync command or check that the `PCO_PERSONAL_ACCESS_TOKEN` secret is correctly set in Supabase.

**A member is showing up who should not be contacted**
Set them to Inactive in Planning Center and run a manual sync.

**The app is showing an error after I deployed a change**
Go to Vercel → Deployments and check the build log for errors. Make sure all environment variables are correctly set.

---

## Project Overview

| Component      | Technology                  | Purpose                                              |
| -------------- | --------------------------- | ---------------------------------------------------- |
| Frontend       | React + Vite + Tailwind CSS | Volunteer and admin web interface                    |
| Database       | Supabase (PostgreSQL)       | Stores members, assignments, and contact logs        |
| Auth           | Supabase Auth               | Handles login, signup, and password reset            |
| Sync           | Supabase Edge Functions     | Pulls data from Planning Center API                  |
| Scheduling     | pg_cron                     | Runs daily sync and weekly assignments automatically |
| Hosting        | Vercel                      | Serves the web app publicly                          |
| Source control | GitHub                      | Stores and versions the code                         |

---

\*Built with care for Dover First SDA Church.
