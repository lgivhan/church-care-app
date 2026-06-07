// ============================================================
// PrayerDashboard.jsx
//
// View for prayer team members. Shows all open prayer requests
// with member name, volunteer notes, and date contacted.
// Prayer team can mark requests as prayed for.
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

function HeartIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
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

export default function PrayerDashboard() {
  const [prayerRequests, setPrayerRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [resolvingIds, setResolvingIds] = useState(new Set());
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserName, setCurrentUserName] = useState(null);

  const loadPrayerRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase
        .from("contact_logs")
        .select(
          `
          id,
          notes,
          contacted_at,
          prayer_request_resolved,
          prayer_resolved_at,
          members (first_name, last_name),
          profiles!contact_logs_volunteer_id_fkey (full_name),
          prayer_resolved_by_profile:profiles!contact_logs_prayer_resolved_by_fkey (full_name)
        `,
        )
        .eq("prayer_request", true)
        .order("contacted_at", { ascending: false });

      if (error) throw error;
      setPrayerRequests(data ?? []);
    } catch (err) {
      setError("Failed to load prayer requests. Please refresh.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrayerRequests();

    supabase.auth.getUser().then(async ({ data }) => {
      const user = data?.user;
      if (!user) return;
      setCurrentUserId(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      setCurrentUserName(profile?.full_name ?? null);
    });
  }, [loadPrayerRequests]);

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
    if (resolvingIds.has(id)) return;
    setResolvingIds((prev) => new Set(prev).add(id));

    const resolvedAt = new Date().toISOString();

    // Optimistic update
    setPrayerRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              prayer_request_resolved: true,
              prayer_resolved_at: resolvedAt,
              prayer_resolved_by_profile: { full_name: currentUserName },
            }
          : r,
      ),
    );

    try {
      const { error } = await supabase
        .from("contact_logs")
        .update({
          prayer_request_resolved: true,
          prayer_resolved_at: resolvedAt,
          prayer_resolved_by: currentUserId,
        })
        .eq("id", id);

      if (error) throw error;
    } catch {
      // Revert optimistic update on failure
      setPrayerRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                prayer_request_resolved: false,
                prayer_resolved_at: null,
                prayer_resolved_by_profile: null,
              }
            : r,
        ),
      );
      setError("Failed to update prayer request. Please try again.");
    } finally {
      setResolvingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function handleSignOut() {
    supabase.auth.signOut();
    window.location.replace("/login");
  }

  const openRequests = prayerRequests.filter((r) => !r.prayer_request_resolved);
  const resolvedRequests = prayerRequests.filter(
    (r) => r.prayer_request_resolved,
  );
  const displayed = showResolved ? prayerRequests : openRequests;

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-stone-500 text-sm">Loading prayer requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-amber-100 sticky top-0 z-10 shadow-sm shadow-amber-50/80">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shrink-0">
              <HeartIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-stone-800">
                Prayer Ministry
              </h1>
              <p className="text-xs text-stone-400 leading-none mt-0.5">
                {openRequests.length} open request
                {openRequests.length !== 1 ? "s" : ""}
              </p>
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

      <main className="max-w-3xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-stone-800">
            Prayer Requests
          </h2>
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="text-xs text-stone-500 hover:text-stone-700 underline"
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
            {displayed.map((log) => {
              const isResolving = resolvingIds.has(log.id);
              return (
                <div
                  key={log.id}
                  className={`bg-white rounded-2xl border p-5 shadow-sm ${
                    log.prayer_request_resolved
                      ? "border-green-200 opacity-60"
                      : "border-stone-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-semibold text-stone-800">
                        {log.members?.first_name} {log.members?.last_name}
                      </h3>
                      <p className="text-xs text-stone-400 mt-0.5">
                        Contacted by {log.profiles?.full_name} ·{" "}
                        {formatDateTime(log.contacted_at)}
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
                            {log.prayer_resolved_by_profile?.full_name && (
                              <span>
                                marked by{" "}
                                {log.prayer_resolved_by_profile.full_name}
                              </span>
                            )}
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
                        onClick={() => handleResolve(log.id)}
                        disabled={isResolving}
                        className="shrink-0 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 px-2.5 py-1 rounded-full transition-colors"
                      >
                        {isResolving ? "Saving..." : "Mark as prayed for"}
                      </button>
                    )}
                  </div>

                  {log.notes && (
                    <p className="text-sm text-stone-600 leading-relaxed bg-stone-50 rounded-lg p-3">
                      {log.notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
