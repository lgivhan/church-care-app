-- Migration 027: Fix broken weekly reminder emails.
--
-- Two compounding bugs found while investigating why reminder emails
-- "have never worked":
--
-- 1. send-new-cycle-reminders (Friday 8:30 AM UTC) was created with the
--    literal 'YOUR_PROJECT_REF' placeholder from migration 020 still in
--    its URL, left unreplaced. Every firing since it was created has been
--    a POST to a nonexistent host -- this job has never once reached the
--    Edge Function.
--
-- 2. sendWeeklyReminders previously emailed volunteers one at a time in a
--    sequential loop. With enough active volunteers, total wall-clock
--    time exceeded pg_net's 5s default timeout, so even
--    send-pending-reminders (which had the correct URL) could time out
--    from pg_cron's perspective. The Edge Function itself was fixed
--    separately (supabase/functions/sendWeeklyReminders/index.ts) to send
--    in parallel; this migration also raises pg_net's timeout as headroom
--    for future volunteer growth.

SELECT cron.unschedule('send-new-cycle-reminders');
SELECT cron.unschedule('send-pending-reminders');

SELECT cron.schedule(
  'send-new-cycle-reminders',
  '30 8 * * 5',
  $$
  SELECT net.http_post(
    url     := 'https://oalianolefwfpusfsgnv.supabase.co/functions/v1/sendWeeklyReminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'CRON_SECRET'
        LIMIT 1
      )
    ),
    body               := '{"type":"new_cycle"}'::jsonb,
    timeout_milliseconds := 15000
  )
  $$
);

SELECT cron.schedule(
  'send-pending-reminders',
  '0 8 * * 3',
  $$
  SELECT net.http_post(
    url     := 'https://oalianolefwfpusfsgnv.supabase.co/functions/v1/sendWeeklyReminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'CRON_SECRET'
        LIMIT 1
      )
    ),
    body               := '{"type":"reminder"}'::jsonb,
    timeout_milliseconds := 15000
  )
  $$
);
