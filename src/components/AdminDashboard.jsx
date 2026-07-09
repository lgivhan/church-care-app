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

import { useEffect, useRef, useState } from "react";
import { supabase, getTokenSafe, getAccessToken } from "../lib/supabaseClient";
import {
  getThisFriday,
  sortAssignments,
  getDaysLeftInCycle,
  getMembershipLabel,
} from "../lib/utils";
import MemberCard from "./MemberCard";
import ContactModal from "./ContactModal";
import PrintView from "./PrintView";
import AdHocContactModal from "./AdHocContactModal";
import ContactCelebration from "./ContactCelebration";
import FAQDrawer from "./FAQDrawer";

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

function getRecentFridays(count = 16) {
  const fridays = [];
  const today = new Date();
  const thisFriday = new Date(today);
  thisFriday.setDate(today.getDate() - ((today.getDay() - 5 + 7) % 7));

  for (let i = 0; i < count; i++) {
    const friday = new Date(thisFriday);
    friday.setDate(thisFriday.getDate() - i * 7);
    const year = friday.getFullYear();
    const month = String(friday.getMonth() + 1).padStart(2, "0");
    const day = String(friday.getDate()).padStart(2, "0");
    fridays.push(`${year}-${month}-${day}`);
  }
  return fridays;
}

function formatContactMethod(method) {
  const map = {
    call: "📞 Call",
    text: "💬 Text",
    email: "✉️ Email",
    voicemail: "📱 Voicemail",
    in_person: "🤝 In Person",
    snail_mail: "📬 Snail Mail",
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
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [activeCycleWeek, setActiveCycleWeek] = useState(null);
  const recentFridays = getRecentFridays();

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
  const [myAdHocLogs, setMyAdHocLogs] = useState([]);
  const [myCycleStart, setMyCycleStart] = useState(null);
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
  const [sendingInviteTo, setSendingInviteTo] = useState(null);
  const [volunteerMinistryFilter, setVolunteerMinistryFilter] = useState("");
  const [volunteerPaperOnly, setVolunteerPaperOnly] = useState(false);
  const [showInactiveVolunteers, setShowInactiveVolunteers] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null); // { id, name }
  const [showSendInvitesConfirm, setShowSendInvitesConfirm] = useState(false);
  const [invitesSentCount, setInvitesSentCount] = useState(null);
  const [volunteerSearch, setVolunteerSearch] = useState("");
  const [selectedVolunteer, setSelectedVolunteer] = useState(null);
  const [showVolunteerDropdown, setShowVolunteerDropdown] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [printNotice, setPrintNotice] = useState("");
  const [adHocModalOpen, setAdHocModalOpen] = useState(false);
  const [proxyModalOpen, setProxyModalOpen] = useState(false);
  const [proxyAssignment, setProxyAssignment] = useState(null);
  const [proxyVolunteer, setProxyVolunteer] = useState(null);
  const [proxyExistingLog, setProxyExistingLog] = useState(null);
  const [adminUserId, setAdminUserId] = useState(null);
  const [myFullName, setMyFullName] = useState(null);
  const [resolvingPrayerIds, setResolvingPrayerIds] = useState(new Set());
  const [resolvingFollowUpIds, setResolvingFollowUpIds] = useState(new Set());
  const [printVolunteers, setPrintVolunteers] = useState([]);
  const [printAssignmentsByVolunteer, setPrintAssignmentsByVolunteer] =
    useState({});
  const [showPrint, setShowPrint] = useState(false);

  // Contacts tab
  const [allMembers, setAllMembers] = useState([]);
  const [contactsSearch, setContactsSearch] = useState("");
  const [contactsTypeFilter, setContactsTypeFilter] = useState("");
  const [contactsSort, setContactsSort] = useState({
    col: "last_contacted",
    dir: "asc",
  });
  const [showExcludedContacts, setShowExcludedContacts] = useState(false);
  const [noteTarget, setNoteTarget] = useState(null); // { id, name }
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // History tab filters
  const [historyMemberSearch, setHistoryMemberSearch] = useState("");
  const [historyVolunteerId, setHistoryVolunteerId] = useState("");
  const [historyMethod, setHistoryMethod] = useState("");
  const [historyFollowUpOnly, setHistoryFollowUpOnly] = useState(false);
  const [historyPrayerOnly, setHistoryPrayerOnly] = useState(false);
  const [historyNotHeardFrom, setHistoryNotHeardFrom] = useState(false);

  const [showCelebration, setShowCelebration] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState(null); // { message, type: 'success' | 'error' }
  const toastTimerRef = useRef(null);

  function showToast(message, type = "success") {
    clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }

  // On mount: detect the active cycle (same 14-day window logic as volunteer
  // dashboard) so the default selection always shows real assignments even on
  // mid-cycle Fridays when no new cycle has started yet.
  useEffect(() => {
    async function detectActiveCycle() {
      const today = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      const windowDate = new Date(today);
      windowDate.setDate(today.getDate() - 13);
      const windowStr = `${windowDate.getFullYear()}-${pad(windowDate.getMonth() + 1)}-${pad(windowDate.getDate())}`;

      const { data } = await supabase
        .from("assignments")
        .select("week_starting")
        .lte("week_starting", todayStr)
        .gte("week_starting", windowStr)
        .order("week_starting", { ascending: false })
        .limit(1);

      const detected = data?.[0]?.week_starting ?? getThisFriday();
      setActiveCycleWeek(detected);
      setSelectedWeek(detected);
    }
    detectActiveCycle();
  }, []);

  useEffect(() => {
    if (!selectedWeek) return;
    loadAll();
    setVolunteerSearch("");
    setSelectedVolunteer(null);
    setMemberSearch("");
  }, [selectedWeek]); // eslint-disable-line react-hooks/exhaustive-deps

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
        loadAllMembers(),
      ]);
    } catch (err) {
      setError(
        "Failed to load dashboard data. Please refresh." +
          (import.meta.env.VITE_SUPPORT_PHONE
            ? ` If it keeps happening, text Lee a screenshot at ${import.meta.env.VITE_SUPPORT_PHONE}.`
            : ""),
      );
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
        profiles!assignments_caller_id_fkey (full_name, email, ministry, is_non_technical),
        members (first_name, last_name, email, phone, address, birthday, membership_type, avatar_url, care_note)
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
        "id, full_name, email, role, is_active, is_non_technical, invite_pending, ministry, created_at, gender_filter",
      )
      .in("role", ["volunteer", "admin"])
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (!profileData) return setVolunteers([]);

    // If someone has both a volunteer and admin profile (e.g. was added as a
    // volunteer before being promoted), keep only the admin entry.
    const seen = new Map();
    for (const p of profileData) {
      const key = p.email || p.id;
      if (!seen.has(key) || p.role === "admin") seen.set(key, p);
    }
    const dedupedProfiles = [...seen.values()];

    const { data: assignmentData } = await supabase
      .from("assignments")
      .select("caller_id, status")
      .eq("week_starting", selectedWeek);

    const statsMap = {};
    dedupedProfiles.forEach((p) => {
      statsMap[p.id] = { assigned: 0, completed: 0 };
    });

    assignmentData?.forEach((a) => {
      if (statsMap[a.caller_id]) {
        statsMap[a.caller_id].assigned++;
        if (a.status === "completed") statsMap[a.caller_id].completed++;
      }
    });

    setVolunteers(
      dedupedProfiles.map((p) => ({
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
        member_id,
        notes,
        contacted_at,
        needs_follow_up,
        contact_method,
        prayer_request,
        heard_from,
        volunteer_id,
        members (first_name, last_name),
        profiles!contact_logs_volunteer_id_fkey (full_name),
        logged_by_profile:profiles!contact_logs_logged_by_fkey (full_name)
      `,
      )
      .order("contacted_at", { ascending: false });
    setContactLogs(data ?? []);
  }

  async function loadAllMembers() {
    const { data } = await supabase
      .from("members")
      .select(
        "id, first_name, last_name, membership_type, excluded_from_assignments, gender, is_child, care_note",
      )
      .order("last_name", { ascending: true });
    setAllMembers(data ?? []);
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
        follow_up_resolved_at,
        members (first_name, last_name),
        profiles!contact_logs_volunteer_id_fkey (full_name),
        follow_up_resolved_by_profile:profiles!contact_logs_follow_up_resolved_by_fkey (full_name)
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
        prayer_resolved_at,
        members (first_name, last_name),
        profiles!contact_logs_volunteer_id_fkey (full_name),
        prayer_resolved_by_profile:profiles!contact_logs_prayer_resolved_by_fkey (full_name)
      `,
      )
      .eq("prayer_request", true)
      .order("contacted_at", { ascending: false });
    setPrayerRequests(data ?? []);
  }

  async function loadMembersNoContact() {
    const { data } = await supabase
      .from("members")
      .select(
        "id, first_name, last_name, email, phone, address, membership_type",
      )
      .is("email", null)
      .is("phone", null)
      .is("address", null)
      .eq("is_child", false)
      .eq("excluded_from_assignments", false)
      .order("last_name", { ascending: true });

    setMembersNoContact(data ?? []);
  }

  async function loadMyAssignments() {
    // Destructure safely: getUser() can return { data: null } on network
    // error (not just { data: { user: null } }), which would throw a
    // TypeError and break Promise.all in loadAll().
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data?.user) return;
    const user = data.user;
    setMyUserId(user.id);
    setAdminUserId(user.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    setMyFullName(profile?.full_name ?? null);

    // Build a 14-day window ending today to find the active cycle.
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const cycleWindowStart = (() => {
      const d = new Date(today);
      d.setDate(d.getDate() - 13);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();

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
        address,
        birthday,
        membership_type,
        avatar_url,
        care_note
      )
    `,
      )
      .eq("caller_id", user.id)
      .lte("week_starting", todayStr)
      .gte("week_starting", cycleWindowStart)
      .order("week_starting", { ascending: false })
      .order("status", { ascending: true });

    const activeCycleStart = assignmentData?.[0]?.week_starting ?? todayStr;
    setMyCycleStart(activeCycleStart);
    setMyAssignments(
      sortAssignments(
        (assignmentData ?? []).filter(
          (a) => a.week_starting === activeCycleStart,
        ),
      ),
    );

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

    const nextCycleStarting = (() => {
      const d = new Date(activeCycleStart + "T00:00:00");
      d.setDate(d.getDate() + 14);
      return d.toISOString();
    })();

    const { data: adHocData } = await supabase
      .from("contact_logs")
      .select(
        `
        id,
        notes,
        contact_method,
        contacted_at,
        needs_follow_up,
        members (first_name, last_name)
      `,
      )
      .eq("volunteer_id", user.id)
      .is("assignment_id", null)
      .gte("contacted_at", activeCycleStart + "T00:00:00.000Z")
      .lt("contacted_at", nextCycleStarting);

    setMyAdHocLogs(adHocData ?? []);
  }

  // --------------------------------------------------------
  // ACTIONS
  // --------------------------------------------------------

  async function approveVolunteer(id) {
    try {
      const token = getAccessToken() ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ is_active: true }),
        },
      );
      if (!res.ok) throw new Error(await res.text());

      // Best-effort: regenerate assignments for the newly approved volunteer.
      // Wrapped in its own try/catch so a generation failure never blocks
      // the approval confirmation from refreshing the volunteer list.
      try {
        const assignToken = await getTokenSafe();
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generateWeeklyAssignments`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${assignToken}`,
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
      showToast("Failed to approve volunteer. Please try again.", "error");
    }
  }

  function deactivateVolunteer(id, name) {
    setDeactivateTarget({ id, name });
  }

  async function confirmDeactivate() {
    const { id } = deactivateTarget;
    setDeactivateTarget(null);
    try {
      const token = getAccessToken() ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ is_active: false }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const deactivated = volunteers.find((v) => v.id === id);
      setVolunteers((prev) => prev.filter((v) => v.id !== id));
      if (deactivated) {
        setPendingVolunteers((prev) =>
          [
            ...prev,
            {
              id: deactivated.id,
              full_name: deactivated.full_name,
              email: deactivated.email,
              created_at: deactivated.created_at,
            },
          ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
        );
      }
    } catch {
      showToast("Failed to deactivate volunteer. Please try again.", "error");
    }
  }

  async function toggleMemberExclusion(memberId, currentlyExcluded) {
    try {
      const token = getAccessToken() ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/members?id=eq.${memberId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            excluded_from_assignments: !currentlyExcluded,
          }),
        },
      );
      if (!res.ok) throw new Error(await res.text());

      // When excluding, immediately remove any pending assignment for this
      // member in the current cycle so volunteers don't see them anymore.
      if (!currentlyExcluded && activeCycleWeek) {
        const delRes = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/assignments?member_id=eq.${memberId}&week_starting=eq.${activeCycleWeek}&status=eq.pending`,
          {
            method: "DELETE",
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${token}`,
              Prefer: "return=minimal",
            },
          },
        );
        if (!delRes.ok) throw new Error(await delRes.text());
      }

      setAllMembers((prev) =>
        prev.map((m) =>
          m.id === memberId
            ? { ...m, excluded_from_assignments: !currentlyExcluded }
            : m,
        ),
      );
      showToast(
        currentlyExcluded
          ? "Member re-included in assignments."
          : "Member excluded from assignments.",
      );
    } catch {
      showToast("Failed to update member. Please try again.", "error");
    }
  }

  function openNoteModal(row) {
    setNoteTarget({ id: row.id, name: row.name });
    setNoteDraft(row.careNote ?? "");
  }

  async function saveCareNote() {
    if (!noteTarget || savingNote) return;
    const { id } = noteTarget;
    const note = noteDraft.trim() || null;
    setSavingNote(true);
    try {
      const token = getAccessToken() ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/members?id=eq.${id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ care_note: note }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      setAllMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, care_note: note } : m)),
      );
      setNoteTarget(null);
      showToast(note ? "Note saved." : "Note removed.");
    } catch {
      showToast("Failed to save note. Please try again.", "error");
    } finally {
      setSavingNote(false);
    }
  }

  async function toggleVolunteerNonTechnical(
    volunteerId,
    currentlyNonTechnical,
  ) {
    setVolunteers((prev) =>
      prev.map((v) =>
        v.id === volunteerId
          ? { ...v, is_non_technical: !currentlyNonTechnical }
          : v,
      ),
    );
    const { error } = await supabase
      .from("profiles")
      .update({ is_non_technical: !currentlyNonTechnical })
      .eq("id", volunteerId);
    if (error) {
      setVolunteers((prev) =>
        prev.map((v) =>
          v.id === volunteerId
            ? { ...v, is_non_technical: currentlyNonTechnical }
            : v,
        ),
      );
      showToast("Failed to update volunteer. Please try again.", "error");
    } else {
      showToast(
        currentlyNonTechnical
          ? "Volunteer set to digital."
          : "Volunteer set to paper only.",
      );
    }
  }

  async function updateGenderFilter(volunteerId, value) {
    const prev =
      volunteers.find((v) => v.id === volunteerId)?.gender_filter ?? null;
    setVolunteers((prevVols) =>
      prevVols.map((v) =>
        v.id === volunteerId ? { ...v, gender_filter: value } : v,
      ),
    );
    try {
      const token = getAccessToken() ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${volunteerId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ gender_filter: value }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
    } catch {
      setVolunteers((prevVols) =>
        prevVols.map((v) =>
          v.id === volunteerId ? { ...v, gender_filter: prev } : v,
        ),
      );
      showToast("Failed to update contact filter. Please try again.", "error");
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

    // Raw fetch bypasses supabase.functions.invoke() — which internally
    // calls getSession() and can block on auth-js's refreshingDeferred
    // if a background token refresh is in flight. getAccessToken() reads
    // the stored token directly from localStorage with no network calls
    // and no interaction with the deferred. AbortController enforces a
    // hard 15-second ceiling so the button always unlocks.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const body = isTechnical
        ? {
            full_name: newVolunteerName.trim(),
            email: newVolunteerEmail.trim(),
            ministry: newVolunteerMinistry,
            is_non_technical: false,
          }
        : {
            // Non-technical volunteers get a placeholder email they never use.
            full_name: newVolunteerName.trim(),
            email: `nontechnical_${crypto.randomUUID()}@placeholder.churchcare`,
            ministry: newVolunteerMinistry,
            is_non_technical: true,
          };

      const token = getAccessToken();
      if (!token) {
        clearTimeout(timeoutId);
        setAddingVolunteer(false);
        setAddVolunteerError(
          "Your session has expired. Please sign out and sign back in.",
        );
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/createVolunteer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed (${response.status})`);
      }

      const result = await response.json();

      // Insert directly into state — avoids calling loadVolunteers(), which
      // goes through supabase.from() → getSession() → refreshingDeferred hang.
      const newVolunteer = {
        id: result.user_id,
        full_name: body.full_name,
        email: isTechnical ? body.email : null,
        is_active: true,
        is_non_technical: !isTechnical,
        invite_pending: isTechnical,
        ministry: body.ministry,
        created_at: new Date().toISOString(),
        assigned: 0,
        completed: 0,
      };
      setVolunteers((prev) =>
        [...prev, newVolunteer].sort((a, b) =>
          (a.full_name ?? "").localeCompare(b.full_name ?? ""),
        ),
      );

      setNewVolunteerName("");
      setNewVolunteerEmail("");
      setNewVolunteerMinistry("");
      setNewVolunteerType("technical");
      setShowAddVolunteer(false);
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
      setAddVolunteerError(
        `${detail} (${time} — screenshot this and send to Lee)`,
      );
    } finally {
      clearTimeout(timeoutId);
      setAddingVolunteer(false);
    }
  }

  async function sendPendingInvites() {
    setShowSendInvitesConfirm(false);

    const token = getAccessToken();
    if (!token) {
      showToast(
        "Your session has expired. Please sign out and sign back in.",
        "error",
      );
      return;
    }

    setSendingInvites(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sendPendingInvites`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed (${response.status})`);
      }

      const data = await response.json();
      setInvitesSentCount(data.count);
      setVolunteers((prev) =>
        prev.map((v) => ({ ...v, invite_pending: false })),
      );
    } catch (err) {
      const support = import.meta.env.VITE_SUPPORT_PHONE
        ? ` Text Lee a screenshot at ${import.meta.env.VITE_SUPPORT_PHONE} if it keeps happening.`
        : "";
      const message =
        err.name === "AbortError"
          ? `Request timed out. Please check your connection and try again.${support}`
          : "Failed to send invites: " + err.message + support;
      showToast(message, "error");
    } finally {
      clearTimeout(timeoutId);
      setSendingInvites(false);
    }
  }

  async function sendSingleInvite(volunteerId, volunteerName) {
    const token = getAccessToken();
    if (!token) {
      showToast(
        "Your session has expired. Please sign out and sign back in.",
        "error",
      );
      return;
    }

    setSendingInviteTo(volunteerId);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sendPendingInvites`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ user_id: volunteerId }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed (${response.status})`);
      }

      showToast(
        `Invite sent to ${volunteerName}. Ask them to check their email.`,
      );
    } catch (err) {
      const support = import.meta.env.VITE_SUPPORT_PHONE
        ? ` Text Lee a screenshot at ${import.meta.env.VITE_SUPPORT_PHONE} if it keeps happening.`
        : "";
      const message =
        err.name === "AbortError"
          ? `Request timed out. Please check your connection and try again.${support}`
          : "Failed to send invite: " + err.message + support;
      showToast(message, "error");
    } finally {
      clearTimeout(timeoutId);
      setSendingInviteTo(null);
    }
  }

  async function resolvePrayerRequest(id) {
    if (resolvingPrayerIds.has(id)) return;
    setResolvingPrayerIds((prev) => new Set(prev).add(id));
    const resolvedAt = new Date().toISOString();
    try {
      const { error } = await supabase
        .from("contact_logs")
        .update({
          prayer_request_resolved: true,
          prayer_resolved_at: resolvedAt,
          prayer_resolved_by: myUserId,
        })
        .eq("id", id);
      if (error) throw error;
      setPrayerRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                prayer_request_resolved: true,
                prayer_resolved_at: resolvedAt,
                prayer_resolved_by_profile: { full_name: myFullName },
              }
            : r,
        ),
      );
    } catch {
      showToast("Failed to update prayer request. Please try again.", "error");
    } finally {
      setResolvingPrayerIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function resolveFollowUp(id) {
    if (resolvingFollowUpIds.has(id)) return;
    setResolvingFollowUpIds((prev) => new Set(prev).add(id));
    const resolvedAt = new Date().toISOString();
    try {
      const { error } = await supabase
        .from("contact_logs")
        .update({
          follow_up_resolved: true,
          follow_up_resolved_at: resolvedAt,
          follow_up_resolved_by: myUserId,
        })
        .eq("id", id);
      if (error) throw error;
      setFollowUps((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                follow_up_resolved: true,
                follow_up_resolved_at: resolvedAt,
                follow_up_resolved_by_profile: { full_name: myFullName },
              }
            : f,
        ),
      );
    } catch {
      showToast("Failed to update follow-up. Please try again.", "error");
    } finally {
      setResolvingFollowUpIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function handleProxyLog(assignment) {
    setProxyAssignment(assignment);
    setProxyVolunteer({
      id: assignment.caller_id,
      full_name: assignment.profiles?.full_name ?? "",
    });
    setProxyExistingLog(null);
    setProxyModalOpen(true);
  }

  async function handleProxyEdit(assignment) {
    try {
      const base = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/contact_logs`;
      const select =
        "id,assignment_id,notes,needs_follow_up,contact_method,prayer_request";
      const token = getAccessToken() ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      };

      const res = await fetch(
        `${base}?select=${select}&assignment_id=eq.${assignment.id}&order=contacted_at.desc&limit=1`,
        { headers },
      );
      if (!res.ok) throw new Error(await res.text());
      const logs = await res.json();

      setProxyAssignment(assignment);
      setProxyVolunteer({
        id: assignment.caller_id,
        full_name: assignment.profiles?.full_name ?? "",
      });
      setProxyExistingLog(logs[0] ?? null);
      setProxyModalOpen(true);
    } catch (err) {
      showToast("Could not load contact log. Please try again.", "error");
    }
  }

  function handleProxyModalClose() {
    setProxyModalOpen(false);
    setProxyAssignment(null);
    setProxyVolunteer(null);
    setProxyExistingLog(null);
  }

  function handleProxySaved({ isEditing, assignmentId, completedAt }) {
    if (!isEditing) {
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === assignmentId
            ? { ...a, status: "completed", completed_at: completedAt }
            : a,
        ),
      );
    }
  }

  function handlePrint(assignmentsToUse) {
    const volunteerMap = {};
    const byVolunteer = {};
    assignmentsToUse.forEach((a) => {
      if (!volunteerMap[a.caller_id]) {
        volunteerMap[a.caller_id] = {
          id: a.caller_id,
          full_name: a.profiles?.full_name ?? "",
          ministry: a.profiles?.ministry ?? "",
        };
        byVolunteer[a.caller_id] = [];
      }
      byVolunteer[a.caller_id].push(a);
    });

    const vols = Object.values(volunteerMap).sort((a, b) =>
      a.full_name.localeCompare(b.full_name),
    );

    if (vols.length === 0) {
      setPrintNotice("No assignments to print this week.");
      setTimeout(() => setPrintNotice(""), 4000);
      return;
    }

    setPrintVolunteers(vols);
    setPrintAssignmentsByVolunteer(byVolunteer);
    setShowPrint(true);
    setTimeout(() => {
      window.print();
      setShowPrint(false);
    }, 150);
  }

  function handleSignOut() {
    supabase.auth.signOut();
    window.location.replace("/login");
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

  function handleMySaved({ isEditing, assignmentId, completedAt, log }) {
    if (!isEditing) {
      setMyAssignments((prev) =>
        sortAssignments(
          prev.map((a) =>
            a.id === assignmentId
              ? { ...a, status: "completed", completed_at: completedAt }
              : a,
          ),
        ),
      );
      setShowCelebration(true);
    }
    setMyContactLogs((prev) => ({
      ...prev,
      [assignmentId]: { ...(prev[assignmentId] ?? {}), ...log },
    }));
  }

  // --------------------------------------------------------
  // DERIVED DATA
  // --------------------------------------------------------

  const pendingAssignments = assignments.filter((a) => a.status === "pending");
  const completedAssignments = assignments.filter(
    (a) => a.status === "completed",
  );

  const filteredAssignments = assignments.filter((a) => {
    if (selectedVolunteer && a.caller_id !== selectedVolunteer.id) return false;
    if (memberSearch.trim()) {
      const q = memberSearch.trim().toLowerCase();
      const name =
        `${a.members?.first_name ?? ""} ${a.members?.last_name ?? ""}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  let notHeardFromMemberIds = null;
  if (historyNotHeardFrom) {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const lastHeardMap = {};
    contactLogs.forEach((log) => {
      if (log.heard_from === true && log.member_id) {
        const t = new Date(log.contacted_at);
        if (!lastHeardMap[log.member_id] || t > lastHeardMap[log.member_id]) {
          lastHeardMap[log.member_id] = t;
        }
      }
    });
    const allMemberIds = [
      ...new Set(contactLogs.map((l) => l.member_id).filter(Boolean)),
    ];
    notHeardFromMemberIds = new Set(
      allMemberIds.filter(
        (mid) => !lastHeardMap[mid] || lastHeardMap[mid] < cutoff,
      ),
    );
  }

  const filteredContactLogs = contactLogs.filter((log) => {
    if (historyMemberSearch.trim()) {
      const full =
        `${log.members?.first_name ?? ""} ${log.members?.last_name ?? ""}`.toLowerCase();
      if (!full.includes(historyMemberSearch.trim().toLowerCase()))
        return false;
    }
    if (historyVolunteerId && log.volunteer_id !== historyVolunteerId)
      return false;
    if (historyMethod && log.contact_method !== historyMethod) return false;
    if (historyFollowUpOnly && !log.needs_follow_up) return false;
    if (historyPrayerOnly && !log.prayer_request) return false;
    if (
      notHeardFromMemberIds !== null &&
      !notHeardFromMemberIds.has(log.member_id)
    )
      return false;
    return true;
  });

  const filteredVolunteerOptions = volunteerSearch.trim()
    ? volunteers.filter((v) =>
        v.full_name.toLowerCase().includes(volunteerSearch.toLowerCase()),
      )
    : volunteers;

  const displayedVolunteers = volunteers.filter((v) => {
    if (volunteerPaperOnly && !v.is_non_technical) return false;
    if (volunteerMinistryFilter && v.ministry !== volunteerMinistryFilter)
      return false;
    return true;
  });

  // Contacts tab — derive last contacted + last heard from per member
  const lastContactedMap = {};
  const lastHeardFromMap = {};
  contactLogs.forEach((log) => {
    if (!log.member_id) return;
    const ts = new Date(log.contacted_at).getTime();
    if (
      !lastContactedMap[log.member_id] ||
      ts > lastContactedMap[log.member_id].ts
    ) {
      lastContactedMap[log.member_id] = {
        ts,
        date: log.contacted_at,
        volunteer: log.profiles?.full_name ?? null,
      };
    }
    if (log.heard_from === true) {
      if (
        !lastHeardFromMap[log.member_id] ||
        ts > lastHeardFromMap[log.member_id].ts
      ) {
        lastHeardFromMap[log.member_id] = {
          ts,
          date: log.contacted_at,
          volunteer: log.profiles?.full_name ?? null,
        };
      }
    }
  });

  const contactTypes = [
    ...new Set(
      allMembers
        .map((m) => getMembershipLabel(m.membership_type)?.label)
        .filter(Boolean),
    ),
  ].sort();

  function handleContactsSort(col) {
    setContactsSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "asc" },
    );
  }

  const contactsRows = allMembers
    .filter((m) => {
      if (
        contactsTypeFilter &&
        getMembershipLabel(m.membership_type)?.label !== contactsTypeFilter
      )
        return false;
      if (contactsSearch.trim()) {
        const q = contactsSearch.trim().toLowerCase();
        if (!`${m.first_name} ${m.last_name}`.toLowerCase().includes(q))
          return false;
      }
      return true;
    })
    .map((m) => ({
      id: m.id,
      name: `${m.first_name} ${m.last_name}`,
      membership_type: m.membership_type,
      membershipLabel: getMembershipLabel(m.membership_type)?.label ?? null,
      lastContacted: lastContactedMap[m.id] ?? null,
      lastHeardFrom: lastHeardFromMap[m.id] ?? null,
      excluded: m.excluded_from_assignments ?? false,
      careNote: m.care_note ?? null,
    }))
    .sort((a, b) => {
      const { col, dir } = contactsSort;
      const mult = dir === "asc" ? 1 : -1;
      if (col === "name") return mult * a.name.localeCompare(b.name);
      if (col === "membership_type") {
        return (
          mult *
          (a.membershipLabel ?? "").localeCompare(b.membershipLabel ?? "")
        );
      }
      const field =
        col === "last_contacted" ? "lastContacted" : "lastHeardFrom";
      const va = a[field]?.ts ?? null;
      const vb = b[field]?.ts ?? null;
      if (va === null && vb === null) return 0;
      // nulls (never contacted) sort first on asc, last on desc
      if (va === null) return dir === "asc" ? -1 : 1;
      if (vb === null) return dir === "asc" ? 1 : -1;
      return mult * (va - vb);
    });

  const activeContactsRows = contactsRows.filter((r) => !r.excluded);
  const excludedContactsRows = contactsRows.filter((r) => r.excluded);

  const hasGenderFilteredVolunteers = volunteers.some((v) => v.gender_filter);
  const membersNoGender = hasGenderFilteredVolunteers
    ? allMembers.filter(
        (m) => !m.is_child && !m.excluded_from_assignments && !m.gender,
      )
    : [];

  const membersNoMembership = allMembers.filter(
    (m) => !m.is_child && !m.excluded_from_assignments && !m.membership_type,
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
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg text-sm font-medium transition-all ${
            toast.type === "error"
              ? "bg-red-600 text-white"
              : "bg-stone-800 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

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
        <div className="max-w-6xl mx-auto px-4 pt-2 pb-3 flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:justify-center">
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
            label="Participants"
            active={activeTab === "volunteers"}
            onClick={() => setActiveTab("volunteers")}
          />
          <TabButton
            label="Contacts"
            active={activeTab === "contacts"}
            onClick={() => setActiveTab("contacts")}
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
              {recentFridays.map((friday) => (
                <option key={friday} value={friday}>
                  {formatDate(friday)}
                  {friday === activeCycleWeek ? " (current)" : ""}
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

            {assignments.length > 0 && (
              <div>
                <div className="flex items-center justify-between text-xs text-stone-500 mb-1.5">
                  <span>
                    {completedAssignments.length} of {assignments.length}{" "}
                    contacted
                    {pendingAssignments.length > 0 &&
                      ` · ${pendingAssignments.length} remaining`}
                  </span>
                  {completedAssignments.length === assignments.length ? (
                    <span className="text-green-600 font-semibold">
                      All done! 🎉
                    </span>
                  ) : selectedWeek === activeCycleWeek ? (
                    (() => {
                      const daysLeft = getDaysLeftInCycle(selectedWeek);
                      return daysLeft !== null ? (
                        <span
                          className={`font-medium px-2 py-0.5 rounded-full ${
                            daysLeft <= 3
                              ? "bg-red-100 text-red-700"
                              : daysLeft <= 7
                                ? "bg-amber-100 text-amber-700"
                                : "bg-green-100 text-green-700"
                          }`}
                        >
                          {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
                        </span>
                      ) : null;
                    })()
                  ) : null}
                </div>
                <div className="w-full bg-stone-100 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-amber-400 to-green-500 h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${(completedAssignments.length / assignments.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

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

            {membersNoGender.length > 0 && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                <p className="text-sm font-semibold text-blue-800 mb-1">
                  ℹ️ {membersNoGender.length} member
                  {membersNoGender.length !== 1 ? "s" : ""} have no gender set
                  in Planning Center
                </p>
                <p className="text-xs text-blue-600 mb-3">
                  Gender-filtered volunteers are active. These members will only
                  be assigned to volunteers who contact all genders. Update
                  their gender in Planning Center to include them in filtered
                  pools.
                </p>
                <div className="flex flex-wrap gap-2">
                  {membersNoGender.map((m) => (
                    <span
                      key={m.id}
                      className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full"
                    >
                      {m.first_name} {m.last_name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {membersNoMembership.length > 0 && (
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl">
                <p className="text-sm font-semibold text-purple-800 mb-1">
                  ℹ️ {membersNoMembership.length} member
                  {membersNoMembership.length !== 1 ? "s" : ""} have no
                  membership type set in Planning Center
                </p>
                <p className="text-xs text-purple-600 mb-3">
                  Update their membership type in Planning Center so they can be
                  properly categorized.
                </p>
                <div className="flex flex-wrap gap-2">
                  {membersNoMembership.map((m) => (
                    <span
                      key={m.id}
                      className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full"
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
          <div className="max-w-2xl mx-auto">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-stone-800">My Contacts</h2>
              <p className="text-sm text-stone-500 mt-1">
                Cycle starting{" "}
                {myCycleStart
                  ? new Date(myCycleStart + "T00:00:00").toLocaleDateString(
                      "en-US",
                      {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      },
                    )
                  : "—"}
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
                    {(() => {
                      const myDaysLeft = myCycleStart
                        ? getDaysLeftInCycle(myCycleStart)
                        : null;
                      return myAssignments.every(
                        (a) => a.status === "completed",
                      ) ? (
                        <span className="text-green-600 font-semibold">
                          All done! 🎉
                        </span>
                      ) : myDaysLeft !== null ? (
                        <span
                          className={`font-medium px-2 py-0.5 rounded-full ${
                            myDaysLeft <= 3
                              ? "bg-red-100 text-red-700"
                              : myDaysLeft <= 7
                                ? "bg-amber-100 text-amber-700"
                                : "bg-green-100 text-green-700"
                          }`}
                        >
                          {myDaysLeft} day{myDaysLeft !== 1 ? "s" : ""} left
                        </span>
                      ) : null;
                    })()}
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
                  No contacts assigned yet this cycle
                </h3>
                <p className="text-stone-400 text-sm">
                  Check back after Friday when new assignments are generated.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full">
                {myAssignments.map((assignment) => (
                  <MemberCard
                    key={`${assignment.id}-${assignment.status}`}
                    assignment={assignment}
                    onComplete={handleMyComplete}
                    onEdit={handleMyEdit}
                  />
                ))}
              </div>
            )}

            {myAdHocLogs.length > 0 && (
              <div className="mt-8 max-w-2xl mx-auto w-full">
                <div className="mb-3">
                  <h2 className="text-base font-semibold text-stone-700">
                    Contacts added by your coordinator
                  </h2>
                  <p className="text-xs text-stone-400 mt-0.5">
                    These were logged on your behalf and are already recorded.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {myAdHocLogs.map((log) => {
                    const member = log.members;
                    const contactedDate = new Date(
                      log.contacted_at,
                    ).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                    });
                    const methodLabels = {
                      call: "Phone Call",
                      text: "Text Message",
                      email: "Email",
                      voicemail: "Voicemail",
                      in_person: "In Person",
                      snail_mail: "Snail Mail",
                    };
                    return (
                      <div
                        key={log.id}
                        className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3.5 flex flex-col gap-2 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-stone-800 text-sm">
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
                        <p className="text-xs text-stone-500">
                          {methodLabels[log.contact_method] ??
                            log.contact_method ??
                            "Unknown"}{" "}
                          &middot; {contactedDate}
                        </p>
                        {log.notes && (
                          <p className="text-sm text-stone-600 leading-relaxed">
                            {log.notes}
                          </p>
                        )}
                        {log.needs_follow_up && (
                          <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 w-fit">
                            Flagged for follow-up
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
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
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-lg font-bold text-stone-800">
                Assignments — {formatDate(selectedWeek)}
              </h2>
              <div className="flex gap-2 flex-wrap items-center">
                {printNotice && (
                  <span className="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-xl">
                    {printNotice}
                  </span>
                )}
                <button
                  onClick={() =>
                    handlePrint(
                      assignments.filter(
                        (a) => a.profiles?.is_non_technical === true,
                      ),
                    )
                  }
                  className="px-3 py-1.5 text-xs font-medium text-stone-600 bg-white border border-stone-200 hover:bg-stone-50 rounded-xl transition-colors"
                >
                  📄 Print all paper only
                </button>
                {selectedVolunteer && (
                  <>
                    <button
                      onClick={() => setAdHocModalOpen(true)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors"
                    >
                      + Log Unassigned Contact for{" "}
                      {selectedVolunteer.full_name.split(" ")[0]}
                    </button>
                    <button
                      onClick={() => handlePrint(filteredAssignments)}
                      className="px-3 py-1.5 text-xs font-medium text-stone-600 bg-white border border-stone-200 hover:bg-stone-50 rounded-xl transition-colors"
                    >
                      🖨 Print {selectedVolunteer.full_name.split(" ")[0]}'s
                      Sheet
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={volunteerSearch}
                  onChange={(e) => {
                    setVolunteerSearch(e.target.value);
                    setSelectedVolunteer(null);
                    setShowVolunteerDropdown(true);
                  }}
                  onFocus={() => setShowVolunteerDropdown(true)}
                  onBlur={() =>
                    setTimeout(() => setShowVolunteerDropdown(false), 150)
                  }
                  placeholder="Filter by volunteer..."
                  className="w-full px-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
                {showVolunteerDropdown &&
                  filteredVolunteerOptions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {filteredVolunteerOptions.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onMouseDown={() => {
                            setSelectedVolunteer(v);
                            setVolunteerSearch(v.full_name);
                            setShowVolunteerDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-amber-50 transition-colors font-medium text-stone-800"
                        >
                          {v.full_name}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Filter by member..."
                  className="w-full px-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>
            </div>

            {filteredAssignments.length === 0 ? (
              <EmptyState
                message={
                  selectedVolunteer
                    ? `No assignments found for ${selectedVolunteer.full_name}.`
                    : "No assignments found for this week."
                }
              />
            ) : (
              <>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {filteredAssignments.map((a) => (
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
                      <p className="text-xs text-stone-500 mb-1">
                        Volunteer:{" "}
                        <span className="text-stone-700 font-medium">
                          {a.profiles?.full_name}
                        </span>
                      </p>
                      {a.completed_at && (
                        <p className="text-xs text-stone-400 mb-2">
                          {formatDateTime(a.completed_at)}
                        </p>
                      )}
                      <div className="mt-2">
                        {a.status === "pending" ? (
                          <button
                            onClick={() => handleProxyLog(a)}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors"
                          >
                            Log Contact
                          </button>
                        ) : (
                          <button
                            onClick={() => handleProxyEdit(a)}
                            className="px-3 py-1.5 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors"
                          >
                            Edit Log
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <SectionCard className="hidden sm:block">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[620px]">
                      <TableHeader>
                        <Th>Member</Th>
                        <Th>Volunteer</Th>
                        <Th>Status</Th>
                        <Th>Completed</Th>
                        <Th>Action</Th>
                      </TableHeader>
                      <tbody className="divide-y divide-stone-50">
                        {filteredAssignments.map((a) => (
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
                            <td className="px-4 py-3">
                              {a.status === "pending" ? (
                                <button
                                  onClick={() => handleProxyLog(a)}
                                  className="px-3 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors"
                                >
                                  Log Contact
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleProxyEdit(a)}
                                  className="px-3 py-1.5 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors"
                                >
                                  Edit Log
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
        {/* TAB: VOLUNTEERS                                     */}
        {/* -------------------------------------------------- */}
        {activeTab === "volunteers" && (
          <div className="space-y-8">
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
                      onClick={() => setShowSendInvitesConfirm(true)}
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
              <p className="text-sm text-stone-500 mb-3">
                Volunteers highlighted in red had assignments this week but
                completed none.
              </p>

              {/* Volunteer filters */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <select
                  value={volunteerMinistryFilter}
                  onChange={(e) => setVolunteerMinistryFilter(e.target.value)}
                  className="px-3 py-1.5 border border-stone-200 rounded-xl text-xs text-stone-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="">All ministries</option>
                  <option value="elder">Elder</option>
                  <option value="deacon">Deacon</option>
                  <option value="greeter">Greeter</option>
                  <option value="other">Other</option>
                </select>
                <button
                  onClick={() => setVolunteerPaperOnly((p) => !p)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    volunteerPaperOnly
                      ? "bg-stone-700 text-white border-stone-700"
                      : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  📄 Paper only
                </button>
                {(volunteerMinistryFilter || volunteerPaperOnly) && (
                  <button
                    onClick={() => {
                      setVolunteerMinistryFilter("");
                      setVolunteerPaperOnly(false);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {/* Add volunteer form */}
              {showAddVolunteer && (
                <div className="mb-4 p-4 bg-stone-50 border border-stone-200 rounded-2xl">
                  <h3 className="text-sm font-semibold text-stone-700 mb-3">
                    Add New Volunteer
                  </h3>

                  {addVolunteerError && (
                    <div className="mb-3 p-3 bg-red-50 border border-red-300 rounded-xl">
                      <p className="text-red-700 text-sm font-medium mb-0.5">
                        Something went wrong
                      </p>
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
                    {displayedVolunteers.map((v) => {
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
                                {v.role === "admin" && (
                                  <span className="text-xs text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                                    Admin
                                  </span>
                                )}
                                {v.is_non_technical && (
                                  <span className="text-xs text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                                    📄 Paper
                                  </span>
                                )}
                                {v.invite_pending && v.role !== "admin" && (
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
                            <div className="flex flex-col gap-1 shrink-0">
                              {v.invite_pending && v.role !== "admin" && (
                                <button
                                  onClick={() =>
                                    sendSingleInvite(v.id, v.full_name)
                                  }
                                  disabled={sendingInviteTo === v.id}
                                  className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 disabled:opacity-50 text-amber-800 text-xs font-medium rounded-lg transition-colors"
                                >
                                  {sendingInviteTo === v.id
                                    ? "Sending..."
                                    : "Send Invite"}
                                </button>
                              )}
                              <button
                                onClick={() =>
                                  toggleVolunteerNonTechnical(
                                    v.id,
                                    v.is_non_technical,
                                  )
                                }
                                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                                  v.is_non_technical
                                    ? "bg-stone-200 text-stone-700 hover:bg-stone-300"
                                    : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                                }`}
                              >
                                {v.is_non_technical
                                  ? "📄 Paper only"
                                  : "Set paper only"}
                              </button>
                              {v.role !== "admin" && (
                                <button
                                  onClick={() =>
                                    deactivateVolunteer(v.id, v.full_name)
                                  }
                                  className="px-2.5 py-1 bg-stone-100 hover:bg-red-50 hover:text-red-600 text-stone-500 text-xs font-medium rounded-lg transition-colors"
                                >
                                  Deactivate
                                </button>
                              )}
                            </div>
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
                          <div className="mt-2">
                            <select
                              value={v.gender_filter ?? ""}
                              onChange={(e) =>
                                updateGenderFilter(v.id, e.target.value || null)
                              }
                              className="px-2 py-1 text-xs border border-stone-200 rounded-lg bg-white text-stone-600 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            >
                              <option value="">All genders</option>
                              <option value="female">Women only</option>
                              <option value="male">Men only</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop table */}
                  <SectionCard className="hidden sm:block">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[780px]">
                        <TableHeader>
                          <Th>Name</Th>
                          <Th>Ministry</Th>
                          <Th>Contacts</Th>
                          <Th>Email</Th>
                          <Th>Assigned</Th>
                          <Th>Completed</Th>
                          <Th>Action</Th>
                        </TableHeader>
                        <tbody className="divide-y divide-stone-50">
                          {displayedVolunteers.map((v) => {
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
                                    {v.role === "admin" && (
                                      <span className="text-xs text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                                        Admin
                                      </span>
                                    )}
                                    {v.is_non_technical && (
                                      <span className="text-xs text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                                        📄 Paper
                                      </span>
                                    )}
                                    {v.invite_pending && v.role !== "admin" && (
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
                                <td className="px-4 py-3">
                                  <select
                                    value={v.gender_filter ?? ""}
                                    onChange={(e) =>
                                      updateGenderFilter(
                                        v.id,
                                        e.target.value || null,
                                      )
                                    }
                                    className="px-2 py-1 text-xs border border-stone-200 rounded-lg bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                  >
                                    <option value="">All genders</option>
                                    <option value="female">Women only</option>
                                    <option value="male">Men only</option>
                                  </select>
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
                                  <div className="flex flex-col gap-1">
                                    <button
                                      onClick={() =>
                                        toggleVolunteerNonTechnical(
                                          v.id,
                                          v.is_non_technical,
                                        )
                                      }
                                      className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-colors ${
                                        v.is_non_technical
                                          ? "bg-stone-200 text-stone-700 hover:bg-stone-300"
                                          : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                                      }`}
                                    >
                                      {v.is_non_technical
                                        ? "📄 Paper only"
                                        : "Set paper only"}
                                    </button>
                                    {v.invite_pending && v.role !== "admin" && (
                                      <button
                                        onClick={() =>
                                          sendSingleInvite(v.id, v.full_name)
                                        }
                                        disabled={sendingInviteTo === v.id}
                                        className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 disabled:opacity-50 text-amber-800 text-xs font-medium rounded-xl transition-colors"
                                      >
                                        {sendingInviteTo === v.id
                                          ? "Sending..."
                                          : "Send Invite"}
                                      </button>
                                    )}
                                    {v.role !== "admin" && (
                                      <button
                                        onClick={() =>
                                          deactivateVolunteer(v.id, v.full_name)
                                        }
                                        className="px-3 py-1.5 bg-stone-100 hover:bg-red-50 hover:text-red-600 text-stone-600 text-xs font-medium rounded-xl transition-colors"
                                      >
                                        Deactivate
                                      </button>
                                    )}
                                  </div>
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

            {/* Inactive / pending volunteers — collapsible */}
            <div>
              <button
                onClick={() => setShowInactiveVolunteers((v) => !v)}
                className="flex items-center gap-2 text-sm font-medium text-stone-500 hover:text-stone-700 transition-colors"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showInactiveVolunteers ? "rotate-90" : ""}`}
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
                Inactive Volunteers
                {pendingVolunteers.length > 0 && (
                  <span className="ml-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    {pendingVolunteers.length} pending approval
                  </span>
                )}
              </button>

              {showInactiveVolunteers && (
                <div className="mt-4">
                  {pendingVolunteers.length === 0 ? (
                    <GreenNotice>✅ No inactive volunteers.</GreenNotice>
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
              )}
            </div>
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* TAB: CONTACTS                                       */}
        {/* -------------------------------------------------- */}
        {activeTab === "contacts" && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-lg font-bold text-stone-800">All Contacts</h2>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  value={contactsSearch}
                  onChange={(e) => setContactsSearch(e.target.value)}
                  placeholder="Search by name..."
                  className="w-full sm:w-48 px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
                <select
                  value={contactsTypeFilter}
                  onChange={(e) => setContactsTypeFilter(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white text-stone-700"
                >
                  <option value="">All types</option>
                  {contactTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {activeContactsRows.length === 0 &&
            excludedContactsRows.length === 0 ? (
              <EmptyState
                message={
                  contactsSearch || contactsTypeFilter
                    ? "No contacts match the current filters."
                    : "No contacts found."
                }
              />
            ) : (
              <>
                {/* Mobile cards — active contacts */}
                <div className="sm:hidden space-y-3">
                  {activeContactsRows.map((row) => (
                    <div
                      key={row.id}
                      className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-semibold text-stone-800 text-sm">
                          {row.name}
                        </p>
                        {row.membershipLabel && (
                          <span className="shrink-0 text-xs text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
                            {row.membershipLabel}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-stone-500">
                          <span className="font-medium text-stone-600">
                            Last contacted:
                          </span>{" "}
                          {row.lastContacted ? (
                            <>
                              {new Date(
                                row.lastContacted.date,
                              ).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}{" "}
                              by {row.lastContacted.volunteer ?? "—"}
                            </>
                          ) : (
                            <span className="text-stone-400">Never</span>
                          )}
                        </p>
                        <p className="text-xs text-stone-500">
                          <span className="font-medium text-stone-600">
                            Last heard from:
                          </span>{" "}
                          {row.lastHeardFrom ? (
                            <>
                              {new Date(
                                row.lastHeardFrom.date,
                              ).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}{" "}
                              by {row.lastHeardFrom.volunteer ?? "—"}
                            </>
                          ) : (
                            <span className="text-stone-400">Never</span>
                          )}
                        </p>
                      </div>
                      {row.careNote && (
                        <p className="mt-2 text-xs text-sky-800 bg-sky-50 border border-sky-100 rounded-lg px-2.5 py-1.5">
                          📝 {row.careNote}
                        </p>
                      )}
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          onClick={() => openNoteModal(row)}
                          className="text-xs px-3 py-1 rounded-lg font-medium transition-colors bg-sky-50 text-sky-700 hover:bg-sky-100"
                        >
                          {row.careNote ? "Edit Note" : "Add Note"}
                        </button>
                        <button
                          onClick={() =>
                            toggleMemberExclusion(row.id, row.excluded)
                          }
                          className="text-xs px-3 py-1 rounded-lg font-medium transition-colors bg-stone-100 text-stone-600 hover:bg-red-50 hover:text-red-700"
                        >
                          Exclude
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table — active contacts */}
                <SectionCard className="hidden sm:block">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[800px]">
                      <TableHeader>
                        {[
                          { col: "name", label: "Contact Name" },
                          { col: "membership_type", label: "Type" },
                          { col: "last_contacted", label: "Last Contacted" },
                          { col: "last_heard_from", label: "Last Heard From" },
                        ].map(({ col, label }) => (
                          <th
                            key={col}
                            onClick={() => handleContactsSort(col)}
                            className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wide cursor-pointer select-none hover:text-stone-700 transition-colors"
                          >
                            <span className="inline-flex items-center gap-1">
                              {label}
                              {contactsSort.col === col ? (
                                <span className="text-amber-500">
                                  {contactsSort.dir === "asc" ? "↑" : "↓"}
                                </span>
                              ) : (
                                <span className="text-stone-300">↕</span>
                              )}
                            </span>
                          </th>
                        ))}
                        <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wide">
                          Note
                        </th>
                        <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wide">
                          Assignments
                        </th>
                      </TableHeader>
                      <tbody className="divide-y divide-stone-50">
                        {activeContactsRows.map((row) => (
                          <tr
                            key={row.id}
                            className="hover:bg-amber-50/30 transition-colors"
                          >
                            <td className="px-4 py-3 font-medium text-stone-800 whitespace-nowrap">
                              {row.name}
                            </td>
                            <td className="px-4 py-3 text-stone-500 whitespace-nowrap">
                              {row.membershipLabel ?? (
                                <span className="text-stone-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                              {row.lastContacted ? (
                                <>
                                  {new Date(
                                    row.lastContacted.date,
                                  ).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}{" "}
                                  <span className="text-stone-400">
                                    by {row.lastContacted.volunteer ?? "—"}
                                  </span>
                                </>
                              ) : (
                                <span className="text-stone-400">Never</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                              {row.lastHeardFrom ? (
                                <>
                                  {new Date(
                                    row.lastHeardFrom.date,
                                  ).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}{" "}
                                  <span className="text-stone-400">
                                    by {row.lastHeardFrom.volunteer ?? "—"}
                                  </span>
                                </>
                              ) : (
                                <span className="text-stone-400">Never</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => openNoteModal(row)}
                                title={row.careNote ?? "Add a note"}
                                className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors max-w-[200px] truncate block text-left ${
                                  row.careNote
                                    ? "bg-sky-50 text-sky-700 hover:bg-sky-100"
                                    : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                                }`}
                              >
                                {row.careNote ?? "+ Add note"}
                              </button>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <button
                                onClick={() =>
                                  toggleMemberExclusion(row.id, row.excluded)
                                }
                                className="text-xs px-3 py-1 rounded-lg font-medium transition-colors bg-stone-100 text-stone-600 hover:bg-red-50 hover:text-red-700"
                              >
                                Exclude
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>

                {/* Excluded contacts — collapsible */}
                {excludedContactsRows.length > 0 && (
                  <div className="mt-6">
                    <button
                      onClick={() => setShowExcludedContacts((v) => !v)}
                      className="flex items-center gap-2 text-sm font-medium text-stone-500 hover:text-stone-700 transition-colors"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${showExcludedContacts ? "rotate-90" : ""}`}
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
                      Excluded Contacts
                      <span className="ml-1 text-xs font-semibold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full">
                        {excludedContactsRows.length}
                      </span>
                    </button>

                    {showExcludedContacts && (
                      <div className="mt-4">
                        {/* Mobile cards — excluded */}
                        <div className="sm:hidden space-y-3">
                          {excludedContactsRows.map((row) => (
                            <div
                              key={row.id}
                              className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm opacity-60"
                            >
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <p className="font-semibold text-stone-800 text-sm">
                                  {row.name}
                                </p>
                                {row.membershipLabel && (
                                  <span className="shrink-0 text-xs text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
                                    {row.membershipLabel}
                                  </span>
                                )}
                              </div>
                              <div className="mt-3 flex justify-end">
                                <button
                                  onClick={() =>
                                    toggleMemberExclusion(row.id, row.excluded)
                                  }
                                  className="text-xs px-3 py-1 rounded-lg font-medium transition-colors bg-green-50 text-green-700 hover:bg-green-100"
                                >
                                  Re-include
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Desktop table — excluded */}
                        <SectionCard className="hidden sm:block mt-3">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[800px]">
                              <TableHeader>
                                <Th>Contact Name</Th>
                                <Th>Type</Th>
                                <Th>Last Contacted</Th>
                                <Th>Last Heard From</Th>
                                <Th>Assignments</Th>
                              </TableHeader>
                              <tbody className="divide-y divide-stone-50">
                                {excludedContactsRows.map((row) => (
                                  <tr
                                    key={row.id}
                                    className="opacity-60 hover:opacity-100 transition-opacity"
                                  >
                                    <td className="px-4 py-3 font-medium text-stone-800 whitespace-nowrap">
                                      {row.name}
                                    </td>
                                    <td className="px-4 py-3 text-stone-500 whitespace-nowrap">
                                      {row.membershipLabel ?? (
                                        <span className="text-stone-300">
                                          —
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                                      {row.lastContacted ? (
                                        <>
                                          {new Date(
                                            row.lastContacted.date,
                                          ).toLocaleDateString("en-US", {
                                            month: "short",
                                            day: "numeric",
                                            year: "numeric",
                                          })}{" "}
                                          <span className="text-stone-400">
                                            by{" "}
                                            {row.lastContacted.volunteer ?? "—"}
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-stone-400">
                                          Never
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                                      {row.lastHeardFrom ? (
                                        <>
                                          {new Date(
                                            row.lastHeardFrom.date,
                                          ).toLocaleDateString("en-US", {
                                            month: "short",
                                            day: "numeric",
                                            year: "numeric",
                                          })}{" "}
                                          <span className="text-stone-400">
                                            by{" "}
                                            {row.lastHeardFrom.volunteer ?? "—"}
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-stone-400">
                                          Never
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <button
                                        onClick={() =>
                                          toggleMemberExclusion(
                                            row.id,
                                            row.excluded,
                                          )
                                        }
                                        className="text-xs px-3 py-1 rounded-lg font-medium transition-colors bg-green-50 text-green-700 hover:bg-green-100"
                                      >
                                        Re-include
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </SectionCard>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* TAB: CONTACT HISTORY                               */}
        {/* -------------------------------------------------- */}
        {activeTab === "history" && (
          <div>
            <h2 className="text-lg font-bold text-stone-800 mb-4">
              Contact History
            </h2>

            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input
                type="text"
                value={historyMemberSearch}
                onChange={(e) => setHistoryMemberSearch(e.target.value)}
                placeholder="Search member..."
                className="w-full sm:w-auto px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
              <select
                value={historyVolunteerId}
                onChange={(e) => setHistoryVolunteerId(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white text-stone-700"
              >
                <option value="">All volunteers</option>
                {volunteers.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.full_name}
                  </option>
                ))}
              </select>
              <select
                value={historyMethod}
                onChange={(e) => setHistoryMethod(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white text-stone-700"
              >
                <option value="">All methods</option>
                <option value="call">Call</option>
                <option value="text">Text</option>
                <option value="email">Email</option>
                <option value="voicemail">Voicemail</option>
                <option value="in_person">In Person</option>
                <option value="snail_mail">Snail Mail</option>
              </select>
              <button
                onClick={() => setHistoryFollowUpOnly((p) => !p)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  historyFollowUpOnly
                    ? "bg-stone-700 text-white border-stone-700"
                    : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                }`}
              >
                Follow-up only
              </button>
              <button
                onClick={() => setHistoryPrayerOnly((p) => !p)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  historyPrayerOnly
                    ? "bg-stone-700 text-white border-stone-700"
                    : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                }`}
              >
                Prayer request only
              </button>
              <button
                onClick={() => setHistoryNotHeardFrom((p) => !p)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  historyNotHeardFrom
                    ? "bg-rose-600 text-white border-rose-600"
                    : "bg-white text-stone-600 border-stone-200 hover:bg-rose-50"
                }`}
              >
                Not heard from (2+ wks)
              </button>
              {(historyMemberSearch ||
                historyVolunteerId ||
                historyMethod ||
                historyFollowUpOnly ||
                historyPrayerOnly ||
                historyNotHeardFrom) && (
                <button
                  onClick={() => {
                    setHistoryMemberSearch("");
                    setHistoryVolunteerId("");
                    setHistoryMethod("");
                    setHistoryFollowUpOnly(false);
                    setHistoryPrayerOnly(false);
                    setHistoryNotHeardFrom(false);
                  }}
                  className="px-3 py-2.5 rounded-xl text-sm text-stone-400 hover:text-stone-600 transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Method breakdown */}
            {filteredContactLogs.length > 0 && (
              <div className="mb-4 p-4 bg-white border border-stone-100 rounded-2xl shadow-sm">
                <p className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-3">
                  Contact method breakdown
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    { key: "call", label: "📞 Call" },
                    { key: "text", label: "💬 Text" },
                    { key: "email", label: "✉️ Email" },
                    { key: "voicemail", label: "📱 Voicemail" },
                    { key: "in_person", label: "🤝 In Person" },
                    { key: "snail_mail", label: "📬 Snail Mail" },
                  ]
                    .map(({ key, label }) => ({
                      key,
                      label,
                      count: filteredContactLogs.filter(
                        (l) => l.contact_method === key,
                      ).length,
                    }))
                    .filter(({ count }) => count > 0)
                    .map(({ key, label, count }) => {
                      const pct = Math.round(
                        (count / filteredContactLogs.length) * 100,
                      );
                      return (
                        <div key={key} className="flex items-center gap-3">
                          <span className="text-sm text-stone-600 w-28 shrink-0">
                            {label}
                          </span>
                          <div className="flex-1 bg-stone-100 rounded-full h-2">
                            <div
                              className="bg-amber-400 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-stone-400 w-16 text-right shrink-0">
                            {count} ({pct}%)
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Result count */}
            <p className="text-sm text-stone-500 mb-4">
              {filteredContactLogs.length}{" "}
              {filteredContactLogs.length === 1 ? "contact" : "contacts"}
            </p>

            {filteredContactLogs.length === 0 ? (
              <EmptyState
                message={
                  historyMemberSearch ||
                  historyVolunteerId ||
                  historyMethod ||
                  historyFollowUpOnly ||
                  historyNotHeardFrom
                    ? "No contacts match the current filters."
                    : "No contact logs yet."
                }
              />
            ) : (
              <>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {filteredContactLogs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="font-semibold text-stone-800 text-sm">
                          {log.members?.first_name} {log.members?.last_name}
                        </p>
                        <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                          {log.heard_from === true && (
                            <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                              Reached
                            </span>
                          )}
                          {log.heard_from === false && (
                            <span className="text-xs font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
                              No answer
                            </span>
                          )}
                          {log.needs_follow_up && (
                            <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                              Follow-up
                            </span>
                          )}
                          {log.prayer_request && (
                            <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                              Prayer
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-stone-500 mb-1">
                        {log.profiles?.full_name} ·{" "}
                        {formatContactMethod(log.contact_method)}
                        {log.logged_by_profile?.full_name && (
                          <span className="text-stone-400">
                            {" "}
                            via {log.logged_by_profile.full_name}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-stone-400 mb-2">
                        {formatDateTime(log.contacted_at)}
                      </p>
                      {log.notes && (
                        <p className="text-xs text-stone-600 leading-relaxed">
                          {log.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <SectionCard className="hidden sm:block">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[680px]">
                      <TableHeader>
                        <Th>Member</Th>
                        <Th>Volunteer</Th>
                        <Th>Method</Th>
                        <Th>Reached?</Th>
                        <Th>Notes</Th>
                        <Th>Date</Th>
                        <Th>Follow-up</Th>
                      </TableHeader>
                      <tbody className="divide-y divide-stone-50">
                        {filteredContactLogs.map((log) => (
                          <tr
                            key={log.id}
                            className="hover:bg-amber-50/30 transition-colors"
                          >
                            <td className="px-4 py-3 text-stone-800 font-medium whitespace-nowrap">
                              {log.members?.first_name} {log.members?.last_name}
                            </td>
                            <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                              {log.profiles?.full_name}
                              {log.logged_by_profile?.full_name && (
                                <span className="block text-xs text-stone-400">
                                  via {log.logged_by_profile.full_name}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                              {formatContactMethod(log.contact_method)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {log.heard_from === true && (
                                <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                  Reached
                                </span>
                              )}
                              {log.heard_from === false && (
                                <span className="text-xs font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
                                  No answer
                                </span>
                              )}
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
              </>
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
                          <div className="shrink-0 text-right">
                            <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                              ✓ Followed up
                            </span>
                            {(log.follow_up_resolved_by_profile?.full_name ||
                              log.follow_up_resolved_at) && (
                              <p className="text-xs text-stone-400 mt-1">
                                {log.follow_up_resolved_by_profile
                                  ?.full_name && (
                                  <span>
                                    by{" "}
                                    {
                                      log.follow_up_resolved_by_profile
                                        .full_name
                                    }
                                  </span>
                                )}
                                {log.follow_up_resolved_by_profile?.full_name &&
                                  log.follow_up_resolved_at &&
                                  " · "}
                                {log.follow_up_resolved_at &&
                                  formatDateTime(log.follow_up_resolved_at)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => resolveFollowUp(log.id)}
                            disabled={resolvingFollowUpIds.has(log.id)}
                            className="shrink-0 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 px-2.5 py-1 rounded-full transition-colors"
                          >
                            {resolvingFollowUpIds.has(log.id)
                              ? "Saving..."
                              : "Mark done"}
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
                                <div>
                                  <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                                    ✓ Followed up
                                  </span>
                                  {(log.follow_up_resolved_by_profile
                                    ?.full_name ||
                                    log.follow_up_resolved_at) && (
                                    <p className="text-xs text-stone-400 mt-1">
                                      {log.follow_up_resolved_by_profile
                                        ?.full_name &&
                                        `marked by ${log.follow_up_resolved_by_profile.full_name}`}
                                      {log.follow_up_resolved_by_profile
                                        ?.full_name &&
                                        log.follow_up_resolved_at &&
                                        " · "}
                                      {log.follow_up_resolved_at &&
                                        formatDateTime(
                                          log.follow_up_resolved_at,
                                        )}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={() => resolveFollowUp(log.id)}
                                  disabled={resolvingFollowUpIds.has(log.id)}
                                  className="text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 px-2.5 py-1 rounded-full transition-colors"
                                >
                                  {resolvingFollowUpIds.has(log.id)
                                    ? "Saving..."
                                    : "Mark as followed up"}
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
                          <div className="shrink-0 text-right">
                            <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                              ✓ Prayed for
                            </span>
                            {(log.prayer_resolved_by_profile?.full_name ||
                              log.prayer_resolved_at) && (
                              <p className="text-xs text-stone-400 mt-1">
                                {log.prayer_resolved_by_profile?.full_name &&
                                  `marked by ${log.prayer_resolved_by_profile.full_name}`}
                                {log.prayer_resolved_by_profile?.full_name &&
                                  log.prayer_resolved_at &&
                                  " · "}
                                {log.prayer_resolved_at &&
                                  formatDateTime(log.prayer_resolved_at)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => resolvePrayerRequest(log.id)}
                            disabled={resolvingPrayerIds.has(log.id)}
                            className="shrink-0 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 px-2.5 py-1 rounded-full transition-colors"
                          >
                            {resolvingPrayerIds.has(log.id)
                              ? "Saving..."
                              : "Mark prayed"}
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
                                <div>
                                  <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                                    ✓ Prayed for
                                  </span>
                                  {(log.prayer_resolved_by_profile?.full_name ||
                                    log.prayer_resolved_at) && (
                                    <p className="text-xs text-stone-400 mt-1">
                                      {log.prayer_resolved_by_profile
                                        ?.full_name &&
                                        `marked by ${log.prayer_resolved_by_profile.full_name}`}
                                      {log.prayer_resolved_by_profile
                                        ?.full_name &&
                                        log.prayer_resolved_at &&
                                        " · "}
                                      {log.prayer_resolved_at &&
                                        formatDateTime(log.prayer_resolved_at)}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={() => resolvePrayerRequest(log.id)}
                                  disabled={resolvingPrayerIds.has(log.id)}
                                  className="text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 px-2.5 py-1 rounded-full transition-colors"
                                >
                                  {resolvingPrayerIds.has(log.id)
                                    ? "Saving..."
                                    : "Mark as prayed for"}
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

      {/* Proxy contact modal — admin logs on behalf of a volunteer */}
      {proxyModalOpen && proxyAssignment && (
        <ContactModal
          assignment={proxyAssignment}
          existingLog={proxyExistingLog}
          onClose={handleProxyModalClose}
          onSaved={handleProxySaved}
          userId={adminUserId}
          onBehalfOf={proxyVolunteer}
          loggedById={adminUserId}
        />
      )}

      {/* Ad-hoc contact modal — log a contact with no formal assignment */}
      {adHocModalOpen && adminUserId && (
        <AdHocContactModal
          volunteers={volunteers}
          selectedWeek={selectedWeek}
          adminUserId={adminUserId}
          initialVolunteer={selectedVolunteer}
          onClose={() => setAdHocModalOpen(false)}
          onSaved={() => {
            setAdHocModalOpen(false);
            loadContactLogs();
            showToast("Contact log saved. View it in the History tab.");
          }}
        />
      )}

      {/* Print view — portal-rendered, only visible during window.print() */}
      {showPrint && (
        <PrintView
          volunteers={printVolunteers}
          assignmentsByVolunteer={printAssignmentsByVolunteer}
          weekStarting={selectedWeek}
        />
      )}

      {/* Contact note modal */}
      {noteTarget && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setNoteTarget(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
              <h2 className="text-base font-semibold text-stone-800 mb-2">
                Note for {noteTarget.name}
              </h2>
              <p className="text-sm text-stone-500 mb-4">
                Shown to whoever is assigned to contact this person — e.g.
                &ldquo;Cannot receive text messages.&rdquo;
              </p>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={3}
                placeholder="Add a note…"
                className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm bg-stone-50 text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none mb-4"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setNoteTarget(null)}
                  className="flex-1 py-2.5 text-sm font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveCareNote}
                  disabled={savingNote}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 rounded-xl transition-colors"
                >
                  {savingNote ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Deactivate confirmation modal */}
      {deactivateTarget && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setDeactivateTarget(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
              <h2 className="text-base font-semibold text-stone-800 mb-2">
                Deactivate volunteer?
              </h2>
              <p className="text-sm text-stone-500 mb-6">
                <span className="font-medium text-stone-700">
                  {deactivateTarget.name}
                </span>{" "}
                will be excluded from all future assignments. This can be
                reversed by re-approving them later.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeactivateTarget(null)}
                  className="flex-1 py-2.5 text-sm font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeactivate}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors"
                >
                  Deactivate
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Send invites confirmation modal */}
      {showSendInvitesConfirm && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setShowSendInvitesConfirm(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
              <div className="text-4xl mb-3">✉️</div>
              <h2 className="text-base font-semibold text-stone-800 mb-2">
                Send invite emails?
              </h2>
              <p className="text-sm text-stone-500 mb-6">
                This will email{" "}
                <span className="font-medium text-stone-700">
                  {volunteers.filter((v) => v.invite_pending).length} volunteer
                  {volunteers.filter((v) => v.invite_pending).length !== 1
                    ? "s"
                    : ""}
                </span>{" "}
                with pending invites so they can set a password and log in.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSendInvitesConfirm(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={sendPendingInvites}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors"
                >
                  Send Invites
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Invites sent success modal */}
      {invitesSentCount !== null && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setInvitesSentCount(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
              <div className="text-4xl mb-3">
                {invitesSentCount > 0 ? "🚀" : "📭"}
              </div>
              <h2 className="text-base font-semibold text-stone-800 mb-2">
                {invitesSentCount > 0 ? "Invites sent!" : "Nothing to send"}
              </h2>
              <p className="text-sm text-stone-500 mb-6">
                {invitesSentCount > 0 ? (
                  <>
                    Successfully emailed{" "}
                    <span className="font-medium text-stone-700">
                      {invitesSentCount} volunteer
                      {invitesSentCount !== 1 ? "s" : ""}
                    </span>
                    . They'll receive a link to set their password and log in.
                  </>
                ) : (
                  "No pending invites were found. All volunteers may have already been invited."
                )}
              </p>
              <button
                onClick={() => setInvitesSentCount(null)}
                className="w-full py-2.5 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}

      {showCelebration && (
        <ContactCelebration onDone={() => setShowCelebration(false)} />
      )}

      {/* Floating FAQ button */}
      <button
        onClick={() => setShowFAQ(true)}
        className="fixed bottom-6 right-5 z-40 w-10 h-10 rounded-full bg-stone-700 hover:bg-stone-800 text-white shadow-lg flex items-center justify-center transition-colors"
        aria-label="Help & FAQ"
      >
        <span className="text-base font-semibold leading-none">?</span>
      </button>

      {showFAQ && <FAQDrawer onClose={() => setShowFAQ(false)} />}
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
