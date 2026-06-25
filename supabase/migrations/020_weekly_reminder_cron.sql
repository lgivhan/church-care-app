-- Migration 020: Schedule weekly reminder emails to volunteers.
--
-- BEFORE running this migration you must complete three steps:
--
-- Step 1 — Generate a random secret (run this in your terminal):
--     openssl rand -base64 32
--
-- Step 2 — Store it as Supabase Edge Function secrets (terminal):
--     supabase secrets set CRON_SECRET=<your-generated-value>
--     supabase secrets set RESEND_API_KEY=<your-resend-api-key>
--     supabase secrets set RESEND_FROM_EMAIL="Church Care <noreply@churchcare.app>"
--
-- Step 3 — Store the CRON_SECRET in the Supabase vault so pg_cron
--     can retrieve it when calling the Edge Function. Run this in
--     the Supabase SQL Editor (replace with your actual secret value):
--
--     SELECT vault.create_secret('CRON_SECRET', '<your-generated-value>');
--
-- Then fill in YOUR_PROJECT_REF below (find it in your Supabase
-- project URL: https://<YOUR_PROJECT_REF>.supabase.co), and run
-- this migration.
-- ============================================================

-- Friday 8:30 AM UTC — new cycle email.
-- Fires weekly but self-skips if no assignments were generated today.
SELECT cron.schedule(
  'send-new-cycle-reminders',
  '30 8 * * 5',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sendWeeklyReminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'CRON_SECRET'
        LIMIT 1
      )
    ),
    body    := '{"type":"new_cycle"}'::jsonb
  )
  $$
);

-- Wednesday 8:00 AM UTC — pending contacts reminder.
-- Fires weekly but self-skips unless today is exactly 12 days into
-- an active cycle (the Wednesday before it wraps up on Friday).
SELECT cron.schedule(
  'send-pending-reminders',
  '0 8 * * 3',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sendWeeklyReminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'CRON_SECRET'
        LIMIT 1
      )
    ),
    body    := '{"type":"reminder"}'::jsonb
  )
  $$
);
