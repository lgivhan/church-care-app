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
    autoRefreshToken: true,
    // detectSessionInUrl: true allows Supabase to read auth tokens from
    // the URL on page load — required for password reset links and helps
    // restore sessions reliably on mobile browsers after backgrounding.
    detectSessionInUrl: true,
  },
});
