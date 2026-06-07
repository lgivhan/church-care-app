-- Migration 014: Track who resolved a prayer request or follow-up, and when.

ALTER TABLE contact_logs
  ADD COLUMN IF NOT EXISTS prayer_resolved_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prayer_resolved_by       UUID,
  ADD CONSTRAINT contact_logs_prayer_resolved_by_fkey
    FOREIGN KEY (prayer_resolved_by) REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS follow_up_resolved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_resolved_by    UUID,
  ADD CONSTRAINT contact_logs_follow_up_resolved_by_fkey
    FOREIGN KEY (follow_up_resolved_by) REFERENCES profiles(id);
