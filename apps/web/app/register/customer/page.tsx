/* Hallmark · macrostructure: Customer Identity Registration · genre: modern-minimal · theme: Midnight-Amethyst
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 * motion-primitives: SpotlightCard, AnimatedGroup, MotionAlert
 */
"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Check,
} from "../../../components/icons";
import { FloatingParticles, PulsingDot } from "../../../components/animated-svgs";
import { apiFetch } from "../../../lib/api-client";
import { isSafeReturnPath } from "../../../lib/auth/resolve-post-auth-destination";
import { sanitizeErrorMessage, SanitizedError } from "../../../lib/error-utils";
import { SanitizedAlert } from "../../../components/sanitized-alert";
import {
  SpotlightCard,
  AnimatedGroup,
  MotionAlert,
} from "../../../components/motion-primitives";

export default function CustomerRegistrationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<SanitizedError | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const checks = useMemo(
    () => [
      { label: "12+ characters", met: password.length >= 12 },
      { label: "Lowercase", met: /[a-z]/.test(password) },
      { label: "Uppercase", met: /[A-Z]/.test(password) },
      { label: "Number", met: /[0-9]/.test(password) },
    ],
    [password]
  );

  const allChecksMet = useMemo(() => checks.every((c) => c.met), [checks]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email")).trim().toLowerCase();
    const fullName = String(data.get("fullName")).trim();
    const phone = String(data.get("phone") || "").trim();

    if (!fullName || fullName.length < 2) {
      setError({
        message: "Please enter your full legal name (at least 2 characters).",
      });
      setBusy(false);
      return;
    }

    if (!email || !email.includes("@")) {
      setError({
        message: "Please provide a valid email address.",
      });
      setBusy(false);
      return;
    }

    if (!allChecksMet) {
      setError({
        message: "Please satisfy all password security requirements before continuing.",
      });
      setBusy(false);
      return;
    }

    try {
      const response = await apiFetch<any>("/auth/register-customer", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          email,
          password,
          phone: phone || undefined,
        }),
      });

      if (response.success) {
        sessionStorage.setItem("bookpro.pendingVerificationEmail", email);
        const returnTo = searchParams.get("returnTo");
        if (isSafeReturnPath(returnTo)) {
          sessionStorage.setItem("bookpro.pendingVerificationReturnTo", returnTo);
        }
        const target = isSafeReturnPath(returnTo)
          ? `/verify-email?email=${encodeURIComponent(email)}&returnTo=${encodeURIComponent(returnTo)}`
          : `/verify-email?email=${encodeURIComponent(email)}`;
        router.push(target);
      } else {
        setError(
          sanitizeErrorMessage(
            response.error,
            "Customer registration could not be completed. Please review your details and try again."
          )
        );
      }
    } catch (err: any) {
      setError(
        sanitizeErrorMessage(err, "An unexpected network error occurred. Please try again.")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="glass-container"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px 16px",
        position: "relative",
        background: "radial-gradient(ellipse 90% 70% at 50% -10%, #1e1138 0%, #070b12 100%)",
        color: "#f8fafc",
        overflowX: "clip",
      }}
    >
      <FloatingParticles count={14} />

      <div style={{ width: "100%", maxWidth: "480px", position: "relative", zIndex: 10 }}>
        {/* Top Navigation */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "#94a3b8",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: "8px",
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              transition: "all 0.15s ease",
            }}
          >
            <ArrowLeft size={14} />
            <span>Back to Home</span>
          </Link>

          <Link
            href="/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              color: "#c084fc",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            <span>Already registered? Sign in</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* Motion-Primitives Spotlight Card */}
        <SpotlightCard
          spotlightColor="rgba(192, 132, 252, 0.15)"
          style={{
            padding: "36px 30px",
            boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(168, 85, 247, 0.12)",
          }}
        >
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "26px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "5px 12px",
                borderRadius: "9999px",
                backgroundColor: "rgba(192, 132, 252, 0.12)",
                border: "1px solid rgba(192, 132, 252, 0.3)",
                color: "#c084fc",
                fontSize: "11.5px",
                fontWeight: 800,
                letterSpacing: "0.04em",
                marginBottom: "16px",
              }}
            >
              <PulsingDot color="#c084fc" size={5} />
              <span>UNIVERSAL CLIENT IDENTITY</span>
            </div>

            <h1
              style={{
                fontSize: "26px",
                fontWeight: 850,
                color: "#f8fafc",
                letterSpacing: "-0.03em",
                margin: "0 0 8px 0",
              }}
            >
              Create Client Account
            </h1>
            <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0, lineHeight: 1.5 }}>
              One profile to book, reschedule, and hold priority waitlists across all BookPro businesses.
            </p>
          </div>

          {/* Animated Error Alert */}
          <MotionAlert isVisible={Boolean(error)} type="error">
            <div style={{ marginBottom: "16px" }}>
              <SanitizedAlert error={error} onDismiss={() => setError(null)} />
            </div>
          </MotionAlert>

          <form onSubmit={submit} style={{ display: "grid", gap: "16px" }}>
            <AnimatedGroup stagger={0.06}>
              {/* Full Name */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#cbd5e1",
                    marginBottom: "6px",
                  }}
                >
                  Full name
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    placeholder="Your full name"
                    minLength={2}
                    required
                    style={{
                      width: "100%",
                      padding: "11px 14px 11px 38px",
                      borderRadius: "10px",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      color: "#f8fafc",
                      fontSize: "14px",
                      outline: "none",
                      transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#c084fc";
                      e.target.style.boxShadow = "0 0 0 2px rgba(192, 132, 252, 0.25)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "rgba(255, 255, 255, 0.12)";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                  <User size={16} color="#64748b" style={{ position: "absolute", left: "12px", top: "13px" }} />
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#cbd5e1",
                    marginBottom: "6px",
                  }}
                >
                  Email address
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    required
                    style={{
                      width: "100%",
                      padding: "11px 14px 11px 38px",
                      borderRadius: "10px",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      color: "#f8fafc",
                      fontSize: "14px",
                      outline: "none",
                      transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#c084fc";
                      e.target.style.boxShadow = "0 0 0 2px rgba(192, 132, 252, 0.25)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "rgba(255, 255, 255, 0.12)";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                  <Mail size={16} color="#64748b" style={{ position: "absolute", left: "12px", top: "13px" }} />
                </div>
              </div>

              {/* Phone (Optional) */}
              <div>
                <label
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#cbd5e1",
                    marginBottom: "6px",
                  }}
                >
                  <span>Phone number</span>
                  <span style={{ fontSize: "11.5px", color: "#64748b", fontWeight: 500 }}>Optional</span>
                </label>
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+1 (555) 012-3456"
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    backgroundColor: "rgba(15, 23, 42, 0.8)",
                    color: "#f8fafc",
                    fontSize: "14px",
                    outline: "none",
                    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#c084fc";
                    e.target.style.boxShadow = "0 0 0 2px rgba(192, 132, 252, 0.25)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "rgba(255, 255, 255, 0.12)";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>

              {/* Password */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#cbd5e1",
                    }}
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#94a3b8",
                      fontSize: "12px",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "0 2px",
                      transition: "color 0.15s ease",
                    }}
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    <span>{showPassword ? "Hide" : "Show"}</span>
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="12+ characters"
                    minLength={12}
                    required
                    style={{
                      width: "100%",
                      padding: "11px 14px 11px 38px",
                      borderRadius: "10px",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      color: "#f8fafc",
                      fontSize: "14px",
                      outline: "none",
                      transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#c084fc";
                      e.target.style.boxShadow = "0 0 0 2px rgba(192, 132, 252, 0.25)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "rgba(255, 255, 255, 0.12)";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                  <Lock size={16} color="#64748b" style={{ position: "absolute", left: "12px", top: "13px" }} />
                </div>
              </div>

              {/* Password Security Criteria Chips */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "8px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}
                aria-live="polite"
              >
                {checks.map((item, index) => (
                  <div
                    key={index}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "12px",
                      color: item.met ? "#34d399" : "#64748b",
                      transition: "color 0.15s ease",
                    }}
                  >
                    <span
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: "14px",
                        height: "14px",
                        borderRadius: "50%",
                        backgroundColor: item.met ? "rgba(52, 211, 153, 0.2)" : "rgba(255, 255, 255, 0.06)",
                        color: item.met ? "#34d399" : "#64748b",
                        fontSize: "9px",
                        fontWeight: 900,
                      }}
                    >
                      {item.met ? "✓" : "○"}
                    </span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={busy || !allChecksMet}
                style={{
                  marginTop: "6px",
                  width: "100%",
                  padding: "13px",
                  borderRadius: "10px",
                  border: "none",
                  background: "linear-gradient(135deg, #9333ea, #c084fc)",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: "14.5px",
                  cursor: busy || !allChecksMet ? "not-allowed" : "pointer",
                  opacity: busy || !allChecksMet ? 0.6 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  boxShadow: "0 4px 20px rgba(168, 85, 247, 0.4)",
                  transition: "transform 0.1s ease, box-shadow 0.15s ease",
                }}
                onMouseDown={(e) => {
                  if (!busy && allChecksMet) e.currentTarget.style.transform = "translateY(1px)";
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <span>{busy ? "Creating account…" : "Send verification code"}</span>
                <ArrowRight size={16} />
              </button>
            </AnimatedGroup>
          </form>

          {/* Footer Switching Links */}
          <div
            style={{
              marginTop: "24px",
              paddingTop: "18px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              textAlign: "center",
              fontSize: "13px",
              color: "#94a3b8",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div>
              Operating a clinic, salon, or studio?{" "}
              <Link href="/register" style={{ color: "#38bdf8", fontWeight: 700, textDecoration: "none" }}>
                <span>Register a business workspace</span> <ArrowRight size={12} style={{ display: "inline" }} />
              </Link>
            </div>
            <div>
              Already have an account?{" "}
              <Link href="/login" style={{ color: "#c084fc", fontWeight: 700, textDecoration: "none" }}>
                <span>Sign in here</span> <ArrowRight size={12} style={{ display: "inline" }} />
              </Link>
            </div>
          </div>
        </SpotlightCard>
      </div>
    </main>
  );
}
