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

  // Format birthday as "Month Day" (e.g. "March 15") if available
  function formatBirthday(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr + "T00:00:00"); // prevent timezone shift
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  }

  const birthday = formatBirthday(member?.birthday);

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
          {/* Birthday — only shown if available */}
          {birthday && (
            <p className="text-xs text-blue-500 mt-0.5">
              🎂 Birthday: {birthday}
            </p>
          )}
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

      {/* Contact details */}
      <div className="flex flex-col gap-1.5">
        {member?.phone && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <svg
              className="w-4 h-4 text-gray-400 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
            <a
              href={`tel:${member.phone}`}
              className="hover:text-blue-600 transition-colors"
            >
              {member.phone}
            </a>
          </div>
        )}
        {member?.email && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <svg
              className="w-4 h-4 text-gray-400 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <a
              href={`mailto:${member.email}`}
              className="hover:text-blue-600 transition-colors"
            >
              {member.email}
            </a>
          </div>
        )}
        {!member?.phone && !member?.email && (
          <p className="text-sm text-gray-400 italic">
            No contact details on file
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {member?.phone && (
          <a
            href={`tel:${member.phone}`}
            className="flex-1 text-center text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg transition-colors"
          >
            📞 Call
          </a>
        )}
        {member?.email && (
          <a
            href={`mailto:${member.email}`}
            className="flex-1 text-center text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg transition-colors"
          >
            ✉️ Email
          </a>
        )}
        {!isCompleted ? (
          <button
            onClick={() => onComplete(assignment)}
            className="flex-1 text-center text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition-colors"
          >
            Complete Contact
          </button>
        ) : (
          <button
            onClick={() => onEdit(assignment)}
            className="flex-1 text-center text-sm font-medium bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 py-2 rounded-lg transition-colors"
          >
            Edit Notes
          </button>
        )}
      </div>
    </div>
  );
}
