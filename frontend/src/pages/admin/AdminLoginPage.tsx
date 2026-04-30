import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "../../lib/auth-client";
import { useBranding } from "../../context/BrandingContext";

type View = "login" | "reset";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { config } = useBranding();

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Forgot password state
  const [view, setView] = useState<View>("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  const resetEmailRef = useRef<HTMLInputElement>(null);

  // Move focus to the reset email input when the reset view appears
  useEffect(() => {
    if (view === "reset") {
      resetEmailRef.current?.focus();
    }
  }, [view]);

  function showResetView() {
    setResetEmail(email);
    setResetError(null);
    setResetSuccess(false);
    setView("reset");
  }

  function showLoginView() {
    setLoginError(null);
    setView("login");
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setLoginError("Invalid email or password.");
      } else {
        navigate("/admin", { replace: true });
      }
    } catch {
      setLoginError("Invalid email or password.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResetError(null);
    setResetSuccess(false);
    setResetLoading(true);
    try {
      const result = await authClient.forgetPassword({
        email: resetEmail,
        redirectTo: window.location.origin + "/admin/login",
      });
      if (result.error) {
        setResetError(result.error.message ?? "Failed to send reset link.");
      } else {
        setResetSuccess(true);
      }
    } catch {
      setResetError("Failed to send reset link. Please try again.");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-card__header">
          {config.logo_url ? (
            <img src={config.logo_url} alt={config.app_name} className="admin-login-card__logo" />
          ) : (
            <span className="admin-login-card__app-name">{config.app_name}</span>
          )}
          <h1 className="admin-login-card__title">Admin Portal</h1>
          <p className="admin-login-card__subtitle">Sign in to manage buildings and General Meetings</p>
        </div>

        {view === "login" ? (
          <form onSubmit={(e) => { void handleLoginSubmit(e); }} className="admin-login-card__form">
            {loginError && (
              <p className="admin-login-card__error" role="alert">
                {loginError}
              </p>
            )}

            <div className="field">
              <label htmlFor="email" className="field__label">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="field__input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password" className="field__label">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="field__input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn--primary btn--full"
              disabled={loginLoading}
            >
              {loginLoading ? "Signing in…" : "Sign in"}
            </button>

            <button
              type="button"
              className="btn btn--ghost admin-login-forgot"
              onClick={showResetView}
            >
              Forgot password?
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => { void handleResetSubmit(e); }} className="admin-login-card__form">
            {resetSuccess ? (
              <p className="admin-login-card__success" role="status">
                If that email is registered, a reset link has been sent.
              </p>
            ) : (
              <>
                {resetError && (
                  <p className="admin-login-card__error" role="alert">
                    {resetError}
                  </p>
                )}

                <div className="field">
                  <label htmlFor="reset-email" className="field__label">
                    Email
                  </label>
                  <input
                    id="reset-email"
                    ref={resetEmailRef}
                    type="email"
                    className="field__input"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn--primary btn--full"
                  disabled={resetLoading}
                >
                  {resetLoading ? "Sending…" : "Send reset link"}
                </button>
              </>
            )}

            <button
              type="button"
              className="btn btn--ghost admin-login-back-to-login"
              onClick={showLoginView}
            >
              ← Back to login
            </button>
          </form>
        )}

        <button
          type="button"
          className="btn btn--ghost admin-login-back"
          onClick={() => navigate("/")}
        >
          ← Back to home
        </button>
      </div>
    </div>
  );
}
