// ============================================================
// VolunteerDashboard.jsx
//
// Main view for volunteers. Shows their weekly assignments
// as contact cards. Volunteers can log contacts and edit notes.
//
// Data fetching:
//   - Fetches assignments for the current week where
//     caller_id = auth.uid()
//   - Joins member data via Supabase foreign key relationship
//   - Fetches existing contact_logs for pre-filling edit modal
//
// Week calculation matches the SQL function:
//   Most recent Sunday = today minus today's day-of-week index
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getThisSunday } from "../lib/utils";
import MemberCard from "./MemberCard";
import ContactModal from "./ContactModal";

export default function VolunteerDashboard() {
  const [profile, setProfile] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [contactLogs, setContactLogs] = useState({}); // keyed by assignment_id
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [editingLog, setEditingLog] = useState(null);

  const weekStarting = getThisSunday();

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      // Explicitly refresh the session before loading data.
      // This handles the case where the tab has been open for a long time
      // and the JWT has expired without the auto-refresh catching it.
      const {
        data: { session },
      } = await supabase.auth.refreshSession();
      if (!session) {
        window.location.replace("/login");
        return;
      }
      const user = session.user;

      // Load volunteer's profile for the greeting
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      setProfile(profileData);

      // Load this week's assignments with member details
      // Supabase resolves the foreign key to members automatically
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
            birthday,
            membership_type
          )
        `,
        )
        .eq("caller_id", user.id)
        .eq("week_starting", weekStarting)
        .order("status", { ascending: true }); // pending first, completed last

      if (assignmentError) throw assignmentError;

      setAssignments(assignmentData ?? []);

      // Load contact logs for this week's assignments so Edit Notes
      // can pre-fill the modal with existing notes
      if (assignmentData && assignmentData.length > 0) {
        const assignmentIds = assignmentData.map((a) => a.id);

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
    } catch (err) {
      setError("Failed to load your assignments. Please refresh the page.");
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

  // Refresh dashboard data after a contact is logged or edited
  function handleSaved() {
    loadDashboard();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.replace("/login");
  }

  const pendingCount = assignments.filter((a) => a.status === "pending").length;
  const completedCount = assignments.filter(
    (a) => a.status === "completed",
  ).length;

  // --------------------------------------------------------
  // Render states
  // --------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading your contacts...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-800">Church Care</h1>
            {profile?.full_name && (
              <p className="text-xs text-gray-500">
                Hi, {profile.full_name.split(" ")[0]} 👋
              </p>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
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

        {/* Week heading + progress */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-800">
            This Week's Contacts
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Week of{" "}
            {new Date(weekStarting + "T00:00:00").toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>

          {/* Progress bar — only shown if there are assignments */}
          {assignments.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>
                  {completedCount} of {assignments.length} contacted
                  {pendingCount > 0 && ` · ${pendingCount} remaining`}
                </span>
                {completedCount === assignments.length && (
                  <span className="text-green-600 font-medium">
                    All done! 🎉
                  </span>
                )}
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-500"
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
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-gray-400"
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
            <h3 className="text-gray-600 font-medium mb-1">
              No contacts assigned yet this week
            </h3>
            <p className="text-gray-400 text-sm">
              Check back after Sunday when new assignments are generated.
            </p>
          </div>
        )}

        {/* Assignment cards */}
        {assignments.length > 0 && (
          <div className="flex flex-col gap-4">
            {assignments.map((assignment) => (
              <MemberCard
                key={assignment.id}
                assignment={assignment}
                onComplete={handleComplete}
                onEdit={handleEdit}
              />
            ))}
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
        />
      )}
    </div>
  );
}
