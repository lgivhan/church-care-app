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
import MemberCard from "./MemberCard";
import ContactModal from "./ContactModal";

// ============================================================
// HELPERS
// ============================================================

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

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
// SHARED SUB-COMPONENTS
// ============================================================

function HeartIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function TabButton({ label, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-2 text-sm font-medium rounded-xl transition-all relative whitespace-nowrap shrink-0 ${
        active
          ? "bg-amber-500 text-white shadow-sm shadow-amber-200"
          : "text-stone-600 hover:bg-amber-50 hover:text-amber-700"
      }`}
    >
      {label}
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
          {badge}
        </span>
      )}
    </button>
  );
}

function SectionCard({ children, className = "" }) {
  return (
    <div
      className={`bg-white rounded-2xl border border-stone-100 overflow-hidden shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function TableHeader({ children }) {
  return (
    <thead className="bg-stone-50 border-b border-stone-100">
      <tr>{children}</tr>
    </thead>
  );
}

function Th({ children }) {
  return (
    <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wide">
      {children}
    </th>
  );
}

function StatusBadge({ status }) {
  return status === "completed" ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
      ✓ Completed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
      Pending
    </span>
  );
}

function EmptyState({ message }) {
  return (
    <div className="text-center py-14 text-stone-400 text-sm">{message}</div>
  );
}

function GreenNotice({ children }) {
  return (
    <div className="p-5 bg-green-50 border border-green-100 rounded-2xl text-center">
      <p className="text-green-700 text-sm font-medium">{children}</p>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedWeek, setSelectedWeek] = useState(getThisSunday());
  const recentSundays = getRecentSundays();

  const [pendingVolunteers, setPendingVolunteers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [contactLogs, setContactLogs] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [membersNoContact, setMembersNoContact] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [prayerRequests, setPrayerRequests] = useState([]);
  const [myAssignments, setMyAssignments] = useState([]);
  const [myContactLogs, setMyContactLogs] = useState({});
  const [myModalOpen, setMyModalOpen] = useState(false);
  const [mySelectedAssignment, setMySelectedAssignment] = useState(null);
  const [myEditingLog, setMyEditingLog] = useState(null);
  const [myUserId, setMyUserId] = useState(null);
  const [showAddVolunteer, setShowAddVolunteer] = useState(false);
  const [newVolunteerName, setNewVolunteerName] = useState("");
  const [newVolunteerEmail, setNewVolunteerEmail] = useState("");
  const [newVolunteerMinistry, setNewVolunteerMinistry] = useState("");
  const [newVolunteerType, setNewVolunteerType] = useState("technical");
  const [addingVolunteer, setAddingVolunteer] = useState(false);
  const [addVolunteerError, setAddVolunteerError] = useState("");
  const [sendingInvites, setSendingInvites] = useState(false);

  const pendingRef = useRef(null);

  // Always points to the latest loadAll closure so the visibility/focus
  // effect below can call it without re-registering event listeners on
  // every render (which would cause listener leaks).
  const loadAllRef = useRef(null);
  loadAllRef.current = loadAll;

  useEffect(() => {
    loadAll();
  }, [selectedWeek]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload all dashboard data whenever the tab or window comes back into
  // focus. The global session recovery in supabaseClient.js runs first
  // (debounced 200 ms) and rotates the JWT; by the time loadAll fires
  // its individual queries, the token is already fresh.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") loadAllRef.current();
    }
    function handleFocus() {
      loadAllRef.current();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, []); // stable: always dispatches through loadAllRef

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
        loadMyAssignments(),
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
    const { data: profileData } = await supabase
      .from("profiles")
      .select(
        "id, full_name, email, is_active, is_non_technical, invite_pending, ministry, created_at",
      )
      .eq("role", "volunteer")
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (!profileData) return setVolunteers([]);

    const { data: assignmentData } = await supabase
      .from("assignments")
      .select("caller_id, status")
      .eq("week_starting", selectedWeek);

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
      .select(
        `
        id,
        notes,
        contacted_at,
        contact_method,
        prayer_request_resolved,
        members (first_name, last_name),
        profiles!contact_logs_volunteer_id_fkey (full_name)
      `,
      )
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

    const filtered = (data ?? []).filter((m) => {
      if (!m.membership_type) return true;
      const t = m.membership_type.toLowerCase();
      return !t.includes("child") && !t.includes("teen");
    });

    setMembersNoContact(filtered);
  }

  async function loadMyAssignments() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setMyUserId(user.id);

    const weekStarting = getThisSunday();

    const { data: assignmentData } = await supabase
      .from("assignments")
      .select(
        `
      id,
      member_id,
      status,
      week_starting,
      completed_at,
      members (
        id,
        first_name,
        last_name,
        email,
        phone,
        birthday,
        membership_type
      )
    `,
      )
      .eq("caller_id", user.id)
      .eq("week_starting", weekStarting)
      .order("status", { ascending: true });

    setMyAssignments(assignmentData ?? []);

    if (assignmentData && assignmentData.length > 0) {
      const assignmentIds = assignmentData.map((a) => a.id);
      const { data: logData } = await supabase
        .from("contact_logs")
        .select(
          "id, assignment_id, notes, needs_follow_up, contact_method, prayer_request",
        )
        .in("assignment_id", assignmentIds);

      const logMap = {};
      logData?.forEach((log) => {
        logMap[log.assignment_id] = log;
      });
      setMyContactLogs(logMap);
    }
  }

  // --------------------------------------------------------
  // ACTIONS
  // --------------------------------------------------------

  async function approveVolunteer(id) {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: true })
        .eq("id", id);

      // Throw so the outer catch surfaces the error rather than silently
      // proceeding to the assignment generation step with a bad state.
      if (error) throw error;

      // Best-effort: regenerate assignments for the newly approved volunteer.
      // Wrapped in its own try/catch so a generation failure never blocks
      // the approval confirmation from refreshing the volunteer list.
      try {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generateWeeklyAssignments`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              "Content-Type": "application/json",
            },
          },
        );
      } catch (err) {
        console.warn("Could not auto-generate assignments:", err);
      }

      loadPendingVolunteers();
      loadVolunteers();
    } catch {
      alert("Failed to approve volunteer. Please try again.");
    }
  }

  async function deactivateVolunteer(id) {
    if (
      !window.confirm(
        "Are you sure you want to deactivate this volunteer? They will be excluded from future assignments.",
      )
    )
      return;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
      loadVolunteers();
    } catch {
      alert("Failed to deactivate volunteer. Please try again.");
    }
  }

  async function addVolunteer(e) {
    e.preventDefault();
    setAddingVolunteer(true);
    setAddVolunteerError("");

    const isTechnical = newVolunteerType === "technical";

    if (!newVolunteerName.trim()) {
      setAddVolunteerError("Please enter a full name.");
      setAddingVolunteer(false);
      return;
    }

    if (isTechnical && !newVolunteerEmail.trim()) {
      setAddVolunteerError(
        "Please enter an email address for technical volunteers.",
      );
      setAddingVolunteer(false);
      return;
    }

    if (!newVolunteerMinistry) {
      setAddVolunteerError("Please select a ministry.");
      setAddingVolunteer(false);
      return;
    }

    try {
      if (isTechnical) {
        const { data, error } = await supabase.functions.invoke(
          "createVolunteer",
          {
            body: {
              full_name: newVolunteerName.trim(),
              email: newVolunteerEmail.trim(),
              ministry: newVolunteerMinistry,
              is_non_technical: false,
            },
          },
        );

        if (error || data?.error) {
          throw new Error(
            error?.message ?? data?.error ?? "Failed to create volunteer",
          );
        }
      } else {
        // For non-technical volunteers: create a placeholder auth account
        // using a generated email they'll never use. Routes through the
        // same Edge Function as technical volunteers but with
        // is_non_technical = true and invite_pending = false.
        const { data, error } = await supabase.functions.invoke(
          "createVolunteer",
          {
            body: {
              full_name: newVolunteerName.trim(),
              email: `nontechnical_${crypto.randomUUID()}@placeholder.churchcare`,
              ministry: newVolunteerMinistry,
              is_non_technical: true,
            },
          },
        );

        if (error || data?.error) {
          throw new Error(
            error?.message ?? data?.error ?? "Failed to create volunteer",
          );
        }
      }

      setNewVolunteerName("");
      setNewVolunteerEmail("");
      setNewVolunteerMinistry("");
      setNewVolunteerType("technical");
      setShowAddVolunteer(false);
      loadVolunteers();
    } catch (err) {
      setAddVolunteerError(
        err.message ?? "Something went wrong. Please try again.",
      );
    } finally {
      setAddingVolunteer(false);
    }
  }

  async function sendPendingInvites() {
    if (
      !window.confirm(
        "Send invite emails to all volunteers with pending invites?",
      )
    )
      return;
    setSendingInvites(true);

    try {
      const { data, error } =
        await supabase.functions.invoke("sendPendingInvites");
      if (error || data?.error) throw new Error(error?.message ?? data?.error);
      alert(
        `Invites sent successfully to ${data.count} volunteer${data.count !== 1 ? "s" : ""}.`,
      );
      loadVolunteers();
    } catch (err) {
      alert("Failed to send invites: " + err.message);
    } finally {
      setSendingInvites(false);
    }
  }

  async function resolvePrayerRequest(id) {
    try {
      const { error } = await supabase
        .from("contact_logs")
        .update({ prayer_request_resolved: true })
        .eq("id", id);
      if (error) throw error;
      loadPrayerRequests();
    } catch {
      alert("Failed to update prayer request. Please try again.");
    }
  }

  async function resolveFollowUp(id) {
    try {
      const { error } = await supabase
        .from("contact_logs")
        .update({ follow_up_resolved: true })
        .eq("id", id);
      if (error) throw error;
      loadFollowUps();
    } catch {
      alert("Failed to update follow-up. Please try again.");
    }
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

  function handleMyComplete(assignment) {
    setMySelectedAssignment(assignment);
    setMyEditingLog(null);
    setMyModalOpen(true);
  }

  function handleMyEdit(assignment) {
    setMySelectedAssignment(assignment);
    setMyEditingLog(myContactLogs[assignment.id] ?? null);
    setMyModalOpen(true);
  }

  function handleMyModalClose() {
    setMyModalOpen(false);
    setMySelectedAssignment(null);
    setMyEditingLog(null);
  }

  function handleMySaved() {
    loadMyAssignments();
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
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-stone-500 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-amber-100 sticky top-0 z-10 shadow-sm shadow-amber-50/80">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shrink-0">
              <HeartIcon className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-stone-800 truncate">
                  Church Care
                </h1>
                <span className="shrink-0 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                  Admin
                </span>
              </div>
              <p className="text-xs text-stone-400 hidden sm:block leading-none mt-0.5">
                Pastoral care coordination
              </p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-stone-400 hover:text-amber-600 transition-colors shrink-0"
          >
            Sign out
          </button>
        </div>

        {/* Tab navigation */}
        <div className="max-w-6xl mx-auto px-4 pt-2 pb-3 flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <TabButton
            label="Overview"
            active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
          />
          <TabButton
            label="My Contacts"
            active={activeTab === "mycontacts"}
            onClick={() => setActiveTab("mycontacts")}
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
            label="History"
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
          />
          <TabButton
            label="Follow-ups"
            active={activeTab === "followups"}
            onClick={() => setActiveTab("followups")}
            badge={followUps.filter((f) => !f.follow_up_resolved).length}
          />
          <TabButton
            label="Prayer"
            active={activeTab === "prayer"}
            onClick={() => setActiveTab("prayer")}
            badge={
              prayerRequests.filter((p) => !p.prayer_request_resolved).length
            }
          />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Error banner */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-2xl">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Pending volunteers alert */}
        {pendingVolunteers.length > 0 && (
          <div
            onClick={scrollToPending}
            className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-amber-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 bg-amber-500 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                {pendingVolunteers.length}
              </span>
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {pendingVolunteers.length === 1
                    ? "1 volunteer waiting for approval"
                    : `${pendingVolunteers.length} volunteers waiting for approval`}
                </p>
                <p className="text-xs text-amber-600">
                  Tap to review and approve
                </p>
              </div>
            </div>
            <svg
              className="w-5 h-5 text-amber-400 shrink-0"
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

        {/* Week selector */}
        {["overview", "assignments", "volunteers"].includes(activeTab) && (
          <div className="mb-6 flex items-center gap-3">
            <label className="text-sm font-medium text-stone-600 shrink-0">
              Week of:
            </label>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="px-3 py-1.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white text-stone-700"
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
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard
                label="Total Assigned"
                value={assignments.length}
                color="stone"
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
                value={followUps.filter((f) => !f.follow_up_resolved).length}
                color="red"
              />
            </div>

            {membersNoContact.length > 0 && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-2xl">
                <p className="text-sm font-semibold text-orange-800 mb-1">
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
                      className="text-xs bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full"
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
        {/* TAB: MY CONTACTS                                    */}
        {/* -------------------------------------------------- */}
        {activeTab === "mycontacts" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-stone-800">My Contacts</h2>
              <p className="text-sm text-stone-500 mt-1">
                Week of{" "}
                {new Date(getThisSunday() + "T00:00:00").toLocaleDateString(
                  "en-US",
                  {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  },
                )}
              </p>

              {myAssignments.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-stone-500 mb-1.5">
                    <span>
                      {
                        myAssignments.filter((a) => a.status === "completed")
                          .length
                      }{" "}
                      of {myAssignments.length} contacted
                      {myAssignments.filter((a) => a.status === "pending")
                        .length > 0 &&
                        ` · ${myAssignments.filter((a) => a.status === "pending").length} remaining`}
                    </span>
                    {myAssignments.every((a) => a.status === "completed") && (
                      <span className="text-green-600 font-semibold">
                        All done! 🎉
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-stone-100 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-amber-400 to-green-500 h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${(myAssignments.filter((a) => a.status === "completed").length / myAssignments.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {myAssignments.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-amber-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-stone-600 font-medium mb-1">
                  No contacts assigned yet this week
                </h3>
                <p className="text-stone-400 text-sm">
                  Check back after Sunday when new assignments are generated.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 max-w-2xl">
                {myAssignments.map((assignment) => (
                  <MemberCard
                    key={assignment.id}
                    assignment={assignment}
                    onComplete={handleMyComplete}
                    onEdit={handleMyEdit}
                  />
                ))}
              </div>
            )}

            {myModalOpen && mySelectedAssignment && (
              <ContactModal
                assignment={mySelectedAssignment}
                existingLog={myEditingLog}
                onClose={handleMyModalClose}
                onSaved={handleMySaved}
                userId={myUserId}
              />
            )}
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* TAB: ASSIGNMENTS                                    */}
        {/* -------------------------------------------------- */}
        {activeTab === "assignments" && (
          <div>
            <h2 className="text-lg font-bold text-stone-800 mb-4">
              Assignments — {formatDate(selectedWeek)}
            </h2>

            {assignments.length === 0 ? (
              <EmptyState message="No assignments found for this week." />
            ) : (
              <>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {assignments.map((a) => (
                    <div
                      key={a.id}
                      className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-semibold text-stone-800 text-sm">
                          {a.members?.first_name} {a.members?.last_name}
                        </p>
                        <StatusBadge status={a.status} />
                      </div>
                      <p className="text-xs text-stone-500">
                        Volunteer:{" "}
                        <span className="text-stone-700 font-medium">
                          {a.profiles?.full_name}
                        </span>
                      </p>
                      {a.completed_at && (
                        <p className="text-xs text-stone-400 mt-1">
                          {formatDateTime(a.completed_at)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <SectionCard className="hidden sm:block">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[520px]">
                      <TableHeader>
                        <Th>Member</Th>
                        <Th>Volunteer</Th>
                        <Th>Status</Th>
                        <Th>Completed</Th>
                      </TableHeader>
                      <tbody className="divide-y divide-stone-50">
                        {assignments.map((a) => (
                          <tr
                            key={a.id}
                            className="hover:bg-amber-50/30 transition-colors"
                          >
                            <td className="px-4 py-3 text-stone-800 font-medium">
                              {a.members?.first_name} {a.members?.last_name}
                            </td>
                            <td className="px-4 py-3 text-stone-600">
                              {a.profiles?.full_name}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={a.status} />
                            </td>
                            <td className="px-4 py-3 text-stone-400">
                              {a.completed_at
                                ? formatDateTime(a.completed_at)
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              </>
            )}
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* TAB: MEMBERS                                        */}
        {/* -------------------------------------------------- */}
        {activeTab === "members" && (
          <div>
            <h2 className="text-lg font-bold text-stone-800 mb-1">
              Members with No Contact Info
            </h2>
            <p className="text-sm text-stone-500 mb-4">
              These members are excluded from weekly assignments. Update their
              records in Planning Center and the next daily sync will pick up
              the changes.
            </p>

            {membersNoContact.length === 0 ? (
              <GreenNotice>
                ✅ All members have contact information on file.
              </GreenNotice>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {membersNoContact.map((m) => (
                    <div
                      key={m.id}
                      className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm"
                    >
                      <p className="font-semibold text-stone-800 text-sm mb-1">
                        {m.first_name} {m.last_name}
                      </p>
                      <p className="text-xs text-stone-400">
                        No email · No phone
                      </p>
                      <p className="text-xs text-stone-300 font-mono mt-1">
                        {m.id}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <SectionCard className="hidden sm:block">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[480px]">
                      <TableHeader>
                        <Th>Name</Th>
                        <Th>Email</Th>
                        <Th>Phone</Th>
                        <Th>PCO ID</Th>
                      </TableHeader>
                      <tbody className="divide-y divide-stone-50">
                        {membersNoContact.map((m) => (
                          <tr
                            key={m.id}
                            className="hover:bg-amber-50/30 transition-colors"
                          >
                            <td className="px-4 py-3 text-stone-800 font-medium">
                              {m.first_name} {m.last_name}
                            </td>
                            <td className="px-4 py-3 text-stone-400 italic">
                              None
                            </td>
                            <td className="px-4 py-3 text-stone-400 italic">
                              None
                            </td>
                            <td className="px-4 py-3 text-stone-300 font-mono text-xs">
                              {m.id}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              </>
            )}
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* TAB: VOLUNTEERS                                     */}
        {/* -------------------------------------------------- */}
        {activeTab === "volunteers" && (
          <div className="space-y-8">
            {/* Pending approval */}
            <div ref={pendingRef}>
              <h2 className="text-lg font-bold text-stone-800 mb-4">
                Pending Approval
              </h2>

              {pendingVolunteers.length === 0 ? (
                <GreenNotice>✅ No volunteers pending approval.</GreenNotice>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-3">
                    {pendingVolunteers.map((v) => (
                      <div
                        key={v.id}
                        className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-stone-800 text-sm truncate">
                              {v.full_name}
                            </p>
                            <p className="text-xs text-stone-500 truncate">
                              {v.email}
                            </p>
                            <p className="text-xs text-stone-400 mt-1">
                              {formatDateTime(v.created_at)}
                            </p>
                          </div>
                          <button
                            onClick={() => approveVolunteer(v.id)}
                            className="shrink-0 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-xl transition-colors"
                          >
                            Approve
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <SectionCard className="hidden sm:block">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[500px]">
                        <TableHeader>
                          <Th>Name</Th>
                          <Th>Email</Th>
                          <Th>Signed up</Th>
                          <Th>Action</Th>
                        </TableHeader>
                        <tbody className="divide-y divide-stone-50">
                          {pendingVolunteers.map((v) => (
                            <tr
                              key={v.id}
                              className="hover:bg-amber-50/30 transition-colors"
                            >
                              <td className="px-4 py-3 text-stone-800 font-medium">
                                {v.full_name}
                              </td>
                              <td className="px-4 py-3 text-stone-600">
                                {v.email}
                              </td>
                              <td className="px-4 py-3 text-stone-400">
                                {formatDateTime(v.created_at)}
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => approveVolunteer(v.id)}
                                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-xl transition-colors"
                                >
                                  Approve
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                </>
              )}
            </div>

            {/* Active volunteers */}
            <div>
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h2 className="text-lg font-bold text-stone-800">
                  Volunteer Activity — {formatDate(selectedWeek)}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddVolunteer(!showAddVolunteer)}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-xl transition-colors"
                  >
                    + Add Volunteer
                  </button>
                  {volunteers.some((v) => v.invite_pending) && (
                    <button
                      onClick={sendPendingInvites}
                      disabled={sendingInvites}
                      className="px-3 py-1.5 bg-stone-600 hover:bg-stone-700 disabled:bg-stone-300 text-white text-xs font-semibold rounded-xl transition-colors"
                    >
                      {sendingInvites
                        ? "Sending..."
                        : `Send Invites (${volunteers.filter((v) => v.invite_pending).length})`}
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-stone-500 mb-4">
                Volunteers highlighted in red had assignments this week but
                completed none.
              </p>

              {/* Add volunteer form */}
              {showAddVolunteer && (
                <div className="mb-4 p-4 bg-stone-50 border border-stone-200 rounded-2xl">
                  <h3 className="text-sm font-semibold text-stone-700 mb-3">
                    Add New Volunteer
                  </h3>

                  {addVolunteerError && (
                    <div className="mb-3 p-2 bg-red-50 border border-red-100 rounded-xl">
                      <p className="text-red-600 text-xs">
                        {addVolunteerError}
                      </p>
                    </div>
                  )}

                  {/* Volunteer type toggle */}
                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setNewVolunteerType("technical")}
                      className={`flex-1 py-2 text-xs font-medium rounded-xl border transition-colors ${
                        newVolunteerType === "technical"
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-white text-stone-600 border-stone-200 hover:bg-amber-50"
                      }`}
                    >
                      📱 Uses the App
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewVolunteerType("non-technical")}
                      className={`flex-1 py-2 text-xs font-medium rounded-xl border transition-colors ${
                        newVolunteerType === "non-technical"
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-white text-stone-600 border-stone-200 hover:bg-amber-50"
                      }`}
                    >
                      📄 Paper-Based
                    </button>
                  </div>

                  <form onSubmit={addVolunteer} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-600 mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={newVolunteerName}
                        onChange={(e) => setNewVolunteerName(e.target.value)}
                        placeholder="Jane Smith"
                        className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                      />
                    </div>

                    {newVolunteerType === "technical" && (
                      <div>
                        <label className="block text-xs font-medium text-stone-600 mb-1">
                          Email Address *
                        </label>
                        <input
                          type="email"
                          value={newVolunteerEmail}
                          onChange={(e) => setNewVolunteerEmail(e.target.value)}
                          placeholder="jane@example.com"
                          className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-stone-600 mb-1">
                        Ministry *
                      </label>
                      <select
                        value={newVolunteerMinistry}
                        onChange={(e) =>
                          setNewVolunteerMinistry(e.target.value)
                        }
                        className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white text-stone-700"
                      >
                        <option value="">Select ministry...</option>
                        <option value="elder">Elder</option>
                        <option value="deacon">Deacon</option>
                        <option value="greeter">Greeter</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddVolunteer(false);
                          setAddVolunteerError("");
                          setNewVolunteerName("");
                          setNewVolunteerEmail("");
                          setNewVolunteerMinistry("");
                        }}
                        className="flex-1 py-2 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={addingVolunteer}
                        className="flex-1 py-2 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 rounded-xl transition-colors"
                      >
                        {addingVolunteer ? "Adding..." : "Add Volunteer"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {volunteers.length === 0 ? (
                <EmptyState message="No active volunteers found." />
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-3">
                    {volunteers.map((v) => {
                      const zeroCompletion =
                        v.assigned > 0 && v.completed === 0;
                      const allDone =
                        v.completed === v.assigned && v.assigned > 0;
                      return (
                        <div
                          key={v.id}
                          className={`rounded-2xl border p-4 shadow-sm ${
                            zeroCompletion
                              ? "bg-red-50 border-red-100"
                              : "bg-white border-stone-100"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-stone-800 text-sm truncate">
                                  {v.full_name}
                                </p>
                                {v.is_non_technical && (
                                  <span className="text-xs text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                                    📄 Paper
                                  </span>
                                )}
                                {v.invite_pending && (
                                  <span className="text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                    Invite pending
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-stone-500 mt-0.5">
                                {v.ministry
                                  ? v.ministry.charAt(0).toUpperCase() +
                                    v.ministry.slice(1)
                                  : "—"}
                              </p>
                              <p className="text-xs text-stone-500 truncate">
                                {v.is_non_technical ? (
                                  <span className="text-stone-400 italic">
                                    No email
                                  </span>
                                ) : (
                                  v.email
                                )}
                              </p>
                            </div>
                            <button
                              onClick={() => deactivateVolunteer(v.id)}
                              className="shrink-0 px-2.5 py-1 bg-stone-100 hover:bg-red-50 hover:text-red-600 text-stone-500 text-xs font-medium rounded-lg transition-colors"
                            >
                              Deactivate
                            </button>
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-stone-500">
                              {v.assigned} assigned
                            </span>
                            <span
                              className={`text-xs font-semibold ${allDone ? "text-green-600" : zeroCompletion ? "text-red-600" : "text-stone-700"}`}
                            >
                              {v.completed} completed
                            </span>
                            {zeroCompletion && (
                              <span className="text-xs text-red-500">
                                · No contacts this week
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop table */}
                  <SectionCard className="hidden sm:block">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[640px]">
                        <TableHeader>
                          <Th>Name</Th>
                          <Th>Ministry</Th>
                          <Th>Email</Th>
                          <Th>Assigned</Th>
                          <Th>Completed</Th>
                          <Th>Action</Th>
                        </TableHeader>
                        <tbody className="divide-y divide-stone-50">
                          {volunteers.map((v) => {
                            const zeroCompletion =
                              v.assigned > 0 && v.completed === 0;
                            return (
                              <tr
                                key={v.id}
                                className={
                                  zeroCompletion
                                    ? "bg-red-50"
                                    : "hover:bg-amber-50/30 transition-colors"
                                }
                              >
                                <td className="px-4 py-3 font-medium text-stone-800">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {v.full_name}
                                    {v.is_non_technical && (
                                      <span className="text-xs text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                                        📄 Paper
                                      </span>
                                    )}
                                    {v.invite_pending && (
                                      <span className="text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                        Invite pending
                                      </span>
                                    )}
                                    {zeroCompletion && (
                                      <span className="text-xs text-red-500 font-normal">
                                        No contacts this week
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-stone-500 text-xs">
                                  {v.ministry
                                    ? v.ministry.charAt(0).toUpperCase() +
                                      v.ministry.slice(1)
                                    : "—"}
                                </td>
                                <td className="px-4 py-3 text-stone-600">
                                  {v.is_non_technical ? (
                                    <span className="text-stone-400 italic">
                                      None
                                    </span>
                                  ) : (
                                    v.email
                                  )}
                                </td>
                                <td className="px-4 py-3 text-stone-600">
                                  {v.assigned}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`font-semibold ${
                                      v.completed === v.assigned &&
                                      v.assigned > 0
                                        ? "text-green-600"
                                        : zeroCompletion
                                          ? "text-red-600"
                                          : "text-stone-600"
                                    }`}
                                  >
                                    {v.completed}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <button
                                    onClick={() => deactivateVolunteer(v.id)}
                                    className="px-3 py-1.5 bg-stone-100 hover:bg-red-50 hover:text-red-600 text-stone-600 text-xs font-medium rounded-xl transition-colors"
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
                  </SectionCard>
                </>
              )}
            </div>
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* TAB: CONTACT HISTORY                               */}
        {/* -------------------------------------------------- */}
        {activeTab === "history" && (
          <div>
            <h2 className="text-lg font-bold text-stone-800 mb-1">
              Contact History
            </h2>
            <p className="text-sm text-stone-500 mb-4">
              Most recent 100 contacts across all volunteers.
            </p>

            {contactLogs.length === 0 ? (
              <EmptyState message="No contact logs yet." />
            ) : (
              <SectionCard>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[680px]">
                    <TableHeader>
                      <Th>Member</Th>
                      <Th>Volunteer</Th>
                      <Th>Method</Th>
                      <Th>Notes</Th>
                      <Th>Date</Th>
                      <Th>Follow-up</Th>
                    </TableHeader>
                    <tbody className="divide-y divide-stone-50">
                      {contactLogs.map((log) => (
                        <tr
                          key={log.id}
                          className="hover:bg-amber-50/30 transition-colors"
                        >
                          <td className="px-4 py-3 text-stone-800 font-medium whitespace-nowrap">
                            {log.members?.first_name} {log.members?.last_name}
                          </td>
                          <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                            {log.profiles?.full_name}
                          </td>
                          <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                            {formatContactMethod(log.contact_method)}
                          </td>
                          <td className="px-4 py-3 text-stone-600 max-w-xs">
                            <p className="whitespace-normal" title={log.notes}>
                              {log.notes}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-stone-400 whitespace-nowrap">
                            {formatDateTime(log.contacted_at)}
                          </td>
                          <td className="px-4 py-3">
                            {log.needs_follow_up && (
                              <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                                Follow-up
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* TAB: FOLLOW-UPS                                     */}
        {/* -------------------------------------------------- */}
        {activeTab === "followups" && (
          <div>
            <h2 className="text-lg font-bold text-stone-800 mb-1">
              Members Needing Follow-up
            </h2>
            <p className="text-sm text-stone-500 mb-4">
              These members were flagged by a volunteer as needing additional
              pastoral attention.
            </p>

            {followUps.length === 0 ? (
              <GreenNotice>
                ✅ No members currently flagged for follow-up.
              </GreenNotice>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {followUps.map((log) => (
                    <div
                      key={log.id}
                      className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-semibold text-stone-800 text-sm">
                            {log.members?.first_name} {log.members?.last_name}
                          </p>
                          <p className="text-xs text-stone-500 mt-0.5">
                            {formatContactMethod(log.contact_method)} ·{" "}
                            {log.profiles?.full_name}
                          </p>
                        </div>
                        {log.follow_up_resolved ? (
                          <span className="shrink-0 text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                            ✓ Followed up
                          </span>
                        ) : (
                          <button
                            onClick={() => resolveFollowUp(log.id)}
                            className="shrink-0 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-full transition-colors"
                          >
                            Mark done
                          </button>
                        )}
                      </div>
                      {log.notes && (
                        <p className="text-xs text-stone-600 leading-relaxed">
                          {log.notes}
                        </p>
                      )}
                      <p className="text-xs text-stone-400 mt-2">
                        {formatDateTime(log.contacted_at)}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <SectionCard className="hidden sm:block">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[620px]">
                      <TableHeader>
                        <Th>Member</Th>
                        <Th>Flagged by</Th>
                        <Th>Method</Th>
                        <Th>Notes</Th>
                        <Th>Date</Th>
                        <Th>Status</Th>
                      </TableHeader>
                      <tbody className="divide-y divide-stone-50">
                        {followUps.map((log) => (
                          <tr
                            key={log.id}
                            className="hover:bg-amber-50/30 transition-colors"
                          >
                            <td className="px-4 py-3 text-stone-800 font-medium whitespace-nowrap">
                              {log.members?.first_name} {log.members?.last_name}
                            </td>
                            <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                              {log.profiles?.full_name}
                            </td>
                            <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                              {formatContactMethod(log.contact_method)}
                            </td>
                            <td className="px-4 py-3 text-stone-600 max-w-xs">
                              <p
                                className="whitespace-normal"
                                title={log.notes}
                              >
                                {log.notes}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-stone-400 whitespace-nowrap">
                              {formatDateTime(log.contacted_at)}
                            </td>
                            <td className="px-4 py-3">
                              {log.follow_up_resolved ? (
                                <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                                  ✓ Followed up
                                </span>
                              ) : (
                                <button
                                  onClick={() => resolveFollowUp(log.id)}
                                  className="text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-full transition-colors"
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
                </SectionCard>
              </>
            )}
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* TAB: PRAYER REQUESTS                               */}
        {/* -------------------------------------------------- */}
        {activeTab === "prayer" && (
          <div>
            <h2 className="text-lg font-bold text-stone-800 mb-1">
              Prayer Requests
            </h2>
            <p className="text-sm text-stone-500 mb-4">
              Members who have requested prayer from the prayer ministry.
            </p>

            {prayerRequests.length === 0 ? (
              <GreenNotice>✅ No open prayer requests.</GreenNotice>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {prayerRequests.map((log) => (
                    <div
                      key={log.id}
                      className={`rounded-2xl border p-4 shadow-sm ${
                        log.prayer_request_resolved
                          ? "bg-stone-50 border-stone-100 opacity-60"
                          : "bg-white border-stone-100"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-semibold text-stone-800 text-sm">
                            {log.members?.first_name} {log.members?.last_name}
                          </p>
                          <p className="text-xs text-stone-500 mt-0.5">
                            {log.profiles?.full_name}
                          </p>
                        </div>
                        {log.prayer_request_resolved ? (
                          <span className="shrink-0 text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                            ✓ Prayed for
                          </span>
                        ) : (
                          <button
                            onClick={() => resolvePrayerRequest(log.id)}
                            className="shrink-0 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-full transition-colors"
                          >
                            Mark prayed
                          </button>
                        )}
                      </div>
                      {log.notes && (
                        <p className="text-xs text-stone-600 leading-relaxed">
                          {log.notes}
                        </p>
                      )}
                      <p className="text-xs text-stone-400 mt-2">
                        {formatDateTime(log.contacted_at)}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <SectionCard className="hidden sm:block">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[580px]">
                      <TableHeader>
                        <Th>Member</Th>
                        <Th>Volunteer</Th>
                        <Th>Notes</Th>
                        <Th>Date</Th>
                        <Th>Status</Th>
                      </TableHeader>
                      <tbody className="divide-y divide-stone-50">
                        {prayerRequests.map((log) => (
                          <tr
                            key={log.id}
                            className={
                              log.prayer_request_resolved
                                ? "bg-stone-50 opacity-60"
                                : "hover:bg-amber-50/30 transition-colors"
                            }
                          >
                            <td className="px-4 py-3 text-stone-800 font-medium whitespace-nowrap">
                              {log.members?.first_name} {log.members?.last_name}
                            </td>
                            <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                              {log.profiles?.full_name}
                            </td>
                            <td className="px-4 py-3 text-stone-600 max-w-xs">
                              <p
                                className="whitespace-normal"
                                title={log.notes}
                              >
                                {log.notes}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-stone-400 whitespace-nowrap">
                              {formatDateTime(log.contacted_at)}
                            </td>
                            <td className="px-4 py-3">
                              {log.prayer_request_resolved ? (
                                <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                                  ✓ Prayed for
                                </span>
                              ) : (
                                <button
                                  onClick={() => resolvePrayerRequest(log.id)}
                                  className="text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-full transition-colors"
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
                </SectionCard>
              </>
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
    stone: "bg-stone-100 text-stone-700 border-stone-200",
    green: "bg-green-50 text-green-700 border-green-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    red: "bg-red-50 text-red-700 border-red-100",
  };
  return (
    <div className={`p-4 sm:p-5 rounded-2xl border ${colors[color]}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm mt-1 opacity-80">{label}</p>
    </div>
  );
}
