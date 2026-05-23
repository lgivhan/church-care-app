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
import { supabase, getAccessToken } from "../lib/supabaseClient";

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
  if (member?.address) {
    options.push({ value: "snail_mail", label: "📬 Snail Mail" });
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
  onBehalfOf = null,
  loggedById = null,
}) {
  const member = assignment.members;
  const isEditing = !!existingLog;

  const [notes, setNotes] = useState(existingLog?.notes ?? "");
  const [needsFollowUp, setNeedsFollowUp] = useState(
    existingLog?.needs_follow_up ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contactMethod, setContactMethod] = useState(
    existingLog?.contact_method ?? "",
  );
  const [methodError, setMethodError] = useState(false);
  const [prayerRequest, setPrayerRequest] = useState(
    existingLog?.prayer_request ?? null,
  );
  const [heardFrom, setHeardFrom] = useState(existingLog?.heard_from ?? null);
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

    if (heardFrom === null) {
      setError("Please indicate whether you heard back from this person.");
      setLoading(false);
      return;
    }

    if (needsFollowUp === null) {
      setError("Please indicate whether this person needs a follow-up.");
      setLoading(false);
      return;
    }

    if (prayerRequest === null) {
      setError("Please indicate whether this person has a prayer request.");
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
      const logPayload = {
        notes,
        needs_follow_up: needsFollowUp,
        contact_method: contactMethod,
        prayer_request: prayerRequest,
        heard_from: heardFrom,
      };

      if (isEditing) {
        const { error: updateError } = await supabase
          .from("contact_logs")
          .update(logPayload)
          .eq("id", existingLog.id);

        if (updateError) throw updateError;
      } else {
        if (!userId) {
          clearTimeout(timeout);
          setLoading(false);
          setError(
            "Your session has expired. Please sign out and sign back in.",
          );
          return;
        }

        const contactedAt = new Date().toISOString();

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/contact_logs`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${getAccessToken() ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              Prefer: "return=minimal",
            },
            body: JSON.stringify({
              member_id: assignment.member_id,
              volunteer_id: onBehalfOf?.id ?? userId,
              assignment_id: assignment.id,
              contacted_at: contactedAt,
              ...(loggedById ? { logged_by: loggedById } : {}),
              ...logPayload,
            }),
          },
        );

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Insert failed: ${errText}`);
        }

        const assignmentResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/assignments?id=eq.${assignment.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${getAccessToken() ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              Prefer: "return=minimal",
            },
            body: JSON.stringify({
              status: "completed",
              completed_at: contactedAt,
            }),
          },
        );

        if (!assignmentResponse.ok) {
          const errText = await assignmentResponse.text();
          throw new Error(`Assignment update failed: ${errText}`);
        }

        clearTimeout(timeout);
        onClose();
        onSaved({
          isEditing: false,
          assignmentId: assignment.id,
          completedAt: contactedAt,
          log: {
            assignment_id: assignment.id,
            contacted_at: contactedAt,
            ...logPayload,
          },
        });
        return;
      }

      clearTimeout(timeout);
      onClose();
      onSaved({
        isEditing: true,
        assignmentId: assignment.id,
        log: {
          id: existingLog.id,
          assignment_id: assignment.id,
          ...logPayload,
        },
      });
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
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
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

          {/* Proxy logging banner */}
          {onBehalfOf && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <p className="text-blue-700 text-sm">
                Logging on behalf of{" "}
                <span className="font-medium">{onBehalfOf.full_name}</span>
              </p>
            </div>
          )}

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
            {/* Heard from */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Did you hear back from this person?
                <span className="text-red-500 ml-1">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setHeardFrom(true)}
                  className={`py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                    heardFrom === true
                      ? "bg-green-600 text-white border-green-600"
                      : "bg-white text-stone-600 border-stone-200 hover:bg-green-50"
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setHeardFrom(false)}
                  className={`py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                    heardFrom === false
                      ? "bg-stone-500 text-white border-stone-500"
                      : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  No
                </button>
              </div>
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
            <div>
              <label className="block text-sm font-medium text-amber-800 mb-1">
                Does this person need a follow-up?
                <span className="text-red-500 ml-1">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNeedsFollowUp(true)}
                  className={`py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                    needsFollowUp === true
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-stone-600 border-stone-200 hover:bg-amber-50"
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setNeedsFollowUp(false)}
                  className={`py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                    needsFollowUp === false
                      ? "bg-stone-500 text-white border-stone-500"
                      : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  No
                </button>
              </div>
            </div>

            {/* Prayer ministry request */}
            <div>
              <label className="block text-sm font-medium text-blue-800 mb-1">
                Prayer ministry request?
                <span className="text-red-500 ml-1">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPrayerRequest(true)}
                  className={`py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                    prayerRequest === true
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-stone-600 border-stone-200 hover:bg-blue-50"
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setPrayerRequest(false)}
                  className={`py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                    prayerRequest === false
                      ? "bg-stone-500 text-white border-stone-500"
                      : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  No
                </button>
              </div>
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
