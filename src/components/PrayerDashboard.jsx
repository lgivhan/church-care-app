// ============================================================
// PrayerDashboard.jsx
//
// View for prayer team members. Shows all open prayer requests
// with member name, volunteer notes, and date contacted.
// Prayer team can mark requests as prayed for.
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

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

export default function PrayerDashboard() {
  const [prayerRequests, setPrayerRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  const loadPrayerRequests = useCallback(async () => {
    setLoading(true);
    setError(""); // Clear previous errors

    const { data, error } = await supabase
      .from("contact_logs")
      .select(
        `
        id,
        notes,
        contacted_at,
        prayer_request_resolved,
        members (first_name, last_name),
        profiles!contact_logs_volunteer_id_fkey (full_name)
      `,
      )
      .eq("prayer_request", true)
      .order("contacted_at", { ascending: false });

    if (error) {
      setError("Failed to load prayer requests. Please refresh.");
      console.error(error);
    } else {
      setPrayerRequests(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPrayerRequests();
  }, [loadPrayerRequests]);

  // Refresh data when returning to the app
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        loadPrayerRequests();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [loadPrayerRequests]);

  async function handleResolve(id) {
    const { error } = await supabase
      .from("contact_logs")
      .update({ prayer_request_resolved: true })
      .eq("id", id);

    if (!error) {
      loadPrayerRequests();
    } else {
      alert("Failed to update prayer request.");
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.replace("/login");
  }

  const openRequests = prayerRequests.filter((r) => !r.prayer_request_resolved);
  const resolvedRequests = prayerRequests.filter(
    (r) => r.prayer_request_resolved,
  );
  const displayed = showResolved ? prayerRequests : openRequests;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading prayer requests...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-800">Prayer Ministry</h1>
            <p className="text-xs text-gray-500">
              {openRequests.length} open request
              {openRequests.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">
            Prayer Requests
          </h2>
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            {showResolved
              ? "Hide resolved"
              : `Show resolved (${resolvedRequests.length})`}
          </button>
        </div>

        {displayed.length === 0 ? (
          <div className="p-8 bg-green-50 border border-green-100 rounded-2xl text-center">
            <p className="text-green-700 font-medium mb-1">
              ✅ No open prayer requests
            </p>
            <p className="text-green-600 text-sm">
              Check back after volunteers have logged their weekly contacts.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {displayed.map((log) => (
              <div
                key={log.id}
                className={`bg-white rounded-2xl border p-5 shadow-sm ${
                  log.prayer_request_resolved
                    ? "border-green-200 opacity-60"
                    : "border-gray-100"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-800">
                      {log.members?.first_name} {log.members?.last_name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Contacted by {log.profiles?.full_name} ·{" "}
                      {formatDateTime(log.contacted_at)}
                    </p>
                  </div>
                  {log.prayer_request_resolved ? (
                    <span className="shrink-0 text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                      ✓ Prayed for
                    </span>
                  ) : (
                    <button
                      onClick={() => handleResolve(log.id)}
                      className="shrink-0 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-full transition-colors"
                    >
                      Mark as prayed for
                    </button>
                  )}
                </div>

                {log.notes && (
                  <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-lg p-3">
                    {log.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
