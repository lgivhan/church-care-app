-- Migration 015: Add paper_only flag to members.
-- Local-only setting (not overwritten by PCO sync).
-- When true, volunteers should contact this member by mail only.

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS paper_only BOOLEAN NOT NULL DEFAULT false;
