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
// (see bottom of file) that proactively calls getSession()
// the moment the tab regains focus, so the token is warm
// before the user's next interaction fires a request.
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
    // timer thread when a tab is backgrounded or the OS sleeps.
    autoRefreshToken: true,
    // detectSessionInUrl: true allows Supabase to read auth tokens from
    // the URL on page load — required for password reset links.
    detectSessionInUrl: true,
    // IMPORTANT: the `lock` option must be a LockFunc (an async function),
    // not a boolean. Passing `false` is silently ignored by the SDK and
    // leaves the default navigator.locks in place.
    //
    // The default navigator.locks implementation serialises all auth
    // operations (getSession, refreshSession, etc.) through a named lock.
    // After a tab is backgrounded, if a previous auth operation hung
    // while holding that lock (e.g. a refresh token fetch with no network),
    // every subsequent getSession() call — including the one inside
    // supabase.functions.invoke() — will wait forever for a lock that is
    // never released. This is the confirmed root cause of the "Adding..."
    // freeze bug (#30).
    //
    // The no-op LockFunc below runs the callback immediately without
    // acquiring any lock, eliminating lock starvation entirely.
    // This is safe for a single-tab app: the only downside is that
    // concurrent auth operations are not serialised, but in practice
    // they resolve to the same new token anyway.
    lock: async (_name, _acquireTimeout, fn) => fn(),
  },
});

// ============================================================
// GLOBAL SESSION RECOVERY NET
//
// When a tab is backgrounded, the browser may suspend the JS
// timer responsible for Supabase's autoRefreshToken. On return,
// the JWT may be stale. We call getSession() proactively on
// visibilitychange so the SDK's own refresh path can run before
// the user's next interaction fires a request.
//
// We do NOT call refreshSession() here — getSession() already
// triggers an internal token refresh when the token is expired,
// and calling refreshSession() on top of it would create a
// second concurrent network request for the same refresh token,
// risking a rotation conflict.
//
// Debounce: collapses the visibilitychange + focus double-fire
// that browsers emit when switching back to a tab.
// ============================================================

let _sessionRecoveryTimer = null;

async function _recoverSession() {
  // Intentionally empty.
  //
  // We previously called supabase.auth.getSession() here, but auth-js
  // has an internal `refreshingDeferred` that serialises concurrent token
  // refreshes independently of navigator.locks. If getSession() triggers
  // a _callRefreshToken() network fetch (expired or near-expiry token)
  // and the network isn't fully back yet after sleep/tab-restore, that
  // fetch hangs — and every subsequent getSession() call (including the
  // one inside supabase.functions.invoke()) waits on the same deferred
  // forever. Calling getSession() here 200ms after tab restore is the
  // exact moment the network is most likely to be unavailable.
  //
  // autoRefreshToken handles proactive token rotation on its own schedule.
  // Mutations that need a fresh token use getAccessToken() + raw fetch
  // (bypassing getSession() entirely) so this deferred can never block them.
}

function _scheduleSessionRecovery() {
  clearTimeout(_sessionRecoveryTimer);
  _sessionRecoveryTimer = setTimeout(_recoverSession, 200);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      _scheduleSessionRecovery();
    }
  });
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
