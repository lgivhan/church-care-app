-- Migration 024: Allow admins to update any assignment
--
-- Needed so an admin can reassign a volunteer's pending contacts to
-- themselves from the Participants tab. The existing
-- "Admins can update own assignments" policy only covers rows where
-- caller_id = auth.uid(), which excludes the volunteer's rows being
-- taken over.

CREATE POLICY "Admins can update all assignments"
  ON assignments FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
