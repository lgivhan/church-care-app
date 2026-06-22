-- Migration 019: Add avatar_url column to members table.
--
-- Planning Center stores a profile photo URL on each Person record.
-- This column is populated (and refreshed) by the syncMembersDaily
-- Edge Function. It is intentionally included in the daily upsert
-- so the URL stays current.

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
