// ============================================================
// supabaseClient.js
//
// Initializes and exports a single Supabase client instance.
// Import this wherever you need to query the database or
// manage auth — never create a second client instance.
//
// Environment variables are prefixed with VITE_ so that
// Vite includes them in the frontend bundle. Only the URL
// and anon key are exposed here — the service role key
// lives exclusively in Edge Function secrets.
//
// This module also installs a GLOBAL SESSION RECOVERY NET
// (see bottom of file) that eagerly refreshes the JWT the
// moment the tab or window regains focus. This prevents the
// entire class of "UI freezes after backgrounding" bugs where
// a stale or expired token silently blocks PostgREST mutations.
// ============================================================

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // persistSession: true ensures the user stays logged in across
    // browser closes and page refreshes (stored in localStorage).
    persistSession: true,
    // autoRefreshToken: true silently refreshes the JWT before it expires.
    // This works under normal conditions, but the browser may suspend the
    // timer thread when a tab is backgrounded or the OS sleeps — which is
    // exactly why the visibility/focus recovery net below exists.
    autoRefreshToken: true,
    // detectSessionInUrl: true allows Supabase to read auth tokens from
    // the URL on page load — required for password reset links and helps
    // restore sessions reliably on mobile browsers after backgrounding.
    detectSessionInUrl: true,
    // Disables the navigator.locks mechanism
    // that causes orphaned locks after tab switching
    lock: false,
  },
});

// ============================================================
// GLOBAL SESSION RECOVERY NET
//
// Problem: when a tab is backgrounded (OS sleep, screen lock,
// prolonged tab switch), the browser may throttle or fully
// suspend the JS timer responsible for Supabase's autoRefresh.
// When the user returns, any pending mutation fires immediately
// against a stale or expired JWT — causing a silent 401 and a
// UI that appears frozen (loading state stuck at true).
//
// Solution: intercept the two browser lifecycle events that
// signal "the user is back":
//   • visibilitychange → tab came to the foreground
//   • window focus     → app window returned from another OS window
//
// On either event, we call getSession() and, if the session is
// absent or expired, eagerly call refreshSession() to rotate
// the access token *before* any queued interaction can fire a
// stale request. This complements — it does not replace —
// Supabase's built-in autoRefreshToken.
//
// Debounce: rapid focus+visibility double-fires (common when
// alt-tabbing back) are collapsed into a single network call.
// ============================================================

let _sessionRecoveryTimer = null;

async function _recoverSession() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    // If getSession errored, or if the stored session has expired /
    // been invalidated, force a token rotation now so the new access
    // token is in localStorage before any component mutation fires.
    if (error || !session) {
      await supabase.auth.refreshSession();
    }
  } catch {
    // Intentionally silent. If refreshSession() also fails (e.g. the
    // refresh token itself has expired), Supabase will emit SIGNED_OUT
    // via onAuthStateChange, and ProtectedRoute will redirect to /login.
    // We do not need to handle it here.
  }
}

function _scheduleSessionRecovery() {
  // 200 ms debounce: collapses the visibilitychange + focus double-fire
  // that browsers commonly emit when the user switches back to the tab.
  clearTimeout(_sessionRecoveryTimer);
  _sessionRecoveryTimer = setTimeout(_recoverSession, 200);
}

// Guard against SSR / non-browser environments.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    // Only act when the tab is becoming visible; ignore the "hidden" event.
    if (document.visibilityState === "visible") {
      _scheduleSessionRecovery();
    }
  });

  // window "focus" fires when the OS-level window regains focus
  // (e.g. user returns from another application). This is distinct
  // from visibilitychange and must be handled separately.
  window.addEventListener("focus", _scheduleSessionRecovery);
}

// ============================================================
// HELPERS
// ============================================================

// Returns the current access token synchronously from localStorage
// without making any network calls or acquiring any locks.
export function getAccessToken() {
  try {
    const raw = localStorage.getItem(
      `sb-${import.meta.env.VITE_SUPABASE_URL.split("//")[1].split(".")[0]}-auth-token`,
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.access_token ?? null;
  } catch {
    return null;
  }
}
