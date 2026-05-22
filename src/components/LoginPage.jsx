import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const inputClass =
  "w-full px-4 py-2.5 border border-stone-200 rounded-xl text-sm bg-amber-50/40 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent placeholder:text-stone-400 transition-shadow";

const labelClass = "block text-sm font-medium text-stone-700 mb-1";

function WarmBackground({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-100 via-orange-50 to-yellow-100 flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-amber-300/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-orange-300/25 rounded-full blur-3xl pointer-events-none" />
      <div className="max-w-md w-full relative">{children}</div>
    </div>
  );
}

function HeartIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) {
      setIsResettingPassword(true);
    }
  }, []);

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

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setError(error.message);
    } else {
      await supabase.auth.signOut();
      setIsResettingPassword(false);
      setNewPassword("");
      setError("");
      setPasswordUpdated(true);
    }
    setLoading(false);
  }

  if (isResettingPassword) {
    return (
      <WarmBackground>
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-amber-200">
            <HeartIcon className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-stone-800 tracking-tight">
            Church Care
          </h1>
          <p className="text-stone-500 text-sm mt-2">Create a new password</p>
        </div>
        <div className="bg-white rounded-3xl shadow-xl shadow-amber-100/60 border border-amber-100/50 p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          <form onSubmit={handleSetNewPassword} className="space-y-4">
            <div>
              <label className={labelClass}>New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="At least 6 characters"
                minLength={6}
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-md shadow-amber-200 mt-2"
            >
              {loading ? "Saving..." : "Set New Password"}
            </button>
          </form>
        </div>
        <Tagline />
      </WarmBackground>
    );
  }

  return (
    <WarmBackground>
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-amber-200">
          <HeartIcon className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-stone-800 tracking-tight">
          Church Care
        </h1>
        <p className="text-stone-500 text-sm mt-2">
          Welcome back — glad you&apos;re here
        </p>
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-amber-100/60 border border-amber-100/50 p-8">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className={labelClass}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="jane@example.com"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className={inputClass}
            />
          </div>

          {resetSent && (
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
              <p className="text-amber-800 text-sm">
                Password reset email sent! Check your inbox and follow the link
                to reset your password.
              </p>
            </div>
          )}

          {passwordUpdated && (
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
              <p className="text-amber-800 text-sm">
                Password updated! You can now sign in with your new password.
              </p>
            </div>
          )}

          {!resetSent && (
            <div className="text-right">
              <button
                type="button"
                onClick={handlePasswordReset}
                className="text-xs text-stone-400 hover:text-amber-600 transition-colors"
              >
                Forgot your password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-md shadow-amber-200 mt-2"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>

      <Tagline />
    </WarmBackground>
  );
}

function Tagline() {
  return (
    <p className="text-center text-stone-400 text-xs mt-6">
      Serving with love, one connection at a time
    </p>
  );
}
