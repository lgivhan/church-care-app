import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

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
  if (member?.address) {
    options.push({ value: "snail_mail", label: "📬 Snail Mail" });
  }
  options.push({ value: "in_person", label: "🤝 In Person" });
  return options;
}

export default function AdHocContactModal({
  volunteers,
  selectedWeek,
  adminUserId,
  initialVolunteer = null,
  onClose,
  onSaved,
}) {
  const [volunteerId, setVolunteerId] = useState(initialVolunteer?.id ?? "");
  const [selectedVolunteer, setSelectedVolunteer] = useState(initialVolunteer);
  const [volunteerSearch, setVolunteerSearch] = useState(
    initialVolunteer?.full_name ?? "",
  );
  const [showVolunteerList, setShowVolunteerList] = useState(false);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [showMemberList, setShowMemberList] = useState(false);
  const [contactMethod, setContactMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [needsFollowUp, setNeedsFollowUp] = useState(null);
  const [prayerRequest, setPrayerRequest] = useState(null);
  const [heardFrom, setHeardFrom] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [methodError, setMethodError] = useState(false);

  useEffect(() => {
    async function loadData() {
      const membersResult = await supabase
        .from("members")
        .select("id, first_name, last_name, email, phone, address")
        .order("last_name", { ascending: true });

      if (membersResult.error) {
        setError(`Could not load contacts: ${membersResult.error.message}`);
      } else {
        setMembers(membersResult.data ?? []);
      }
      setMembersLoading(false);
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
    if (heardFrom === null) {
      setError(
        "Please indicate whether the volunteer heard back from this person.",
      );
      return;
    }
    if (needsFollowUp === null) {
      setError("Please indicate whether this person needs a follow-up.");
      return;
    }
    if (prayerRequest === null) {
      setError("Please indicate whether this person has a prayer request.");
      return;
    }
    if (!contactMethod) {
      setError("Please select how the volunteer contacted this person.");
      setMethodError(true);
      return;
    }

    setLoading(true);

    try {
      const { error: insertError } = await supabase
        .from("contact_logs")
        .insert({
          member_id: selectedMember.id,
          volunteer_id: volunteerId,
          assignment_id: null,
          contacted_at: `${selectedWeek}T12:00:00.000Z`,
          logged_by: adminUserId,
          notes: notes.trim(),
          contact_method: contactMethod,
          needs_follow_up: needsFollowUp,
          prayer_request: prayerRequest,
          heard_from: heardFrom,
        });

      if (insertError) throw insertError;

      onClose();
      onSaved();
    } catch (err) {
      const time = new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
      const detail =
        err.name === "AbortError"
          ? "Request timed out — the server took too long to respond."
          : (err.message ?? "Something went wrong.");
      setError(`${detail} (${time} — screenshot this and send to Lee)`);
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
                  <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
                    <span className="text-sm text-gray-800">
                      {selectedVolunteer.full_name}
                    </span>
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

              {/* Heard from */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Did the volunteer hear back from this person?
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

              {/* Week */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Week of contact
                </label>
                <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
                  <span className="text-sm text-gray-800">
                    {formatWeekLabel(selectedWeek)}
                  </span>
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
