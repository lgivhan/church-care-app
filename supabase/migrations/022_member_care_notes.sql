-- Migration 022: Admin care notes on members
--
-- Lets admins attach a note to a member (e.g. "cannot receive text
-- messages") that surfaces in the contact modal for whoever is
-- assigned to that member.
--
-- Like excluded_from_assignments (009), this column is intentionally
-- absent from the syncMembersDaily upsert payload, so it survives
-- daily PCO syncs.
--
-- No RLS changes needed:
--   - "Admins can update member exclusion" (009) is a blanket
--     is_admin() UPDATE policy on members, so admins can write this.
--   - Volunteers already SELECT all member columns for their
--     assignment cards.

ALTER TABLE members
  ADD COLUMN care_note TEXT;
