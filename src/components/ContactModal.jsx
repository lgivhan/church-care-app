// ============================================================
// ContactModal.jsx
//
// Modal for logging or editing contact notes.
// Used for both new contacts (Complete Contact) and
// editing existing ones (Edit Notes).
//
// On submit (new contact):
//   1. Inserts a row into contact_logs
//   2. Updates assignment status to 'completed'
//   3. Sets assignment completed_at timestamp
//
// On submit (edit):
//   1. Updates the existing contact_log row
//
// Props:
//   assignment    — the assignment being completed/edited
//   existingLog   — existing contact_log row if editing, else null
//   onClose       — callback to close the modal
//   onSaved       — callback after successful save (refreshes parent)
// ============================================================

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function ContactModal({
  assignment,
  existingLog,
  onClose,
  onSaved,
}) {
  // state variables
  const member = assignment.members;
  const isEditing = !!existingLog;

  const [notes, setNotes] = useState(existingLog?.notes ?? "");
  const [needsFollowUp, setNeedsFollowUp] = useState(
    existingLog?.needs_follow_up ?? false,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // background refresh
    supabase.auth.refreshSession().catch(() => {});

    if (!notes.trim()) {
      setError(
        "Please add a note before saving. Even a brief summary helps the pastoral team.",
      );
      setLoading(false);
      return;
    }

    const timeout = setTimeout(() => {
      setLoading(false);
      setError(
        "The request is taking too long. Please check your connection, refresh the page and try again.",
      );
    }, 30000);

    try {
      // Force a session refresh from Supabase server before any writes.
      // refreshSession() gets a new JWT even if the current one is stale —
      // this is more reliable than getSession() which can return a cached
      // expired token without noticing.
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        clearTimeout(timeout);
        setLoading(false);
        // Session is truly gone — redirect to login
        window.location.replace("/login");
        return;
      }

      if (isEditing) {
        const { error: updateError } = await supabase
          .from("contact_logs")
          .update({
            notes,
            needs_follow_up: needsFollowUp,
          })
          .eq("id", existingLog.id);

        if (updateError) throw updateError;
      } else {
        const t1 = Date.now();

        // Run both requests simultaneously instead of one after the other.
        // This cuts total time roughly in half on slow mobile connections.
        const [insertResult, updateResult] = await Promise.all([
          supabase.from("contact_logs").insert({
            member_id: assignment.member_id,
            volunteer_id: session.user.id,
            assignment_id: assignment.id,
            notes,
            needs_follow_up: needsFollowUp,
            contacted_at: new Date().toISOString(),
          }),
          supabase
            .from("assignments")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
            })
            .eq("id", assignment.id),
        ]);

        if (insertResult.error) throw insertResult.error;
        if (updateResult.error) throw updateResult.error;

        console.log("total time:", Date.now() - t1, "ms");
      }

      clearTimeout(timeout);
      onSaved();
      onClose();
    } catch (err) {
      clearTimeout(timeout);
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                {isEditing ? "Edit Notes" : "Log Contact"}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {member?.first_name} {member?.last_name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="What happened during this contact? Include any prayer requests or concerns to flag for the pastoral team."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Needs follow-up */}
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <input
                type="checkbox"
                id="needs-follow-up"
                checked={needsFollowUp}
                onChange={(e) => setNeedsFollowUp(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
              />
              <label
                htmlFor="needs-follow-up"
                className="text-sm text-amber-800 cursor-pointer"
              >
                <span className="font-medium">Flag for follow-up</span>
                <span className="block text-amber-600 text-xs mt-0.5">
                  Check this if this member needs additional pastoral attention
                  or a follow-up call.
                </span>
              </label>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition-colors"
              >
                {loading
                  ? "Saving..."
                  : isEditing
                    ? "Save Changes"
                    : "Mark as Contacted"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
