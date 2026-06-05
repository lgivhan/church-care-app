const SECTIONS = [
  {
    title: "Getting Started",
    items: [
      {
        q: "How do I add a new volunteer?",
        a: "Go to the Volunteers tab and click 'Add Volunteer'. Enter their name, email, and ministry. They'll receive an invite email with a link to set their password.",
      },
    ],
  },
  {
    title: "Assignments & Contacts",
    items: [
      {
        q: "How are contacts assigned each cycle?",
        a: "Every other Friday at 4am, the app automatically distributes members across active volunteers using a round-robin system. Each volunteer gets a 2-week cycle to complete their contacts.",
      },
      {
        q: "How do I find out which volunteer is assigned to a specific member?",
        a: 'Go to the Assignments tab and type the member\'s name in the "Filter by member..." search box. The list will narrow to show their assignment and which volunteer is responsible.',
      },
      {
        q: "How do I log a contact on behalf of a volunteer?",
        a: "Go to the Assignments tab, find the assignment, and click the edit log button. You can select any volunteer and fill in the contact details on their behalf.",
      },
      {
        q: "How do I log a contact that wasn't in a participant's assigned list?",
        a: "Sometimes participants contact people outside their weekly assignment. You can add these records as an admin:",
        steps: [
          "Go to the Assignments tab.",
          'Select the week the contact happened using the "Week of:" dropdown.',
          'Type the participant\'s name in the "Volunteer name" field and select them from the dropdown.',
          'Click "+ Log Unassigned Contact for [Participant\'s name]" — the button appears above the name field.',
          "Fill out the form and click Save Contact.",
        ],
        note: "The contact must already exist in the system before they can be logged.",
      },
    ],
  },
  {
    title: "Contacts Tab",
    items: [
      {
        q: "How do I exclude a contact from assignments?",
        a: "Go to the Contacts tab, find the member, and click 'Exclude'. They'll be moved to the 'Excluded Contacts' section at the bottom and won't be assigned to any volunteer in future cycles. You can re-include them at any time.",
      },
      {
        q: "Will excluding a contact affect Planning Center?",
        a: "No. Exclusion is local to Church Care only. Nothing changes in Planning Center.",
      },
    ],
  },
  {
    title: "Follow-ups & Prayer",
    items: [
      {
        q: "How do follow-ups work?",
        a: "When a volunteer marks 'Needs follow-up: Yes' on a contact log, it appears in the Follow-ups tab. Admins can review and mark them resolved once handled.",
      },
      {
        q: "Who sees prayer requests?",
        a: "Prayer requests flagged by volunteers are visible to admins in the Overview and Follow-ups tabs, and to users with the Prayer Team role in their dedicated dashboard.",
      },
    ],
  },
  {
    title: "Troubleshooting",
    items: [
      {
        q: "A volunteer says their contact count looks wrong.",
        a: "Ask them to hard-refresh the page (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows). If the count still looks off, check the Assignments tab and filter by their name to see what the system has on record.",
      },
      {
        q: "An invite link isn't working for a new volunteer.",
        a: "Invite links expire after 24 hours. Go to the Volunteers tab and click the resend icon next to their name to send a fresh link.",
      },
    ],
  },
];

export default function FAQDrawer({ onClose }) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white z-50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <div>
            <h2 className="text-base font-semibold text-stone-800">
              Help & FAQ
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              How to use Church Care
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 transition-colors p-1"
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-3">
                {section.title}
              </h3>
              <div className="space-y-3">
                {section.items.map((item) => (
                  <div key={item.q} className="bg-stone-50 rounded-xl p-4">
                    <p className="text-sm font-medium text-stone-800 mb-1">
                      {item.q}
                    </p>
                    <p className="text-sm text-stone-500 leading-relaxed">
                      {item.a}
                    </p>
                    {item.steps && (
                      <ol className="mt-2 space-y-1 list-decimal list-inside">
                        {item.steps.map((step, i) => (
                          <li
                            key={i}
                            className="text-sm text-stone-500 leading-relaxed"
                          >
                            {step}
                          </li>
                        ))}
                      </ol>
                    )}
                    {item.note && (
                      <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                        Note: {item.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
