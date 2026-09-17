/* Hallmark · macrostructure: Staff Onboarding / Invitation Acceptance · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 */
"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { resolvePostAuthDestination } from "../../../lib/auth/resolve-post-auth-destination";
import { GlassCard, GlassBadge } from "../../../components/glass-card";
import { FloatingParticles, PulsingDot } from "../../../components/animated-svgs";
import {
  ArrowLeft,
  ArrowRight,
  User,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
} from "../../../components/icons";
import { sanitizeErrorMessage, SanitizedError } from "../../../lib/error-utils";
import { SanitizedAlert } from "../../../components/sanitized-alert";

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refetchUser } = useAuth();

  const token = searchParams.get("token") || "";
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<SanitizedError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(
        sanitizeErrorMessage("Missing invitation token. Please check the invitation link sent to your email.")
      );
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError(sanitizeErrorMessage("Cannot accept invitation without a valid invitation token."));
      return;
    }

    if (!fullName.trim() || fullName.length < 2) {
      setError(sanitizeErrorMessage("Please enter your legal full name (at least 2 characters)."));
      return;
    }

    if (password.length < 8) {
      setError(sanitizeErrorMessage("Password must be at least 8 characters."));
      return;
    }

    setSubmitting(true);

    try {
      const res = await apiFetch<any>("/auth/invite/accept", {
        method: "POST",
        body: JSON.stringify({ token, fullName: fullName.trim(), password, phone: phone.trim() || undefined }),
      });

      if (!res.success) {
        setError(sanitizeErrorMessage(res.error, "Failed to accept staff invitation."));
        setSubmitting(false);
        return;
      }

      await refetchUser();
      const session = await apiFetch<any>("/auth/me");
      if (!session.success || !session.data) {
        setError(
          sanitizeErrorMessage(
            "Your invitation was accepted, but the session could not be verified. Please sign in."
          )
        );
        return;
      }

      if (res.data?.mfaRequired) {
        router.replace(`/login?email=${encodeURIComponent(res.data.user?.email || "")}`);
        return;
      }
      router.replace(resolvePostAuthDestination(session.data));
    } catch (err: any) {
      setError(sanitizeErrorMessage(err, "An unexpected network error occurred. Please try again."));
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px 16px",
        position: "relative",
        backgroundColor: "#070b12",
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
              color: "#38bdf8",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            <span>Existing staff? Sign in</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* Verification Card */}
        <GlassCard variant="elevated" glow="primary" depth3D style={{ padding: "36px 30px" }}>
          {/* Step Header */}
          <div style={{ textAlign: "center", marginBottom: "26px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "5px 12px",
                borderRadius: "9999px",
                backgroundColor: "rgba(56, 189, 248, 0.12)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                color: "#38bdf8",
                fontSize: "11.5px",
                fontWeight: 800,
                letterSpacing: "0.04em",
                marginBottom: "16px",
              }}
            >
              <PulsingDot color="#38bdf8" size={5} />
              <span>STAFF INVITATION VERIFIED</span>
            </div>

            <h1
              style={{
                fontSize: "24px",
                fontWeight: 850,
                letterSpacing: "-0.03em",
                color: "#f8fafc",
                margin: "0 0 8px 0",
              }}
            >
              Complete Staff Setup
            </h1>
            <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0, lineHeight: 1.5 }}>
              You have been invited to join a BookPro organization roster. Set up your staff credentials to access your schedule.
            </p>
          </div>

          <SanitizedAlert error={error} onDismiss={() => setError(null)} />

          {/* Form Body */}
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "16px" }}>
            {/* Full Name */}
            <div>
              <label
                htmlFor="name-input"
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#cbd5e1",
                  marginBottom: "6px",
                }}
              >
                Full Name
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="name-input"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full legal name"
                  style={{
                    width: "100%",
                    padding: "11px 14px 11px 38px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    backgroundColor: "rgba(15, 23, 42, 0.8)",
                    color: "#f8fafc",
                    fontSize: "14px",
                    outline: "none",
                  }}
                />
                <User size={16} color="#64748b" style={{ position: "absolute", left: "12px", top: "13px" }} />
              </div>
            </div>

            {/* Password */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label
                  htmlFor="pass-input"
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#cbd5e1",
                  }}
                >
                  Create Password
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
                  id="pass-input"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  minLength={8}
                  style={{
                    width: "100%",
                    padding: "11px 14px 11px 38px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    backgroundColor: "rgba(15, 23, 42, 0.8)",
                    color: "#f8fafc",
                    fontSize: "14px",
                    outline: "none",
                  }}
                />
                <Lock size={16} color="#64748b" style={{ position: "absolute", left: "12px", top: "13px" }} />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label
                htmlFor="phone-input"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#cbd5e1",
                  marginBottom: "6px",
                }}
              >
                <span>Direct Phone (Optional)</span>
                <span style={{ fontSize: "11.5px", color: "#64748b", fontWeight: 500 }}>SMS alerts</span>
              </label>
              <input
                id="phone-input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
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
                }}
              />
            </div>

            {/* Action Button */}
            <button
              type="submit"
              disabled={submitting || !token || password.length < 8}
              style={{
                marginTop: "6px",
                width: "100%",
                padding: "13px",
                borderRadius: "10px",
                border: "none",
                background: "linear-gradient(135deg, #0284c7, #2563eb)",
                color: "#fff",
                fontWeight: 800,
                fontSize: "14.5px",
                cursor: submitting || !token || password.length < 8 ? "not-allowed" : "pointer",
                opacity: submitting || !token || password.length < 8 ? 0.6 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow: "0 4px 20px rgba(2, 132, 199, 0.4)",
                transition: "all 0.15s ease",
              }}
            >
              <span>{submitting ? "Activating account…" : "Accept Invitation & Access Workspace"}</span>
              <ArrowRight size={16} />
            </button>
          </form>

          {/* Footer note */}
          <div
            style={{
              marginTop: "24px",
              paddingTop: "16px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              textAlign: "center",
              fontSize: "12.5px",
              color: "#64748b",
            }}
          >
            By accepting, you gain access to assigned appointments, client histories, and schedule management within your organization.
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            backgroundColor: "#070b12",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#94a3b8",
            fontSize: "14px",
          }}
        >
          Validating invitation token…
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
