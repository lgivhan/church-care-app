-- Migration 023: "Update contact info" flag on contact logs
--
-- Volunteers can flag during a contact that the member's contact info
-- needs updating (e.g. disconnected phone, new address). Admins see the
-- flag in the History tab and tick it off once the info is corrected,
-- mirroring the prayer_request / needs_follow_up resolution pattern (014).
--
-- No RLS changes needed: volunteers already insert/update their own
-- logs, and admins have blanket UPDATE on contact_logs (002).

ALTER TABLE contact_logs
  ADD COLUMN update_contact_info       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN contact_info_resolved     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN contact_info_resolved_at  TIMESTAMPTZ,
  ADD COLUMN contact_info_resolved_by  UUID,
  ADD CONSTRAINT contact_logs_contact_info_resolved_by_fkey
    FOREIGN KEY (contact_info_resolved_by) REFERENCES profiles(id);
