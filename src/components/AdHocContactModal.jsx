import { useEffect, useState } from "react";
import { supabase, getAccessToken } from "../lib/supabaseClient";
import { getThisSunday } from "../lib/utils";

function getSundaysBetween(earliestWeek) {
  const sundays = [];
  const today = new Date();
  const dayOfWeek = today.getDay();
  const thisSunday = new Date(today);
  thisSunday.setDate(today.getDate() - dayOfWeek);

  const start = new Date(earliestWeek + "T00:00:00");
  let cursor = new Date(thisSunday);

  while (cursor >= start) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    sundays.push(`${year}-${month}-${day}`);
    cursor.setDate(cursor.getDate() - 7);
  }
  return sundays;
}

function formatWeekLabel(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
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
  options.push({ value: "in_person", label: "🤝 In Person" });
  return options;
}

export default function AdHocContactModal({
  volunteers,
  selectedWeek,
  adminUserId,
  onClose,
  onSaved,
}) {
  const [volunteerId, setVolunteerId] = useState("");
  const [selectedVolunteer, setSelectedVolunteer] = useState(null);
  const [volunteerSearch, setVolunteerSearch] = useState("");
  const [showVolunteerList, setShowVolunteerList] = useState(false);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [showMemberList, setShowMemberList] = useState(false);
  const [contactMethod, setContactMethod] = useState("");
  const [contactedAt, setContactedAt] = useState(selectedWeek);
  const [weekOptions, setWeekOptions] = useState([selectedWeek]);
  const [notes, setNotes] = useState("");
  const [needsFollowUp, setNeedsFollowUp] = useState(false);
  const [prayerRequest, setPrayerRequest] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [methodError, setMethodError] = useState(false);

  useEffect(() => {
    async function loadData() {
      const [membersResult, earliestResult] = await Promise.all([
        supabase
          .from("members")
          .select("id, first_name, last_name, email, phone")
          .order("last_name", { ascending: true }),
        supabase
          .from("assignments")
          .select("week_starting")
          .order("week_starting", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      if (membersResult.error) {
        setError(`Could not load contacts: ${membersResult.error.message}`);
      } else {
        setMembers(membersResult.data ?? []);
      }
      setMembersLoading(false);

      const earliest = earliestResult.data?.week_starting ?? getThisSunday();
      setWeekOptions(getSundaysBetween(earliest));
    }
    loadData();
  }, []);

  const filteredMembers = memberSearch.trim()
    ? members.filter((m) => {
        const q = memberSearch.toLowerCase();
        return `${m.first_name} ${m.last_name}`.toLowerCase().includes(q);
      })
    : members;

  const contactMethodOptions = getContactMethodOptions(selectedMember);

  function handleSelectMember(member) {
    setSelectedMember(member);
    setMemberSearch(`${member.first_name} ${member.last_name}`);
    setShowMemberList(false);
    setContactMethod("");
  }

  function handleClearMember() {
    setSelectedMember(null);
    setMemberSearch("");
    setContactMethod("");
  }

  const filteredVolunteers = volunteerSearch.trim()
    ? volunteers.filter((v) =>
        v.full_name.toLowerCase().includes(volunteerSearch.toLowerCase()),
      )
    : volunteers;

  function handleSelectVolunteer(v) {
    setSelectedVolunteer(v);
    setVolunteerId(v.id);
    setVolunteerSearch(v.full_name);
    setShowVolunteerList(false);
  }

  function handleClearVolunteer() {
    setSelectedVolunteer(null);
    setVolunteerId("");
    setVolunteerSearch("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMethodError(false);

    if (!volunteerId) {
      setError("Please select a volunteer.");
      return;
    }
    if (!selectedMember) {
      setError("Please search for and select a member.");
      return;
    }
    if (!notes.trim()) {
      setError(
        "Please add a note before saving. Even a brief summary helps the pastoral team.",
      );
      return;
    }
    if (!contactMethod) {
      setError("Please select how the volunteer contacted this person.");
      setMethodError(true);
      return;
    }

    setLoading(true);

    const timeout = setTimeout(() => {
      setLoading(false);
      setError(
        "The request is taking too long. Please check your connection and try again.",
      );
    }, 30000);

    try {
      const { data: authData } = await supabase.auth.getSession();
      const token =
        authData?.session?.access_token ??
        getAccessToken() ??
        import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/contact_logs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            member_id: selectedMember.id,
            volunteer_id: volunteerId,
            assignment_id: null,
            contacted_at: `${contactedAt}T12:00:00.000Z`,
            logged_by: adminUserId,
            notes: notes.trim(),
            contact_method: contactMethod,
            needs_follow_up: needsFollowUp,
            prayer_request: prayerRequest,
          }),
        },
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Insert failed: ${errText}`);
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
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">
                  Log Unassigned Contact
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Record a contact that wasn't part of a weekly assignment.
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
              {/* Volunteer search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Volunteer
                  <span className="text-red-500 ml-1">*</span>
                </label>
                {selectedVolunteer ? (
                  <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
                    <span className="text-sm text-gray-800 flex-1">
                      {selectedVolunteer.full_name}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearVolunteer}
                      className="px-2 py-1 text-xs font-medium text-blue-600 bg-white border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={volunteerSearch}
                      onChange={(e) => {
                        setVolunteerSearch(e.target.value);
                        setShowVolunteerList(true);
                      }}
                      onFocus={() => setShowVolunteerList(true)}
                      placeholder="Search by name..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {showVolunteerList && filteredVolunteers.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredVolunteers.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => handleSelectVolunteer(v)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors font-medium text-gray-800"
                          >
                            {v.full_name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Contact search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact
                  <span className="text-red-500 ml-1">*</span>
                </label>
                {selectedMember ? (
                  <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
                    <span className="text-sm text-gray-800 flex-1">
                      {selectedMember.first_name} {selectedMember.last_name}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearMember}
                      className="px-2 py-1 text-xs font-medium text-blue-600 bg-white border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => {
                        setMemberSearch(e.target.value);
                        setShowMemberList(true);
                      }}
                      onFocus={() => setShowMemberList(true)}
                      placeholder={
                        membersLoading
                          ? "Loading contacts..."
                          : "Search by name..."
                      }
                      disabled={membersLoading}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {showMemberList && filteredMembers.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredMembers.slice(0, 50).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleSelectMember(m)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                          >
                            <span className="font-medium text-gray-800">
                              {m.first_name} {m.last_name}
                            </span>
                            {(m.phone || m.email) && (
                              <span className="text-gray-400 text-xs ml-2">
                                {m.phone ?? m.email}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Contact method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  How did they make contact?
                  <span className="text-red-500 ml-1">*</span>
                </label>
                <select
                  value={contactMethod}
                  onChange={(e) => {
                    setContactMethod(e.target.value);
                    setMethodError(false);
                  }}
                  disabled={!selectedMember}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    methodError
                      ? "border-red-400 bg-red-50 text-red-900"
                      : "border-gray-200"
                  } disabled:opacity-50`}
                >
                  <option value="">
                    {selectedMember
                      ? "Select a method..."
                      : "Select a member first"}
                  </option>
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

              {/* Week */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Week of contact
                </label>
                <select
                  value={contactedAt}
                  onChange={(e) => setContactedAt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {weekOptions.map((w) => (
                    <option key={w} value={w}>
                      {formatWeekLabel(w)}
                      {w === getThisSunday() ? " (current)" : ""}
                    </option>
                  ))}
                </select>
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
                  id="adhoc-needs-follow-up"
                  checked={needsFollowUp}
                  onChange={(e) => setNeedsFollowUp(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                />
                <label
                  htmlFor="adhoc-needs-follow-up"
                  className="text-sm text-amber-800 cursor-pointer"
                >
                  <span className="font-medium">Flag for follow-up</span>
                  <span className="block text-amber-600 text-xs mt-0.5">
                    Check this if this member needs additional pastoral
                    attention or a follow-up call.
                  </span>
                </label>
              </div>

              {/* Prayer ministry request */}
              <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <input
                  type="checkbox"
                  id="adhoc-prayer-request"
                  checked={prayerRequest}
                  onChange={(e) => setPrayerRequest(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <label
                  htmlFor="adhoc-prayer-request"
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
                  {loading ? "Saving..." : "Save Contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
