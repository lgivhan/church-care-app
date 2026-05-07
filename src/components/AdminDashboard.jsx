// ============================================================
// AdminDashboard.jsx
//
// Full admin view with tabbed navigation. Tabs:
//   1. Overview     — pending volunteers badge, week summary
//   2. Assignments  — all assignments for selected week
//   3. Members      — members with no contact info flagged
//   4. Volunteers   — activity by week, approve/deactivate
//   5. History      — full contact log across all volunteers
//   6. Follow-ups   — members flagged as needing follow-up
//
// Week selector allows admins to look back at previous weeks.
// All queries filter by the selected week where applicable.
// ============================================================

import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { getThisSunday } from "../lib/utils";

// ============================================================
// HELPERS
// ============================================================

// Format a date string as "March 22, 2026"
function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Format a timestamp as "Mar 22, 2026 3:45 PM"
function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Generate a list of recent Sundays for the week selector
function getRecentSundays(count = 8) {
  const sundays = [];
  const today = new Date();
  const dayOfWeek = today.getDay();
  const thisSunday = new Date(today);
  thisSunday.setDate(today.getDate() - dayOfWeek);

  for (let i = 0; i < count; i++) {
    const sunday = new Date(thisSunday);
    sunday.setDate(thisSunday.getDate() - i * 7);
    const year = sunday.getFullYear();
    const month = String(sunday.getMonth() + 1).padStart(2, "0");
    const day = String(sunday.getDate()).padStart(2, "0");
    sundays.push(`${year}-${month}-${day}`);
  }
  return sundays;
}

// Format contact method for display
function formatContactMethod(method) {
  const map = {
    call: "📞 Call",
    text: "💬 Text",
    email: "✉️ Email",
    voicemail: "📱 Voicemail",
    in_person: "🤝 In Person",
  };
  return map[method] ?? "—";
}

// ============================================================
// TAB BUTTON
// ============================================================

function TabButton({ label, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors relative ${
        active ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {label}
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedWeek, setSelectedWeek] = useState(getThisSunday());
  const recentSundays = getRecentSundays();

  // Data state
  const [pendingVolunteers, setPendingVolunteers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [contactLogs, setContactLogs] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [membersNoContact, setMembersNoContact] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [prayerRequests, setPrayerRequests] = useState([]);

  // Ref for scrolling to pending volunteers section
  const pendingRef = useRef(null);

  useEffect(() => {
    loadAll();
  }, [selectedWeek]);

  // When the user returns to the app after it's been backgrounded,
  // reload the page to ensure a fresh session and up-to-date data.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        window.location.reload();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // --------------------------------------------------------
  // DATA LOADING
  // --------------------------------------------------------

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      await Promise.all([
        loadPendingVolunteers(),
        loadAssignments(),
        loadVolunteers(),
        loadContactLogs(),
        loadFollowUps(),
        loadMembersNoContact(),
        loadPrayerRequests(),
      ]);
    } catch (err) {
      setError("Failed to load dashboard data. Please refresh.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadPendingVolunteers() {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, created_at")
      .eq("role", "volunteer")
      .eq("is_active", false)
      .order("created_at", { ascending: true });
    setPendingVolunteers(data ?? []);
  }

  async function loadAssignments() {
    const { data } = await supabase
      .from("assignments")
      .select(
        `
        id,
        status,
        week_starting,
        completed_at,
        caller_id,
        member_id,
        profiles!assignments_caller_id_fkey (full_name, email),
        members (first_name, last_name, email, phone)
      `,
      )
      .eq("week_starting", selectedWeek)
      .order("status", { ascending: true });
    setAssignments(data ?? []);
  }

  async function loadVolunteers() {
    // Load all active volunteers with their assignment completion counts
    // for the selected week
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name, email, is_active, created_at")
      .eq("role", "volunteer")
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (!profileData) return setVolunteers([]);

    // Get assignment counts for selected week
    const { data: assignmentData } = await supabase
      .from("assignments")
      .select("caller_id, status")
      .eq("week_starting", selectedWeek);

    // Build a map of volunteer completion stats
    const statsMap = {};
    profileData.forEach((p) => {
      statsMap[p.id] = { assigned: 0, completed: 0 };
    });

    assignmentData?.forEach((a) => {
      if (statsMap[a.caller_id]) {
        statsMap[a.caller_id].assigned++;
        if (a.status === "completed") statsMap[a.caller_id].completed++;
      }
    });

    setVolunteers(
      profileData.map((p) => ({
        ...p,
        assigned: statsMap[p.id]?.assigned ?? 0,
        completed: statsMap[p.id]?.completed ?? 0,
      })),
    );
  }

  async function loadContactLogs() {
    const { data } = await supabase
      .from("contact_logs")
      .select(
        `
        id,
        notes,
        contacted_at,
        needs_follow_up,
        contact_method,
        members (first_name, last_name),
        profiles!contact_logs_volunteer_id_fkey (full_name)
      `,
      )
      .order("contacted_at", { ascending: false })
      .limit(100);
    setContactLogs(data ?? []);
  }

  async function loadFollowUps() {
    const { data } = await supabase
      .from("contact_logs")
      .select(
        `
        id,
        notes,
        contacted_at,
        contact_method,
        follow_up_resolved,
        members (first_name, last_name),
        profiles!contact_logs_volunteer_id_fkey (full_name)
      `,
      )
      .eq("needs_follow_up", true)
      .order("contacted_at", { ascending: false });
    setFollowUps(data ?? []);
  }

  async function loadPrayerRequests() {
    const { data } = await supabase
      .from("contact_logs")
      .select(`
        id,
        notes,
        contacted_at,
        contact_method,
        prayer_request_resolved,
        members (first_name, last_name),
        profiles!contact_logs_volunteer_id_fkey (full_name)
      `)
      .eq("prayer_request", true)
      .order("contacted_at", { ascending: false });
    setPrayerRequests(data ?? []);
  }

  async function loadMembersNoContact() {
    const { data } = await supabase
      .from("members")
      .select("id, first_name, last_name, email, phone, membership_type")
      .is("email", null)
      .is("phone", null)
      .order("last_name", { ascending: true });

    // Filter out children and teens client-side since Supabase
    // doesn't support case-insensitive ILIKE filtering in the JS client
    // the same way the SQL function does.
    const filtered = (data ?? []).filter((m) => {
      if (!m.membership_type) return true;
      const t = m.membership_type.toLowerCase();
      return !t.includes("child") && !t.includes("teen");
    });

    setMembersNoContact(filtered);
  }

  // --------------------------------------------------------
  // ACTIONS
  // --------------------------------------------------------

  async function approveVolunteer(id) {
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: true })
      .eq("id", id);

    if (error) {
      alert("Failed to approve volunteer. Please try again.");
      return;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generateWeeklyAssignments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
        },
      );

      const result = await response.json();
    } catch (err) {
      console.warn("Could not auto-generate assignments:", err);
    }

    loadPendingVolunteers();
    loadVolunteers();
  }

  async function deactivateVolunteer(id) {
    if (
      !window.confirm(
        "Are you sure you want to deactivate this volunteer? They will be excluded from future assignments.",
      )
    )
      return;
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: false })
      .eq("id", id);
    if (!error) loadVolunteers();
  }

  async function resolvePrayerRequest(id) {
    const { error } = await supabase
      .from("contact_logs")
      .update({ prayer_request_resolved: true })
      .eq("id", id);
    if (!error) loadPrayerRequests();
  }

  async function resolveFollowUp(id) {
    const { error } = await supabase
      .from("contact_logs")
      .update({ follow_up_resolved: true })
      .eq("id", id);
    if (!error) loadFollowUps();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.replace("/login");
  }

  function scrollToPending() {
    setActiveTab("volunteers");
    setTimeout(() => {
      pendingRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }

  // --------------------------------------------------------
  // DERIVED DATA
  // --------------------------------------------------------

  const pendingAssignments = assignments.filter((a) => a.status === "pending");
  const completedAssignments = assignments.filter(
    (a) => a.status === "completed",
  );

  // --------------------------------------------------------
  // RENDER
  // --------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-800">
              Church Care — Admin
            </h1>
            <p className="text-xs text-gray-500">
              Pastoral care coordination dashboard
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Tab navigation */}
        <div className="max-w-6xl mx-auto px-4 pb-3 flex gap-2 flex-wrap">
          <TabButton
            label="Overview"
            active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
          />
          <TabButton
            label="Assignments"
            active={activeTab === "assignments"}
            onClick={() => setActiveTab("assignments")}
          />
          <TabButton
            label="Members"
            active={activeTab === "members"}
            onClick={() => setActiveTab("members")}
          />
          <TabButton
            label="Volunteers"
            active={activeTab === "volunteers"}
            onClick={() => setActiveTab("volunteers")}
          />
          <TabButton
            label="Contact History"
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
          />
          <TabButton
            label="Follow-ups"
            active={activeTab === "followups"}
            onClick={() => setActiveTab("followups")}
            badge={followUps.length}
          />
          <TabButton
            label="Prayer Requests"
            active={activeTab === "prayer"}
            onClick={() => setActiveTab("prayer")}
            badge={prayerRequests.length}
          />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Error banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Pending volunteers alert — shown on all tabs */}
        {pendingVolunteers.length > 0 && (
          <div
            onClick={scrollToPending}
            className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between cursor-pointer hover:bg-amber-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 bg-amber-500 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                {pendingVolunteers.length}
              </span>
              <div>
                <p className="text-sm font-medium text-amber-800">
                  {pendingVolunteers.length === 1
                    ? "1 volunteer is waiting for approval"
                    : `${pendingVolunteers.length} volunteers are waiting for approval`}
                </p>
                <p className="text-xs text-amber-600">
                  Click to review and approve
                </p>
              </div>
            </div>
            <svg
              className="w-5 h-5 text-amber-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>
        )}

        {/* Week selector — shown on Overview, Assignments, Volunteers tabs */}
        {["overview", "assignments", "volunteers"].includes(activeTab) && (
          <div className="mb-6 flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600 shrink-0">
              Week of:
            </label>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {recentSundays.map((sunday) => (
                <option key={sunday} value={sunday}>
                  {formatDate(sunday)}
                  {sunday === getThisSunday() ? " (current)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* TAB: OVERVIEW                                       */}
        {/* -------------------------------------------------- */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Assigned"
              value={assignments.length}
              color="blue"
            />
            <StatCard
              label="Completed"
              value={completedAssignments.length}
              color="green"
            />
            <StatCard
              label="Pending"
              value={pendingAssignments.length}
              color="amber"
            />
            <StatCard
              label="Need Follow-up"
              value={followUps.length}
              color="red"
            />

            {/* Members with no contact info */}
            {membersNoContact.length > 0 && (
              <div className="sm:col-span-2 lg:col-span-4 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                <p className="text-sm font-medium text-orange-800 mb-1">
                  ⚠️ {membersNoContact.length} member
                  {membersNoContact.length !== 1 ? "s" : ""} have no contact
                  information
                </p>
                <p className="text-xs text-orange-600 mb-3">
                  These members cannot be contacted and are excluded from
                  assignments. Update their records in Planning Center.
                </p>
                <div className="flex flex-wrap gap-2">
                  {membersNoContact.map((m) => (
                    <span
                      key={m.id}
                      className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full"
                    >
                      {m.first_name} {m.last_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* TAB: ASSIGNMENTS                                    */}
        {/* -------------------------------------------------- */}
        {activeTab === "assignments" && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Assignments — {formatDate(selectedWeek)}
            </h2>

            {assignments.length === 0 ? (
              <EmptyState message="No assignments found for this week." />
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Member
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Volunteer
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Status
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Completed
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {assignments.map((a) => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-800">
                          {a.members?.first_name} {a.members?.last_name}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {a.profiles?.full_name}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={a.status} />
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {a.completed_at
                            ? formatDateTime(a.completed_at)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* TAB: MEMBERS                                        */}
        {/* -------------------------------------------------- */}
        {activeTab === "members" && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              Members with No Contact Info
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              These members are excluded from weekly assignments. Update their
              records in Planning Center and the next daily sync will pick up
              the changes.
            </p>

            {membersNoContact.length === 0 ? (
              <div className="p-6 bg-green-50 border border-green-100 rounded-xl text-center">
                <p className="text-green-700 text-sm font-medium">
                  ✅ All members have contact information on file.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Name
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Email
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Phone
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        PCO ID
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {membersNoContact.map((m) => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-800 font-medium">
                          {m.first_name} {m.last_name}
                        </td>
                        <td className="px-4 py-3 text-gray-400 italic">None</td>
                        <td className="px-4 py-3 text-gray-400 italic">None</td>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                          {m.id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* TAB: VOLUNTEERS                                     */}
        {/* -------------------------------------------------- */}
        {activeTab === "volunteers" && (
          <div className="space-y-8">
            {/* Pending volunteers section */}
            <div ref={pendingRef}>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Pending Approval
              </h2>

              {pendingVolunteers.length === 0 ? (
                <div className="p-6 bg-green-50 border border-green-100 rounded-xl text-center">
                  <p className="text-green-700 text-sm font-medium">
                    ✅ No volunteers pending approval.
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-3 text-gray-600 font-medium">
                          Name
                        </th>
                        <th className="text-left px-4 py-3 text-gray-600 font-medium">
                          Email
                        </th>
                        <th className="text-left px-4 py-3 text-gray-600 font-medium">
                          Signed up
                        </th>
                        <th className="text-left px-4 py-3 text-gray-600 font-medium">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pendingVolunteers.map((v) => (
                        <tr key={v.id}>
                          <td className="px-4 py-3 text-gray-800 font-medium">
                            {v.full_name}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{v.email}</td>
                          <td className="px-4 py-3 text-gray-400">
                            {formatDateTime(v.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => approveVolunteer(v.id)}
                              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                            >
                              Approve
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Active volunteers section */}
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-1">
                Volunteer Activity — {formatDate(selectedWeek)}
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Volunteers highlighted in red had assignments this week but
                completed none.
              </p>

              {volunteers.length === 0 ? (
                <EmptyState message="No active volunteers found." />
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-3 text-gray-600 font-medium">
                          Name
                        </th>
                        <th className="text-left px-4 py-3 text-gray-600 font-medium">
                          Email
                        </th>
                        <th className="text-left px-4 py-3 text-gray-600 font-medium">
                          Assigned
                        </th>
                        <th className="text-left px-4 py-3 text-gray-600 font-medium">
                          Completed
                        </th>
                        <th className="text-left px-4 py-3 text-gray-600 font-medium">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {volunteers.map((v) => {
                        // Highlight volunteers with assignments but zero completions
                        const zeroCompletion =
                          v.assigned > 0 && v.completed === 0;
                        return (
                          <tr
                            key={v.id}
                            className={
                              zeroCompletion ? "bg-red-50" : "hover:bg-gray-50"
                            }
                          >
                            <td className="px-4 py-3 font-medium text-gray-800">
                              {v.full_name}
                              {zeroCompletion && (
                                <span className="ml-2 text-xs text-red-500 font-normal">
                                  No contacts this week
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {v.email}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {v.assigned}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`font-medium ${v.completed === v.assigned && v.assigned > 0 ? "text-green-600" : zeroCompletion ? "text-red-600" : "text-gray-600"}`}
                              >
                                {v.completed}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => deactivateVolunteer(v.id)}
                                className="px-3 py-1.5 bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-600 text-xs font-medium rounded-lg transition-colors"
                              >
                                Deactivate
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* TAB: CONTACT HISTORY                               */}
        {/* -------------------------------------------------- */}
        {activeTab === "history" && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              Contact History
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Most recent 100 contacts across all volunteers.
            </p>

            {contactLogs.length === 0 ? (
              <EmptyState message="No contact logs yet." />
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Member
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Volunteer
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Method
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Notes
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Date
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Follow-up
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {contactLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-800 font-medium whitespace-nowrap">
                          {log.members?.first_name} {log.members?.last_name}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {log.profiles?.full_name}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {formatContactMethod(log.contact_method)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs">
                          <p
                            className="truncate sm:whitespace-normal sm:overflow-visible"
                            title={log.notes}
                          >
                            {log.notes}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                          {formatDateTime(log.contacted_at)}
                        </td>
                        <td className="px-4 py-3">
                          {log.needs_follow_up && (
                            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                              Follow-up
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* TAB: FOLLOW-UPS                                     */}
        {/* -------------------------------------------------- */}
        {activeTab === "followups" && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">
              Members Needing Follow-up
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              These members were flagged by a volunteer as needing additional
              pastoral attention.
            </p>

            {followUps.length === 0 ? (
              <div className="p-6 bg-green-50 border border-green-100 rounded-xl text-center">
                <p className="text-green-700 text-sm font-medium">
                  ✅ No members currently flagged for follow-up.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Member
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Flagged by
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Method
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Notes
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Date
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {followUps.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-800 font-medium whitespace-nowrap">
                          {log.members?.first_name} {log.members?.last_name}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {log.profiles?.full_name}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {formatContactMethod(log.contact_method)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs">
                          <p
                            className="truncate sm:whitespace-normal sm:overflow-visible"
                            title={log.notes}
                          >
                            {log.notes}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                          {formatDateTime(log.contacted_at)}
                        </td>
                        <td className="px-4 py-3">
                          {log.follow_up_resolved ? (
                            <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                              ✓ Followed up
                            </span>
                          ) : (
                            <button
                              onClick={() => resolveFollowUp(log.id)}
                              className="text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-full transition-colors"
                            >
                              Mark as followed up
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* TAB: PRAYER REQUESTS                               */}
        {/* -------------------------------------------------- */}
        {activeTab === "prayer" && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Prayer Requests</h2>
            <p className="text-sm text-gray-500 mb-4">
              Members who have requested prayer from the prayer ministry.
            </p>

            {prayerRequests.length === 0 ? (
              <div className="p-6 bg-green-50 border border-green-100 rounded-xl text-center">
                <p className="text-green-700 text-sm font-medium">
                  ✅ No open prayer requests.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Member</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Volunteer</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Notes</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Date</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {prayerRequests.map((log) => (
                      <tr key={log.id} className={log.prayer_request_resolved ? "bg-gray-50 opacity-60" : "hover:bg-gray-50"}>
                        <td className="px-4 py-3 text-gray-800 font-medium whitespace-nowrap">
                          {log.members?.first_name} {log.members?.last_name}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {log.profiles?.full_name}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs">
                          <p className="truncate sm:whitespace-normal" title={log.notes}>
                            {log.notes}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                          {formatDateTime(log.contacted_at)}
                        </td>
                        <td className="px-4 py-3">
                          {log.prayer_request_resolved ? (
                            <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                              ✓ Prayed for
                            </span>
                          ) : (
                            <button
                              onClick={() => resolvePrayerRequest(log.id)}
                              className="text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-full transition-colors"
                            >
                              Mark as prayed for
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function StatCard({ label, value, color }) {
  const colors = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    green: "bg-green-50 text-green-700 border-green-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    red: "bg-red-50 text-red-700 border-red-100",
  };
  return (
    <div className={`p-5 rounded-2xl border ${colors[color]}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm mt-1 opacity-80">{label}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  return status === "completed" ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
      ✓ Completed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
      Pending
    </span>
  );
}

function EmptyState({ message }) {
  return (
    <div className="text-center py-12 text-gray-400 text-sm">{message}</div>
  );
}
