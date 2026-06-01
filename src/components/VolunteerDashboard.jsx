// ============================================================
// VolunteerDashboard.jsx
//
// Main view for volunteers. Shows their 2-week cycle assignments
// as contact cards. Volunteers can log contacts and edit notes.
//
// Data fetching:
//   - Fetches assignments within a 14-day window where
//     caller_id = auth.uid()
//   - Derives the actual cycle start from the returned data
//   - Fetches existing contact_logs for pre-filling edit modal
//
// Cycle calculation:
//   The SQL function generates assignments every 2 weeks.
//   The frontend queries week_starting in a 14-day window to
//   find whichever cycle is currently active.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { sortAssignments, getDaysLeftInCycle } from "../lib/utils";
import MemberCard from "./MemberCard";
import ContactModal from "./ContactModal";
import ContactCelebration from "./ContactCelebration";

function HeartIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

const CONTACT_METHOD_LABELS = {
  call: "Phone Call",
  text: "Text Message",
  email: "Email",
  voicemail: "Voicemail",
  in_person: "In Person",
  snail_mail: "Snail Mail",
};

function getMethodLabel(method) {
  return CONTACT_METHOD_LABELS[method] ?? method ?? "Unknown";
}

export default function VolunteerDashboard() {
  const [profile, setProfile] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [contactLogs, setContactLogs] = useState({}); // keyed by assignment_id
  const [adHocLogs, setAdHocLogs] = useState([]);
  const [cycleStart, setCycleStart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [editingLog, setEditingLog] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      // Explicitly refresh the session before loading data.
      // This handles the case where the tab has been open for a long time
      // and the JWT has expired without the auto-refresh catching it.
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        window.location.replace("/login");
        return;
      }
      const user = session.user;
      setCurrentUserId(user.id);

      // Load volunteer's profile for the greeting
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      setProfile(profileData);

      // Build a 14-day window ending today to find the active cycle.
      // Using today (not a day-of-week anchor) so the query works regardless
      // of what day the cycle started on.
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const cycleWindowStart = (() => {
        const d = new Date(today);
        d.setDate(d.getDate() - 13);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })();

      // Load this cycle's assignments with member details.
      // Uses a 14-day window so it finds the cycle even mid-cycle.
      const { data: assignmentData, error: assignmentError } = await supabase
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
            membership_type
          )
        `,
        )
        .eq("caller_id", user.id)
        .lte("week_starting", todayStr)
        .gte("week_starting", cycleWindowStart)
        .order("week_starting", { ascending: false })
        .order("status", { ascending: true });

      if (assignmentError) throw assignmentError;

      // Derive the cycle start from the most recent week_starting so we
      // only show one cycle even if two fall within the 14-day window.
      const activeCycleStart = assignmentData?.[0]?.week_starting ?? todayStr;
      setCycleStart(activeCycleStart);

      const cycleAssignments = (assignmentData ?? []).filter(
        (a) => a.week_starting === activeCycleStart,
      );
      setAssignments(sortAssignments(cycleAssignments));

      // Load contact logs for this cycle's assignments so Edit Notes
      // can pre-fill the modal with existing notes
      if (cycleAssignments.length > 0) {
        const assignmentIds = cycleAssignments.map((a) => a.id);

        const { data: logData } = await supabase
          .from("contact_logs")
          .select("id, assignment_id, notes, needs_follow_up, contacted_at")
          .in("assignment_id", assignmentIds);

        // Index logs by assignment_id for quick lookup
        const logMap = {};
        logData?.forEach((log) => {
          logMap[log.assignment_id] = log;
        });
        setContactLogs(logMap);
      }

      // Ad-hoc contacts span the full 14-day cycle window
      const nextCycleStarting = (() => {
        const d = new Date(activeCycleStart + "T00:00:00");
        d.setDate(d.getDate() + 14);
        return d.toISOString();
      })();

      const { data: adHocData, error: adHocError } = await supabase
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

      if (adHocError) throw adHocError;
      setAdHocLogs(adHocData ?? []);
    } catch (err) {
      setError(
        "Failed to load your assignments. Please refresh the page." +
          (import.meta.env.VITE_SUPPORT_PHONE
            ? ` If it keeps happening, text Lee a screenshot at ${import.meta.env.VITE_SUPPORT_PHONE}.`
            : ""),
      );
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Open modal for a new contact log
  function handleComplete(assignment) {
    setSelectedAssignment(assignment);
    setEditingLog(null);
    setModalOpen(true);
  }

  // Open modal pre-filled with existing notes
  function handleEdit(assignment) {
    setSelectedAssignment(assignment);
    setEditingLog(contactLogs[assignment.id] ?? null);
    setModalOpen(true);
  }

  function handleModalClose() {
    setModalOpen(false);
    setSelectedAssignment(null);
    setEditingLog(null);
  }

  function handleSaved({ isEditing, assignmentId, completedAt, log }) {
    if (!isEditing) {
      setAssignments((prev) =>
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
    setContactLogs((prev) => ({
      ...prev,
      [assignmentId]: { ...(prev[assignmentId] ?? {}), ...log },
    }));
  }

  function handleSignOut() {
    supabase.auth.signOut();
    window.location.replace("/login");
  }

  const pendingCount = assignments.filter((a) => a.status === "pending").length;
  const completedCount = assignments.filter(
    (a) => a.status === "completed",
  ).length;
  const daysLeft = cycleStart ? getDaysLeftInCycle(cycleStart) : null;

  // --------------------------------------------------------
  // Render states
  // --------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-stone-500 text-sm">Loading your contacts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-amber-100 sticky top-0 z-10 shadow-sm shadow-amber-50/80">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shrink-0">
              <HeartIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-stone-800">
                Church Care
              </h1>
              {profile?.full_name && (
                <p className="text-xs text-stone-400 leading-none mt-0.5">
                  Hi, {profile.full_name.split(" ")[0]} 👋
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-stone-400 hover:text-amber-600 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Error banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Cycle heading + progress */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-stone-800">
            This Cycle's Contacts
          </h2>
          <p className="text-sm text-stone-500 mt-1">
            Cycle starting{" "}
            {cycleStart
              ? new Date(cycleStart + "T00:00:00").toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : "—"}
          </p>

          {/* Progress bar — only shown if there are assignments */}
          {assignments.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                <span>
                  {completedCount} of {assignments.length} contacted
                  {pendingCount > 0 && ` · ${pendingCount} remaining`}
                </span>
                <div className="flex items-center gap-2">
                  {completedCount === assignments.length ? (
                    <span className="text-green-600 font-medium">
                      All done! 🎉
                    </span>
                  ) : daysLeft !== null ? (
                    <span
                      className={`font-medium px-2 py-0.5 rounded-full ${
                        daysLeft <= 1
                          ? "bg-red-100 text-red-700"
                          : daysLeft <= 3
                            ? "bg-amber-100 text-amber-700"
                            : "bg-stone-100 text-stone-500"
                      }`}
                    >
                      {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-amber-400 to-green-500 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${assignments.length > 0 ? (completedCount / assignments.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Empty state */}
        {assignments.length === 0 && (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-stone-400"
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
        )}

        {/* Assignment cards */}
        {assignments.length > 0 && (
          <div className="flex flex-col gap-4">
            {assignments.map((assignment) => (
              <MemberCard
                key={`${assignment.id}-${assignment.status}`}
                assignment={assignment}
                onComplete={handleComplete}
                onEdit={handleEdit}
              />
            ))}
          </div>
        )}

        {/* Ad-hoc contacts logged by coordinator */}
        {adHocLogs.length > 0 && (
          <div className="mt-8">
            <div className="mb-3">
              <h2 className="text-base font-semibold text-stone-700">
                Contacts added by your coordinator
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                These were logged on your behalf and are already recorded.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {adHocLogs.map((log) => {
                const member = log.members;
                const contactedDate = new Date(
                  log.contacted_at,
                ).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                });
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
                      {getMethodLabel(log.contact_method)} &middot;{" "}
                      {contactedDate}
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
      </main>

      {/* Contact modal */}
      {modalOpen && selectedAssignment && (
        <ContactModal
          assignment={selectedAssignment}
          existingLog={editingLog}
          onClose={handleModalClose}
          onSaved={handleSaved}
          userId={currentUserId}
        />
      )}

      {showCelebration && (
        <ContactCelebration onDone={() => setShowCelebration(false)} />
      )}
    </div>
  );
}
