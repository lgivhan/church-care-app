-- Migration 005: Add heard_from to contact_logs
ALTER TABLE contact_logs ADD COLUMN IF NOT EXISTS heard_from BOOLEAN;
