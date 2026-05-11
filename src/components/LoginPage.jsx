// ============================================================
// LoginPage.jsx
//
// Single page for both login and signup.
// - Default view: login form
// - Toggle: "Don't have an account? Sign up" reveals signup form
//
// On login:
//   - Fetches the user's profile to determine role
//   - Redirects admin → /admin, volunteer → /dashboard
//
// On signup:
//   - Passes full_name in raw_user_meta_data so the
//     handle_new_user() trigger can copy it into profiles
//   - New accounts are role = 'volunteer', is_active = false
//   - Shows a confirmation message after successful signup
// ============================================================

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  const navigate = useNavigate();

  // Toggle between 'login' and 'signup' views
  const [mode, setMode] = useState("login");

  // Form fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    // When Supabase redirects back after a password reset email click,
    // it appends #access_token and type=recovery to the URL.
    // We detect this and show the new password form.
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) {
      setIsResettingPassword(true);
    }
  }, []);

  // --------------------------------------------------------
  // Handle login form submission
  // --------------------------------------------------------
  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Fetch profile to determine where to redirect
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile) {
      setError("Could not load your profile. Please try again.");
      setLoading(false);
      return;
    }

    // Redirect based on role.
    // Inactive volunteers are handled by ProtectedRoute —
    // they'll see the pending approval screen.
    if (profile.role === "admin") {
      navigate("/admin");
    } else if (profile.role === "prayer_team") {
      navigate("/prayer");
    } else {
      navigate("/dashboard");
    }

    setLoading(false);
  }

  async function handlePasswordReset(e) {
    e.preventDefault();
    if (!email) {
      setError(
        "Please enter your email address first, then click Forgot Password.",
      );
      return;
    }
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (error) {
      setError(error.message);
    } else {
      setResetSent(true);
    }
    setLoading(false);
  }

  async function handleSetNewPassword(e) {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setError(error.message);
    } else {
      // Password updated — sign them out and back to login
      await supabase.auth.signOut();
      setIsResettingPassword(false);
      setNewPassword("");
      setError("");
      // Show a success message by reusing resetSent state
      setPasswordUpdated(true);
    }
    setLoading(false);
  }

  // --------------------------------------------------------
  // Handle signup form submission
  // --------------------------------------------------------
  async function handleSignup(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!fullName.trim()) {
      setError("Please enter your full name.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please try again.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // This data is passed to the handle_new_user() trigger
        // which copies full_name into the profiles table.
        data: {
          full_name: fullName.trim(),
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Show success message — account needs admin approval before login
    setSignupSuccess(true);
    setLoading(false);
  }

  if (isResettingPassword) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-800">
              Set New Password
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Enter your new password below
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSetNewPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="At least 6 characters"
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                {loading ? "Saving..." : "Set New Password"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------
  // Signup success screen
  // --------------------------------------------------------
  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            Check your email
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-3">
            We sent a confirmation link to{" "}
            <span className="font-medium text-gray-700">{email}</span>. Please
            click it to verify your email address.
          </p>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            After confirming your email, a church administrator will need to
            approve your account before you can log in.
          </p>
          <button
            onClick={() => {
              setSignupSuccess(false);
              setMode("login");
              setEmail("");
              setPassword("");
              setConfirmPassword("");
              setFullName("");
            }}
            className="text-sm text-blue-600 hover:text-blue-700 underline"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------
  // Main login / signup form
  // --------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Church Care</h1>
          <p className="text-gray-500 text-sm mt-1">
            {mode === "login"
              ? "Sign in to your account"
              : "Create a new account"}
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <form
            onSubmit={mode === "login" ? handleLogin : handleSignup}
            className="space-y-4"
          >
            {/* Full name — signup only */}
            {mode === "signup" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="Jane Smith"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="jane@example.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder={
                  mode === "signup" ? "At least 6 characters" : "••••••••"
                }
                minLength={6}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Confirm password — signup only */}
            {mode === "signup" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Re-enter your password"
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            {mode === "login" && resetSent && (
              <div className="p-3 bg-green-50 border border-green-100 rounded-lg">
                <p className="text-green-700 text-sm">
                  Password reset email sent! Check your inbox and follow the
                  link to reset your password.
                </p>
              </div>
            )}

            {mode === "login" && passwordUpdated && (
              <div className="p-3 bg-green-50 border border-green-100 rounded-lg">
                <p className="text-green-700 text-sm">
                  Password updated! You can now sign in with your new password.
                </p>
              </div>
            )}

            {mode === "login" && !resetSent && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
                >
                  Forgot your password?
                </button>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              {loading
                ? mode === "login"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          {/* Toggle between login and signup */}
          <div className="mt-6 text-center">
            {mode === "login" ? (
              <p className="text-sm text-gray-500">
                Don't have an account?{" "}
                <button
                  onClick={() => {
                    setMode("signup");
                    setError("");
                    setConfirmPassword("");
                  }}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Sign up
                </button>
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                Already have an account?{" "}
                <button
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
