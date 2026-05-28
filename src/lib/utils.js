// ============================================================
// Returns the most recent Friday as a YYYY-MM-DD string.
// Cycles are anchored to Friday — distribution day and cycle
// start are the same day.
// ============================================================

export function getThisFriday() {
  const today = new Date();
  const friday = new Date(today);
  friday.setDate(today.getDate() - ((today.getDay() - 5 + 7) % 7));

  const year = friday.getFullYear();
  const month = String(friday.getMonth() + 1).padStart(2, "0");
  const day = String(friday.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ============================================================
// Maps verbose PCO membership types to simplified display labels.
// Used in MemberCard (volunteer view) and AdminDashboard (admin view).
// Centralizing here prevents the mapping from getting out of sync.
// ============================================================
export function getDaysLeftInCycle(cycleStartStr) {
  const start = new Date(cycleStartStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysPast = Math.round((today - start) / (1000 * 60 * 60 * 24));
  return Math.max(0, 14 - daysPast);
}

export function sortAssignments(list) {
  return [...list].sort(
    (a, b) =>
      (a.status === "completed" ? 1 : 0) - (b.status === "completed" ? 1 : 0),
  );
}

export function getMembershipLabel(membershipType) {
  if (!membershipType) return null;

  const t = membershipType.toLowerCase();

  if (t.includes("child") || t.includes("teen")) {
    return { label: "Child/Teen", color: "bg-gray-100 text-gray-500" };
  }
  if (t.includes("regular attends") || t.includes("regular attendee")) {
    return { label: "Active Member", color: "bg-green-100 text-green-700" };
  }
  if (
    t.includes("attends occasionally") ||
    t.includes("non-member attends") ||
    t.includes("non member attends")
  ) {
    return { label: "Occasional Attender", color: "bg-blue-100 text-blue-700" };
  }
  if (t.includes("visited") || t.includes("has visited")) {
    return { label: "Visitor", color: "bg-purple-100 text-purple-700" };
  }
  if (t.includes("moved away") || t.includes("moved and changed")) {
    return { label: "Moved Away", color: "bg-orange-100 text-orange-700" };
  }
  if (t.includes("doesn't attend") || t.includes("does not attend")) {
    return { label: "Inactive Member", color: "bg-red-100 text-red-700" };
  }
  if (t.includes("online")) {
    return { label: "Online Member", color: "bg-cyan-100 text-cyan-700" };
  }
  if (t.includes("in progress")) {
    return { label: "In Progress", color: "bg-yellow-100 text-yellow-700" };
  }
  if (t.includes("guest speaker")) {
    return { label: "Guest Speaker", color: "bg-gray-100 text-gray-600" };
  }
  if (t.includes("used to attend")) {
    return { label: "Former Attender", color: "bg-orange-100 text-orange-700" };
  }
  if (t.includes("interest")) {
    return { label: "Interest", color: "bg-green-100 text-green-700" };
  }

  // Fallback — show a shortened version of whatever PCO has
  return { label: membershipType, color: "bg-gray-100 text-gray-600" };
}
