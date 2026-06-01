-- Migration 010: Allow admins to delete assignments
--
-- Needed so that excluding a contact mid-cycle immediately removes their
-- pending assignment from the current cycle, rather than waiting for the
-- next cycle generation.

CREATE POLICY "Admins can delete assignments"
  ON assignments FOR DELETE
  USING (is_admin());
