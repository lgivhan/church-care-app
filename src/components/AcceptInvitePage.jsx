import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function HeartIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

const REQUIREMENTS = [
  { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { label: "At least one uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { label: "At least one number", test: (pw) => /[0-9]/.test(pw) },
];

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const [setupError, setSetupError] = useState("");

  useEffect(() => {
    // Check for error params Supabase appends on failed invite exchange
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, ""),
    );
    const errorDesc =
      params.get("error_description") ??
      hashParams.get("error_description") ??
      params.get("error") ??
      hashParams.get("error");
    if (errorDesc) {
      setSetupError(decodeURIComponent(errorDesc.replace(/\+/g, " ")));
      return;
    }

    // If Supabase is using PKCE flow, the URL will have ?code= instead of
    // #access_token=. Exchange it manually — PKCE invite links have no
    // client-side verifier, so we call exchangeCodeForSession directly.
    const code = params.get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (error) {
          setSetupError(error.message);
        } else if (data?.session) {
          setName(data.session.user.user_metadata?.full_name ?? "");
          setSessionReady(true);
        }
      });
      return;
    }

    // Implicit flow: Supabase processes the #access_token hash automatically
    // and fires onAuthStateChange.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        session &&
        (event === "SIGNED_IN" ||
          event === "USER_UPDATED" ||
          event === "PASSWORD_RECOVERY")
      ) {
        setName(session.user.user_metadata?.full_name ?? "");
        setSessionReady(true);
      }
    });

    // Also check if session is already established (e.g. page refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setName(session.user.user_metadata?.full_name ?? "");
        setSessionReady(true);
      }
    });

    // Timeout: if nothing fires after 8 seconds, show a helpful error
    const timeout = setTimeout(() => {
      setSetupError(
        "The setup link may have expired or already been used. Please ask your coordinator to resend the invite.",
      );
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const firstName = name.split(" ")[0] || "there";
  const requirementsMet = REQUIREMENTS.every((r) => r.test(password));

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!requirementsMet) {
      const missing = REQUIREMENTS.filter((r) => !r.test(password)).map(
        (r) => r.label,
      );
      setError(`Password is missing: ${missing.join(", ").toLowerCase()}.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match. Please try again.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      setDone(true);
    } catch (err) {
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-100 via-orange-50 to-yellow-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-amber-100/60 border border-amber-100/50 p-10 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
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
          <h2 className="text-xl font-bold text-stone-800 mb-2">
            You're all set!
          </h2>
          <p className="text-stone-500 text-sm leading-relaxed mb-8">
            Your password has been created. You can now sign in to Church Care.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-md shadow-amber-200"
          >
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-100 via-orange-50 to-yellow-100 flex items-center justify-center px-4">
        {setupError ? (
          <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z"
                />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-stone-800 mb-2">
              Link didn't work
            </h2>
            <p className="text-sm text-stone-500 leading-relaxed">
              {setupError}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-stone-500 text-sm">Setting up your account…</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-100 via-orange-50 to-yellow-100 flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-amber-300/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-orange-300/25 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-amber-200">
            <HeartIcon className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-stone-800 tracking-tight">
            Welcome, {firstName}!
          </h1>
          <p className="text-stone-500 text-sm mt-2">
            Create a password to activate your Church Care account.
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-amber-100/60 border border-amber-100/50 p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Create a strong password"
                className="w-full px-4 py-2.5 border border-stone-200 rounded-xl text-sm bg-amber-50/40 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent placeholder:text-stone-400 transition-shadow"
              />

              {/* Password requirements checklist */}
              <ul className="mt-2 space-y-1">
                {REQUIREMENTS.map((r) => {
                  const met = r.test(password);
                  const started = password.length > 0;
                  return (
                    <li
                      key={r.label}
                      className={`flex items-center gap-1.5 text-xs transition-colors ${
                        met
                          ? "text-green-600"
                          : started
                            ? "text-red-500"
                            : "text-stone-400"
                      }`}
                    >
                      <svg
                        className="w-3.5 h-3.5 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d={
                            met
                              ? "M5 13l4 4L19 7"
                              : "M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0"
                          }
                        />
                      </svg>
                      {r.label}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Re-enter your password"
                className="w-full px-4 py-2.5 border border-stone-200 rounded-xl text-sm bg-amber-50/40 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent placeholder:text-stone-400 transition-shadow"
              />
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <p className="text-xs text-red-500 mt-1">
                  Passwords don't match
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={
                loading || !requirementsMet || password !== confirmPassword
              }
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-md shadow-amber-200 mt-2"
            >
              {loading ? "Saving…" : "Create password & sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-stone-400 text-xs mt-6">
          Serving with love, one connection at a time
        </p>
      </div>
    </div>
  );
}
