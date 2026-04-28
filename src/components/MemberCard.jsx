import { getMembershipLabel } from "../lib/utils.js";
// ============================================================
// MemberCard.jsx
//
// Displays a single weekly assignment for a volunteer.
// Shows member contact details and actions.
//
// Props:
//   assignment  — the assignment row joined with member data
//   onComplete  — callback to open the contact modal
//   onEdit      — callback to reopen modal with existing notes
// ============================================================

export default function MemberCard({ assignment, onComplete, onEdit }) {
  const member = assignment.members;
  const isCompleted = assignment.status === "completed";

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

  return (
    <div
      className={`bg-white rounded-2xl border p-5 flex flex-col gap-4 shadow-sm transition-all ${
        isCompleted ? "border-green-200 bg-green-50" : "border-gray-100"
      }`}
    >
      {/* Member name + completion badge */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-800 text-base">
            {member?.first_name} {member?.last_name}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Membership type badge — only shown if available */}
            {membershipLabel && (
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${membershipLabel.color}`}
              >
                {membershipLabel.label}
              </span>
            )}
            {/* Birthday — only shown if available */}
            {birthday && <p className="text-xs text-blue-500">🎂 {birthday}</p>}
          </div>
        </div>
        {isCompleted && (
          <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
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
        )}
      </div>

      {/* Contact Details */}
      <div className="flex flex-col gap-1.5">
        {member?.phone && (
          <p className="text-sm text-gray-600">{member.phone}</p>
        )}
        {member?.email && (
          <p className="text-sm text-gray-600 break-all">{member.email}</p>
        )}
        {!member?.phone && !member?.email && (
          <p className="text-sm text-gray-400 italic">
            No contact details on file
          </p>
        )}
      </div>

      {/* Contact Actions (Responsive Grid) */}
      {(member?.phone || member?.email) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {member?.phone && (
            <>
              <a
                href={`tel:${member.phone}`}
                className="text-center text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg transition-colors"
              >
                📞 Call
              </a>

              <a
                href={`sms:${member.phone}`}
                className="text-center text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg transition-colors"
              >
                💬 Text
              </a>
            </>
          )}

          {member?.email && (
            <a
              href={`mailto:${member.email}`}
              className="text-center text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg transition-colors"
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
            className="w-full text-center text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg transition-colors"
          >
            Complete Contact
          </button>
        ) : (
          <button
            onClick={() => onEdit(assignment)}
            className="w-full text-center text-sm font-medium bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 py-2.5 rounded-lg transition-colors"
          >
            Edit Notes
          </button>
        )}
      </div>
    </div>
  );
}
