-- Migration 016: Fix weekly assignment generation cron job.
--
-- Root cause: the pg_cron job was calling the generateWeeklyAssignments
-- Edge Function with the anon key as the Bearer token. The Edge Function's
-- auth check rejects anything that isn't the service role key or a valid
-- admin JWT, so every Friday the call returned 401 and no assignments
-- were generated.
--
-- Fix: bypass the Edge Function entirely. pg_cron can call the SQL
-- function directly, which is simpler, has no auth surface, and removes
-- the network hop as a failure point. The Edge Function is kept for
-- manual triggers from the Supabase dashboard.

SELECT cron.unschedule('generate-weekly-assignments');

SELECT cron.schedule(
  'generate-weekly-assignments',
  '0 8 * * 5',
  'SELECT generate_weekly_assignments()'
);
