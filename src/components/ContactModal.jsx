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
import { createClient } from "@supabase/supabase-js";

function getContactMethodOptions(member) {
  const options = [];
  if (member?.phone) {
    options.push({ value: "call", label: "📞 Phone Call" });
    options.push({ value: "text", label: "💬 Text Message" });
    options.push({ value: "voicemail", label: "📱 Voicemail" });
  }
  if (member?.email) {
    options.push({ value: "email", label: "✉️ Email" });
  }
  options.push({ value: "in_person", label: "🤝 In Person" });
  return options;
}

export default function ContactModal({
  assignment,
  existingLog,
  onClose,
  onSaved,
  userId,
}) {
  const member = assignment.members;
  const isEditing = !!existingLog;

  const [notes, setNotes] = useState(existingLog?.notes ?? "");
  const [needsFollowUp, setNeedsFollowUp] = useState(
    existingLog?.needs_follow_up ?? false,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contactMethod, setContactMethod] = useState(
    existingLog?.contact_method ?? "",
  );
  const [methodError, setMethodError] = useState(false);
  const [prayerRequest, setPrayerRequest] = useState(
    existingLog?.prayer_request ?? false,
  );
  const contactMethodOptions = getContactMethodOptions(member);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMethodError(false);

    if (!notes.trim()) {
      setError(
        "Please add a note before saving. Even a brief summary helps the pastoral team.",
      );
      setLoading(false);
      return;
    }

    if (!contactMethod) {
      setError("Please select how you contacted this person.");
      setMethodError(true);
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
      if (isEditing) {
        const { error: updateError } = await supabase
          .from("contact_logs")
          .update({
            notes,
            needs_follow_up: needsFollowUp,
            contact_method: contactMethod,
            prayer_request: prayerRequest,
          })
          .eq("id", existingLog.id);

        if (updateError) throw updateError;
      } else {
        console.log("A - starting else branch", Date.now());

        if (!userId) {
          clearTimeout(timeout);
          setLoading(false);
          setError(
            "Your session has expired. Please sign out and sign back in.",
          );
          return;
        }

        console.log("C - about to insert contact_log", Date.now());

        // Create a fresh Supabase client for this operation.
        // The shared client can get into a stale state after tab switching
        // causing fetch calls to hang indefinitely. A fresh client
        // bypasses this entirely.
        const freshClient = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY,
        );

        // Copy the current session into the fresh client
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          await freshClient.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
        }

        const { error: insertError } = await freshClient
          .from("contact_logs")
          .insert({
            member_id: assignment.member_id,
            volunteer_id: userId,
            assignment_id: assignment.id,
            notes,
            needs_follow_up: needsFollowUp,
            contact_method: contactMethod,
            prayer_request: prayerRequest,
            contacted_at: new Date().toISOString(),
          });

        console.log("D - insert done", Date.now());
        if (insertError) throw insertError;

        console.log("E - about to update assignment", Date.now());

        const { error: assignmentError } = await freshClient
          .from("assignments")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", assignment.id);

        console.log("F - update done", Date.now());
        if (assignmentError) throw assignmentError;
      }

      clearTimeout(timeout);
      onClose();
      onSaved();
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
            {/* Contact method dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                How did you contact this person?
                <span className="text-red-500 ml-1">*</span>
              </label>
              <select
                value={contactMethod}
                onChange={(e) => {
                  setContactMethod(e.target.value);
                  setMethodError(false);
                }}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  methodError
                    ? "border-red-400 bg-red-50 text-red-900"
                    : "border-gray-200"
                }`}
              >
                <option value="">Select a method...</option>
                {contactMethodOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {contactMethod === "voicemail" && (
                <p className="text-xs text-amber-600 mt-1">
                  Note: Voicemail means the member wasn't reached directly.
                  Consider flagging for follow-up below.
                </p>
              )}
            </div>
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

            {/* Prayer ministry request */}
            <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <input
                type="checkbox"
                id="prayer-request"
                checked={prayerRequest}
                onChange={(e) => setPrayerRequest(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <label
                htmlFor="prayer-request"
                className="text-sm text-blue-800 cursor-pointer"
              >
                <span className="font-medium">Prayer ministry request</span>
                <span className="block text-blue-600 text-xs mt-0.5">
                  Check this if this member would like the prayer ministry to
                  pray for them.
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
