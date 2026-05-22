import { useState } from "react";
import { getMembershipLabel } from "../lib/utils.js";

export default function MemberCard({ assignment, onComplete, onEdit }) {
  const member = assignment.members;
  const isCompleted = assignment.status === "completed";
  const [expanded, setExpanded] = useState(!isCompleted);

  function formatBirthday(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
  }

  const birthday = formatBirthday(member?.birthday);
  const membershipLabel = getMembershipLabel(member?.membership_type);

  // Collapsed view — completed cards only
  if (isCompleted && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full text-left bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 shadow-sm transition-colors hover:bg-green-100"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-stone-800 text-sm truncate">
            {member?.first_name} {member?.last_name}
          </span>
          <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Contacted
          </span>
        </div>
        <svg
          className="w-4 h-4 text-stone-400 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
    );
  }

  // Expanded view — pending cards always, completed cards when tapped
  return (
    <div
      className={`bg-white rounded-2xl border p-5 flex flex-col gap-4 shadow-sm transition-all ${
        isCompleted ? "border-green-200 bg-green-50" : "border-stone-100"
      }`}
    >
      {/* Member name + completion badge */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-stone-800 text-base">
            {member?.first_name} {member?.last_name}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {membershipLabel && (
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${membershipLabel.color}`}
              >
                {membershipLabel.label}
              </span>
            )}
            {birthday && <p className="text-xs text-blue-500">🎂 {birthday}</p>}
          </div>
        </div>
        {isCompleted && (
          <button
            onClick={() => setExpanded(false)}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 px-2.5 py-1 rounded-full transition-colors"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Contacted
          </button>
        )}
      </div>

      {/* Contact Details */}
      <div className="flex flex-col gap-1.5">
        {member?.phone && (
          <p className="text-sm text-stone-600">{member.phone}</p>
        )}
        {member?.email && (
          <p className="text-sm text-stone-600 break-all">{member.email}</p>
        )}
        {!member?.phone && !member?.email && (
          <p className="text-sm text-stone-400 italic">
            No contact details on file
          </p>
        )}
      </div>

      {/* Contact Actions */}
      {(member?.phone || member?.email) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {member?.phone && (
            <>
              <a
                href={`tel:${member.phone}`}
                className="text-center text-sm font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 py-2.5 rounded-lg transition-colors"
              >
                📞 Call
              </a>
              <a
                href={`sms:${member.phone}`}
                className="text-center text-sm font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 py-2.5 rounded-lg transition-colors"
              >
                💬 Text
              </a>
            </>
          )}
          {member?.email && (
            <a
              href={`mailto:${member.email}`}
              className="text-center text-sm font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 py-2.5 rounded-lg transition-colors"
            >
              ✉️ Email
            </a>
          )}
        </div>
      )}

      {/* Primary Action */}
      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        {!isCompleted ? (
          <button
            onClick={() => onComplete(assignment)}
            className="w-full text-center text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-lg transition-colors"
          >
            Complete Contact
          </button>
        ) : (
          <button
            onClick={() => onEdit(assignment)}
            className="w-full text-center text-sm font-medium bg-white hover:bg-stone-50 text-stone-600 border border-stone-200 py-2.5 rounded-lg transition-colors"
          >
            Edit Notes
          </button>
        )}
      </div>
    </div>
  );
}
