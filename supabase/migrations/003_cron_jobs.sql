-- ============================================================
-- Church Care Contact App — pg_cron Scheduling
-- Run this in Supabase SQL Editor after deploying Edge Functions.
--
-- Two jobs:
--   1. syncMembersDaily     — runs every day at 8am UTC (3am EST)
--   2. generateWeeklyAssignments — runs every Sunday at 8am UTC (3am EST)
--
-- Both jobs use pg_net to make HTTP POST requests to the
-- deployed Edge Function URLs.
-- ============================================================


-- ============================================================
-- JOB 1: Daily member sync
-- Cron expression: '0 8 * * *' = every day at 8:00am UTC
-- ============================================================

SELECT cron.schedule(
  'sync-members-daily',           -- job name (unique identifier)
  '0 8 * * *',                    -- every day at 8am UTC
  $$
  SELECT net.http_post(
    url    := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/syncMembersDaily',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer YOUR_ANON_KEY'
    ),
    body   := '{}'::jsonb
  );
  $$
);


-- ============================================================
-- JOB 2: Weekly assignment generation
-- Cron expression: '0 8 * * 0' = every Sunday at 8:00am UTC
-- Day of week: 0 = Sunday in cron syntax
-- ============================================================

SELECT cron.schedule(
  'generate-weekly-assignments',  -- job name (unique identifier)
  '0 8 * * 5',                    -- every Friday at 4am EST
  $$
  SELECT net.http_post(
    url    := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/generateWeeklyAssignments',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer YOUR_ANON_KEY'
    ),
    body   := '{}'::jsonb
  );
  $$
);

