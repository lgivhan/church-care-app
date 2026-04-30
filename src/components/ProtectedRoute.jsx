// ============================================================
// ProtectedRoute.jsx
//
// Wraps protected pages. On every load it:
//   1. Checks for an active Supabase session
//   2. Fetches the user's profile (role + is_active)
//   3. Redirects to /login if no session exists
//   4. Shows a pending approval screen if is_active = false
//   5. Redirects to correct dashboard if role doesn't match route
//
// This means an inactive volunteer who somehow reaches /dashboard
// sees a friendly message instead of a blank or broken screen.
// ============================================================

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function ProtectedRoute({ children, requiredRole }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadSessionAndProfile() {
      try {
        // First check for an existing session
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        setSession(session);

        if (session) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role, is_active, full_name")
            .eq("id", session.user.id)
            .single();

          if (!mounted) return;
          setProfile(profile);
        }
      } catch (err) {
        console.error("Session load error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadSessionAndProfile();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      // On mobile, INITIAL_SESSION fires when session is restored
      // from storage — this is the reliable signal to use
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "TOKEN_REFRESHED"
      ) {
        setSession(session);

        if (session) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role, is_active, full_name")
            .eq("id", session.user.id)
            .single();

          if (!mounted) return;
          setProfile(profile);
        } else {
          setProfile(null);
        }

        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Show a neutral loading screen while we check the session.
  // Keeping this simple avoids a flash of the wrong content.
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  // No session — redirect to login
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Session exists but profile hasn't loaded yet (edge case)
  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading your profile...</p>
      </div>
    );
  }

  // Volunteer is logged in but not yet approved by an admin.
  // Show a friendly waiting screen instead of a blank dashboard.
  if (!profile.is_active) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-yellow-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            Your account is pending approval
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            A church administrator needs to approve your account before you can
            access your contacts. You'll be ready to go once they've confirmed
            your signup.
          </p>
          <p className="text-gray-400 text-xs mb-6">
            If you have questions, please contact your church administrator.
          </p>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.replace("/login");
            }}
            className="text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Role mismatch — redirect to the correct dashboard
  if (profile.role !== requiredRole) {
    return (
      <Navigate
        to={profile.role === "admin" ? "/admin" : "/dashboard"}
        replace
      />
    );
  }

  // All checks passed — render the protected page
  return children;
}
