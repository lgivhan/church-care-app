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
import { supabase, getTokenSafe } from "../lib/supabaseClient";

function ToggleButton({
  active,
  onClick,
  activeClass,
  hoverClass,
  label,
  icon,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold rounded-xl border transition-colors ${
        active
          ? activeClass
          : `bg-white text-stone-500 border-stone-200 ${hoverClass}`
      }`}
    >
      <span className="text-xs">{active ? icon : ""}</span>
      {label}
    </button>
  );
}

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

  const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

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
  const [heardFrom, setHeardFrom] = useState(existingLog?.heard_from ?? null);
  const [contactedDate, setContactedDate] = useState(todayStr);
  const contactMethodOptions = getContactMethodOptions(member);

  // Follow-up and prayer fields only make sense after a real conversation.
  // Show them only when the volunteer confirms they heard back.
  const showFollowUpFields = heardFrom === true;

  function handleHeardFrom(value) {
    setHeardFrom(value);
    if (value !== true) {
      setNeedsFollowUp(false);
      setPrayerRequest(false);
    }
  }

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

    if (heardFrom === null) {
      setError("Please indicate whether you heard back from this person.");
      setLoading(false);
      return;
    }

    const timeout = setTimeout(() => {
      setLoading(false);
      setError(
        "The request is taking too long. Please check your connection and refresh the page." +
          (import.meta.env.VITE_SUPPORT_PHONE
            ? ` If it keeps happening, text Lee a screenshot at ${import.meta.env.VITE_SUPPORT_PHONE}.`
            : ""),
      );
    }, 30000);

    try {
      const token = await getTokenSafe();
      const logPayload = {
        notes,
        needs_follow_up: showFollowUpFields ? needsFollowUp : false,
        contact_method: contactMethod,
        prayer_request: showFollowUpFields ? prayerRequest : false,
        heard_from: heardFrom,
      };

      if (isEditing) {
        const updateResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/contact_logs?id=eq.${existingLog.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${token}`,
              Prefer: "return=minimal",
            },
            body: JSON.stringify(logPayload),
          },
        );

        if (!updateResponse.ok) {
          const errText = await updateResponse.text();
          throw new Error(`Update failed: ${errText}`);
        }
      } else {
        if (!userId) {
          clearTimeout(timeout);
          setLoading(false);
          setError(
            "Your session has expired. Please sign out and sign back in.",
          );
          return;
        }

        const contactedAt = onBehalfOf
          ? new Date(contactedDate + "T12:00:00").toISOString()
          : new Date().toISOString();

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/contact_logs`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${token}`,
              Prefer: "return=representation",
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

        const [insertedLog] = await response.json();

        const assignmentResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/assignments?id=eq.${assignment.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${token}`,
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
            id: insertedLog?.id,
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
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="relative bg-gradient-to-br from-amber-50 to-stone-50 rounded-t-2xl px-5 pt-5 pb-4 border-b border-stone-100">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-600 mb-1">
                  {isEditing ? "Edit contact" : "New contact"}
                </p>
                <h2 className="text-xl font-bold text-stone-800">
                  {member?.first_name} {member?.last_name}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="mt-0.5 p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
              >
                <svg
                  className="w-4 h-4"
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
          </div>

          <div className="px-5 py-4 space-y-5">
            {/* Admin care note (e.g. "cannot receive text messages") */}
            {member?.care_note && (
              <div className="p-3 bg-sky-50 border border-sky-100 rounded-xl">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 mb-1">
                  📝 Note from the care team
                </p>
                <p className="text-sm text-sky-900 whitespace-pre-wrap">
                  {member.care_note}
                </p>
              </div>
            )}

            {/* Proxy logging banner */}
            {onBehalfOf && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl space-y-3">
                <p className="text-amber-800 text-sm">
                  Logging on behalf of{" "}
                  <span className="font-semibold">{onBehalfOf.full_name}</span>
                </p>
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1.5">
                    Date of contact
                  </label>
                  <input
                    type="date"
                    value={contactedDate}
                    max={todayStr}
                    onChange={(e) => setContactedDate(e.target.value)}
                    className="px-3 py-2 border border-amber-200 rounded-xl text-sm bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Contact method dropdown */}
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">
                  How did you contact this person?
                  <span className="text-red-400 ml-1">*</span>
                </label>
                <select
                  value={contactMethod}
                  onChange={(e) => {
                    setContactMethod(e.target.value);
                    setMethodError(false);
                  }}
                  className={`w-full px-3 py-2.5 border rounded-xl text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-shadow ${
                    methodError
                      ? "border-red-300 bg-red-50 text-red-900"
                      : "border-stone-200 text-stone-800"
                  }`}
                >
                  <option value="">Select a method…</option>
                  {contactMethodOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {contactMethod === "voicemail" && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2">
                    Voicemail means the member wasn't reached directly —
                    consider flagging for follow-up.
                  </p>
                )}
              </div>

              {/* Heard from */}
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">
                  Did you hear back from this person?
                  <span className="text-red-400 ml-1">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <ToggleButton
                    active={heardFrom === true}
                    onClick={() => handleHeardFrom(true)}
                    activeClass="bg-emerald-500 border-emerald-500 text-white"
                    hoverClass="hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700"
                    label="Yes"
                    icon="✓"
                  />
                  <ToggleButton
                    active={heardFrom === false}
                    onClick={() => handleHeardFrom(false)}
                    activeClass="bg-stone-500 border-stone-500 text-white"
                    hoverClass="hover:bg-stone-50"
                    label="No"
                    icon="✗"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="What happened during this contact? Include any prayer requests or concerns to flag for the pastoral team."
                  className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm bg-stone-50 text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none transition-shadow"
                />
              </div>

              {showFollowUpFields && (
                <>
                  <div className="border-t border-stone-100" />
                  <div className="space-y-2">
                    <label
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer select-none transition-colors ${
                        needsFollowUp
                          ? "bg-amber-50 border-amber-300"
                          : "bg-stone-50 border-stone-200 hover:bg-amber-50/50 hover:border-amber-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={needsFollowUp === true}
                        onChange={(e) => setNeedsFollowUp(e.target.checked)}
                        className="w-4 h-4 rounded accent-amber-500 cursor-pointer shrink-0"
                      />
                      <span
                        className={`text-sm font-medium ${needsFollowUp ? "text-amber-900" : "text-stone-600"}`}
                      >
                        Flag for elder follow-up
                      </span>
                    </label>
                    <label
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer select-none transition-colors ${
                        prayerRequest
                          ? "bg-violet-50 border-violet-300"
                          : "bg-stone-50 border-stone-200 hover:bg-violet-50/50 hover:border-violet-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={prayerRequest === true}
                        onChange={(e) => setPrayerRequest(e.target.checked)}
                        className="w-4 h-4 rounded accent-violet-600 cursor-pointer shrink-0"
                      />
                      <span
                        className={`text-sm font-medium ${prayerRequest ? "text-violet-900" : "text-stone-600"}`}
                      >
                        Prayer ministry request
                      </span>
                    </label>
                  </div>
                </>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 text-sm font-semibold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 rounded-xl transition-colors shadow-sm shadow-amber-200"
                >
                  {loading ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
