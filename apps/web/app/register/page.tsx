/* Hallmark · macrostructure: Business Workspace Registration · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 * motion-primitives: TransitionPanel, SpotlightCard, AnimatedGroup, MotionAlert, CollapsibleDisclosure
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import { FloatingParticles } from "../../components/animated-svgs";
import { GlassBadge } from "../../components/glass-card";
import { sanitizeErrorMessage, SanitizedError } from "../../lib/error-utils";
import { SanitizedAlert } from "../../components/sanitized-alert";
import {
  ArrowRight,
  ArrowLeft,
  Building,
  User,
  Mail,
  Lock,
  Globe,
  Eye,
  EyeOff,
  Check,
  X,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "../../components/icons";
import {
  TransitionPanel,
  SpotlightCard,
  AnimatedGroup,
  MotionAlert,
  CollapsibleDisclosure,
} from "../../components/motion-primitives";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

// Background Orbit Rings Component for Hallmark depth
function OrbitRings() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1440 900"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          opacity: 0.25,
        }}
      >
        <circle
          cx="720"
          cy="450"
          r="420"
          stroke="url(#regRingGrad1)"
          strokeWidth="1"
          strokeDasharray="4 8"
        />
        <circle
          cx="720"
          cy="450"
          r="580"
          stroke="url(#regRingGrad2)"
          strokeWidth="1"
          strokeDasharray="6 12"
        />
        <defs>
          <linearGradient id="regRingGrad1" x1="300" y1="30" x2="1140" y2="870" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38bdf8" stopOpacity="0.6" />
            <stop offset="0.5" stopColor="#818cf8" stopOpacity="0.2" />
            <stop offset="1" stopColor="#0284c7" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="regRingGrad2" x1="140" y1="0" x2="1300" y2="900" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6366f1" stopOpacity="0.4" />
            <stop offset="0.7" stopColor="#38bdf8" stopOpacity="0.1" />
            <stop offset="1" stopColor="#0369a1" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();

  // Registration collects account and workspace details; verification lives on its own route.
  const [stage, setStage] = useState<1 | 2>(1);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    organizationName: "",
    organizationSlug: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    currency: "USD",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showCriteriaList, setShowCriteriaList] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugState, setSlugState] = useState<"idle" | "loading" | "available" | "unavailable">("idle");
  const [error, setError] = useState<SanitizedError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const idempotencyKey = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  );

  const slugPreview = useMemo(
    () => form.organizationSlug || slugify(form.organizationName),
    [form.organizationName, form.organizationSlug]
  );

  // Real-time Password Security Assessment
  const passwordSecurity = useMemo(() => {
    const pwd = form.password;
    const hasMinLength = pwd.length >= 12;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
    const passwordsMatch = pwd.length > 0 && pwd === form.confirmPassword;

    let score = 0;
    if (hasMinLength) score += 1;
    if (hasUpper && hasLower) score += 1;
    if (hasNumber) score += 1;
    if (hasSpecial || pwd.length >= 16) score += 1;

    let label = "Weak";
    let color = "#f43f5e";
    if (score === 2) {
      label = "Fair";
      color = "#f59e0b";
    } else if (score === 3) {
      label = "Good";
      color = "#38bdf8";
    } else if (score === 4) {
      label = "Strong";
      color = "#10b981";
    }

    const isValid = hasMinLength && hasUpper && hasLower && hasNumber;

    return {
      hasMinLength,
      hasUpper,
      hasLower,
      hasNumber,
      hasSpecial,
      passwordsMatch,
      score,
      label,
      color,
      isValid,
    };
  }, [form.password, form.confirmPassword]);

  // Debounced Slug Availability Check
  useEffect(() => {
    if (stage !== 2 || slugPreview.length < 3) {
      setSlugState("idle");
      return;
    }

    setSlugState("loading");
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const response = await apiFetch<{ available: boolean }>(
        `/auth/registration/slug-availability?slug=${encodeURIComponent(slugPreview)}`,
        { signal: controller.signal }
      );
      if (response.success && response.data) {
        setSlugState(response.data.available ? "available" : "unavailable");
      } else {
        setSlugState("idle");
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [slugPreview, stage]);

  // Stage 1 -> Stage 2 Validation
  function handleContinueToStage2(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.fullName.trim() || form.fullName.length < 2) {
      setError({
        message: "Please enter your full legal name (at least 2 characters).",
      });
      return;
    }
    if (!form.email.trim() || !form.email.includes("@")) {
      setError({
        message: "Please provide a valid work or business email address.",
      });
      return;
    }
    if (!passwordSecurity.isValid) {
      setShowCriteriaList(true);
      setError({
        message: "Password must be at least 12 characters and include uppercase, lowercase, and a number.",
      });
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError({
        message: "Password confirmation does not match the password entered above.",
      });
      return;
    }

    setStage(2);
  }

  // Stage 2 -> Submit Registration & Dispatch Verification
  async function handleSubmitRegistration(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const finalSlug = slugPreview;
    if (!form.organizationName.trim() || form.organizationName.length < 2) {
      setError({
        message: "Business or studio name must be at least 2 characters.",
      });
      return;
    }
    if (!finalSlug || finalSlug.length < 3) {
      setError({
        message: "Public booking URL identifier must be at least 3 characters.",
      });
      return;
    }
    if (slugState === "unavailable") {
      setError({
        message: "This booking address is already claimed. Please choose a different slug.",
      });
      return;
    }

    setSubmitting(true);

    const payload = {
      fullName: form.fullName.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      organizationName: form.organizationName.trim(),
      organizationSlug: finalSlug,
      timezone: form.timezone,
      currency: form.currency,
    };

    try {
      const response = await apiFetch<any>("/auth/register-business", {
        method: "POST",
        headers: {
          "x-idempotency-key": idempotencyKey.current,
        },
        body: JSON.stringify(payload),
      });

      setSubmitting(false);

      if (!response.success) {
        setError(
          sanitizeErrorMessage(
            response.error,
            "Registration could not be completed. Please review your details and try again."
          )
        );
        return;
      }

      window.sessionStorage.setItem("bookpro.pendingVerificationEmail", payload.email);
      router.push("/verify-email");
    } catch (err: any) {
      setSubmitting(false);
      setError(
        sanitizeErrorMessage(err, "An unexpected network error occurred. Please try again.")
      );
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
        background: "radial-gradient(ellipse 90% 70% at 50% -10%, #0c1838 0%, #030712 100%)",
        color: "#f8fafc",
        overflowX: "clip",
      }}
    >
      <OrbitRings />
      <FloatingParticles count={20} />

      {/* Top Header Navigation */}
      <header
        style={{
          position: "absolute",
          top: "24px",
          left: "24px",
          right: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 20,
          maxWidth: "1100px",
          margin: "0 auto",
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            borderRadius: "24px",
            background: "rgba(15, 23, 42, 0.7)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            color: "#cbd5e1",
            fontSize: "13.5px",
            fontWeight: 600,
            textDecoration: "none",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
            transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "rgba(56, 189, 248, 0.4)";
            e.currentTarget.style.color = "#ffffff";
            e.currentTarget.style.transform = "translateX(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
            e.currentTarget.style.color = "#cbd5e1";
            e.currentTarget.style.transform = "translateX(0)";
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to Home</span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #0284c7, #2563eb)",
              display: "grid",
              placeItems: "center",
              fontWeight: 900,
              fontSize: "15px",
              color: "#ffffff",
              boxShadow: "0 0 16px rgba(2, 132, 199, 0.4)",
            }}
          >
            B
          </div>
          <span style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "-0.3px", color: "#ffffff" }}>
            Book<span style={{ color: "#38bdf8" }}>Pro</span>
          </span>
        </div>
      </header>

      {/* Main Registration Spotlight Card */}
      <div style={{ width: "100%", maxWidth: "540px", zIndex: 10, marginTop: "40px" }}>
        <SpotlightCard
          spotlightColor="rgba(56, 189, 248, 0.16)"
          style={{
            padding: "36px 32px",
            boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(2, 132, 199, 0.15)",
          }}
        >
          {/* Header Stage Indicators */}
          <div style={{ textAlign: "center", marginBottom: "26px" }}>
            <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginBottom: "16px" }}>
              <GlassBadge
                variant={stage === 1 ? "info" : "default"}
                size="sm"
              >
                <User size={13} />
                <span>1. Administrator</span>
              </GlassBadge>
              <GlassBadge
                variant={stage === 2 ? "info" : "default"}
                size="sm"
              >
                <Building size={13} />
                <span>2. Workspace</span>
              </GlassBadge>
            </div>

            <h1
              style={{
                fontSize: "26px",
                fontWeight: 800,
                letterSpacing: "-0.5px",
                margin: "0 0 8px 0",
                color: "#ffffff",
              }}
            >
              {stage === 1 ? "Create Your Admin Account" : "Configure Business Workspace"}
            </h1>

            <p style={{ fontSize: "14px", color: "#94a3b8", margin: 0, lineHeight: 1.5 }}>
              {stage === 1
                ? "Set up your master credentials to manage schedules, staff, and services."
                : "Establish your brand identity and customized client booking link."}
            </p>
          </div>

          {/* Animated Error Alert */}
          <MotionAlert isVisible={Boolean(error)} type="error">
            <div style={{ marginBottom: "18px" }}>
              <SanitizedAlert error={error} onDismiss={() => setError(null)} />
            </div>
          </MotionAlert>

          {/* Motion-Primitives TransitionPanel: Smooth bidirectional morph between stages */}
          <TransitionPanel activeIndex={stage === 1 ? 0 : 1} direction={stage === 1 ? -1 : 1}>
            {/* ========================================================================= */}
            {/* STAGE 1: ADMINISTRATOR CREDENTIALS                                         */}
            {/* ========================================================================= */}
            <form onSubmit={handleContinueToStage2} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <AnimatedGroup stagger={0.06}>
                {/* Full Name */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12.5px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: "#cbd5e1",
                      marginBottom: "6px",
                    }}
                  >
                    Full Name <span style={{ color: "#38bdf8" }}>*</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <User
                      size={16}
                      style={{
                        position: "absolute",
                        left: "14px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#64748b",
                      }}
                    />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Eleanor Vance"
                      value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "12px 14px 12px 42px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        backgroundColor: "rgba(15, 23, 42, 0.7)",
                        color: "#f8fafc",
                        fontSize: "14px",
                        outline: "none",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = "#38bdf8";
                        e.target.style.boxShadow = "0 0 0 3px rgba(56, 189, 248, 0.25)";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = "rgba(255, 255, 255, 0.12)";
                        e.target.style.boxShadow = "none";
                      }}
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12.5px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: "#cbd5e1",
                      marginBottom: "6px",
                    }}
                  >
                    Work Email <span style={{ color: "#38bdf8" }}>*</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <Mail
                      size={16}
                      style={{
                        position: "absolute",
                        left: "14px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#64748b",
                      }}
                    />
                    <input
                      type="email"
                      required
                      placeholder="eleanor@studio.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "12px 14px 12px 42px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        backgroundColor: "rgba(15, 23, 42, 0.7)",
                        color: "#f8fafc",
                        fontSize: "14px",
                        outline: "none",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = "#38bdf8";
                        e.target.style.boxShadow = "0 0 0 3px rgba(56, 189, 248, 0.25)";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = "rgba(255, 255, 255, 0.12)";
                        e.target.style.boxShadow = "none";
                      }}
                    />
                  </div>
                </div>

                {/* Password with Strength Meter */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label
                      style={{
                        fontSize: "12.5px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        color: "#cbd5e1",
                      }}
                    >
                      Master Password <span style={{ color: "#38bdf8" }}>*</span>
                    </label>
                    {form.password && (
                      <span style={{ fontSize: "12px", fontWeight: 700, color: passwordSecurity.color }}>
                        {passwordSecurity.label}
                      </span>
                    )}
                  </div>
                  <div style={{ position: "relative" }}>
                    <Lock
                      size={16}
                      style={{
                        position: "absolute",
                        left: "14px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#64748b",
                      }}
                    />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Create a secure password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "12px 42px 12px 42px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        backgroundColor: "rgba(15, 23, 42, 0.7)",
                        color: "#f8fafc",
                        fontSize: "14px",
                        outline: "none",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = "#38bdf8";
                        e.target.style.boxShadow = "0 0 0 3px rgba(56, 189, 248, 0.25)";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = "rgba(255, 255, 255, 0.12)";
                        e.target.style.boxShadow = "none";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: "absolute",
                        right: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        color: "#94a3b8",
                        cursor: "pointer",
                        padding: "4px",
                      }}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {/* 4-Bar Dynamic Color Strength Meter */}
                  {form.password && (
                    <div style={{ marginTop: "8px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px", height: "4px" }}>
                        {[1, 2, 3, 4].map((bar) => (
                          <div
                            key={bar}
                            style={{
                              height: "100%",
                              borderRadius: "2px",
                              backgroundColor:
                                bar <= passwordSecurity.score
                                  ? passwordSecurity.color
                                  : "rgba(255, 255, 255, 0.1)",
                              transition: "background-color 0.3s ease",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Progressive Disclosure: Password Criteria Toggle */}
                  <div style={{ marginTop: "8px" }}>
                    <button
                      type="button"
                      onClick={() => setShowCriteriaList(!showCriteriaList)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#94a3b8",
                        fontSize: "12px",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "0",
                      }}
                    >
                      <span>{showCriteriaList ? "Hide requirements" : "View password requirements"}</span>
                      {showCriteriaList ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>

                    <CollapsibleDisclosure isOpen={showCriteriaList}>
                      <div
                        style={{
                          marginTop: "8px",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          backgroundColor: "rgba(15, 23, 42, 0.5)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          display: "grid",
                          gap: "6px",
                          fontSize: "12px",
                          color: "#94a3b8",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {passwordSecurity.hasMinLength ? <Check size={13} color="#10b981" /> : <X size={13} color="#f43f5e" />}
                          <span style={{ color: passwordSecurity.hasMinLength ? "#e2e8f0" : "#94a3b8" }}>
                            Minimum 12 characters
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {passwordSecurity.hasUpper && passwordSecurity.hasLower ? (
                            <Check size={13} color="#10b981" />
                          ) : (
                            <X size={13} color="#f43f5e" />
                          )}
                          <span
                            style={{
                              color: passwordSecurity.hasUpper && passwordSecurity.hasLower ? "#e2e8f0" : "#94a3b8",
                            }}
                          >
                            Uppercase and lowercase letters
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {passwordSecurity.hasNumber ? <Check size={13} color="#10b981" /> : <X size={13} color="#f43f5e" />}
                          <span style={{ color: passwordSecurity.hasNumber ? "#e2e8f0" : "#94a3b8" }}>
                            At least one number (0-9)
                          </span>
                        </div>
                      </div>
                    </CollapsibleDisclosure>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12.5px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: "#cbd5e1",
                      marginBottom: "6px",
                    }}
                  >
                    Confirm Password <span style={{ color: "#38bdf8" }}>*</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <Lock
                      size={16}
                      style={{
                        position: "absolute",
                        left: "14px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#64748b",
                      }}
                    />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      placeholder="Repeat your password"
                      value={form.confirmPassword}
                      onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "12px 42px 12px 42px",
                        borderRadius: "10px",
                        border: `1px solid ${
                          form.confirmPassword && form.password !== form.confirmPassword
                            ? "rgba(244, 63, 94, 0.5)"
                            : "rgba(255, 255, 255, 0.12)"
                        }`,
                        backgroundColor: "rgba(15, 23, 42, 0.7)",
                        color: "#f8fafc",
                        fontSize: "14px",
                        outline: "none",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = "#38bdf8";
                        e.target.style.boxShadow = "0 0 0 3px rgba(56, 189, 248, 0.25)";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = "rgba(255, 255, 255, 0.12)";
                        e.target.style.boxShadow = "none";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{
                        position: "absolute",
                        right: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        color: "#94a3b8",
                        cursor: "pointer",
                        padding: "4px",
                      }}
                      aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Continue to Stage 2 Button */}
                <button
                  type="submit"
                  style={{
                    marginTop: "8px",
                    padding: "13px",
                    borderRadius: "10px",
                    border: "none",
                    background: "linear-gradient(135deg, #0284c7, #2563eb)",
                    color: "#ffffff",
                    fontWeight: 800,
                    fontSize: "14.5px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    boxShadow: "0 4px 18px rgba(2, 132, 199, 0.35)",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = "translateY(1px)";
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <span>Continue to Workspace Details</span>
                  <ArrowRight size={16} />
                </button>
              </AnimatedGroup>
            </form>

            {/* ========================================================================= */}
            {/* STAGE 2: WORKSPACE DETAILS & PUBLIC SLUG CONFIGURATION                    */}
            {/* ========================================================================= */}
            <form onSubmit={handleSubmitRegistration} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <AnimatedGroup stagger={0.06}>
                {/* Organization Name */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12.5px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: "#cbd5e1",
                      marginBottom: "6px",
                    }}
                  >
                    Business / Studio Name <span style={{ color: "#38bdf8" }}>*</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <Building
                      size={16}
                      style={{
                        position: "absolute",
                        left: "14px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#64748b",
                      }}
                    />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Apex Wellness Spa"
                      value={form.organizationName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          organizationName: val,
                          ...(!slugEdited ? { organizationSlug: slugify(val) } : {}),
                        }));
                      }}
                      style={{
                        width: "100%",
                        padding: "12px 14px 12px 42px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        backgroundColor: "rgba(15, 23, 42, 0.7)",
                        color: "#f8fafc",
                        fontSize: "14px",
                        outline: "none",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = "#38bdf8";
                        e.target.style.boxShadow = "0 0 0 3px rgba(56, 189, 248, 0.25)";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = "rgba(255, 255, 255, 0.12)";
                        e.target.style.boxShadow = "none";
                      }}
                    />
                  </div>
                </div>

                {/* Public Booking Slug with Live Availability Badge */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label
                      style={{
                        fontSize: "12.5px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        color: "#cbd5e1",
                      }}
                    >
                      Client Booking Link <span style={{ color: "#38bdf8" }}>*</span>
                    </label>
                    {slugPreview.length >= 3 && (
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 700 }}>
                        {slugState === "loading" && <span style={{ color: "#94a3b8" }}>Checking availability…</span>}
                        {slugState === "available" && (
                          <span style={{ color: "#10b981", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <Check size={12} /> Available
                          </span>
                        )}
                        {slugState === "unavailable" && (
                          <span style={{ color: "#f43f5e", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <X size={12} /> Taken
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      borderRadius: "10px",
                      border: `1px solid ${
                        slugState === "available"
                          ? "rgba(16, 185, 129, 0.5)"
                          : slugState === "unavailable"
                          ? "rgba(244, 63, 94, 0.5)"
                          : "rgba(255, 255, 255, 0.12)"
                      }`,
                      backgroundColor: "rgba(15, 23, 42, 0.7)",
                      overflow: "hidden",
                    }}
                  >
                    <span
                      style={{
                        padding: "12px 0 12px 14px",
                        color: "#64748b",
                        fontSize: "13.5px",
                        fontWeight: 600,
                        userSelect: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      bookpro.app/
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="apex-wellness"
                      value={slugPreview}
                      onChange={(e) => {
                        setSlugEdited(true);
                        setForm({ ...form, organizationSlug: slugify(e.target.value) });
                      }}
                      style={{
                        width: "100%",
                        padding: "12px 14px 12px 2px",
                        border: "none",
                        backgroundColor: "transparent",
                        color: "#38bdf8",
                        fontWeight: 700,
                        fontSize: "14px",
                        outline: "none",
                      }}
                    />
                  </div>
                  <span style={{ display: "block", marginTop: "5px", fontSize: "11.5px", color: "#64748b" }}>
                    Clients book appointments directly using this unique address.
                  </span>
                </div>

                {/* Timezone & Currency Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        color: "#cbd5e1",
                        marginBottom: "6px",
                      }}
                    >
                      Timezone
                    </label>
                    <div style={{ position: "relative" }}>
                      <Globe
                        size={15}
                        style={{
                          position: "absolute",
                          left: "12px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "#64748b",
                        }}
                      />
                      <select
                        value={form.timezone}
                        onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "11px 10px 11px 36px",
                          borderRadius: "10px",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          backgroundColor: "rgba(15, 23, 42, 0.9)",
                          color: "#f8fafc",
                          fontSize: "13px",
                          outline: "none",
                          cursor: "pointer",
                        }}
                      >
                        <option value="America/New_York">New York (EST/EDT)</option>
                        <option value="America/Chicago">Chicago (CST/CDT)</option>
                        <option value="America/Denver">Denver (MST/MDT)</option>
                        <option value="America/Los_Angeles">Los Angeles (PST/PDT)</option>
                        <option value="Europe/London">London (GMT/BST)</option>
                        <option value="Europe/Paris">Paris (CET/CEST)</option>
                        <option value="Asia/Karachi">Karachi (PKT)</option>
                        <option value="Asia/Dubai">Dubai (GST)</option>
                        <option value="Asia/Tokyo">Tokyo (JST)</option>
                        <option value="UTC">UTC</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        color: "#cbd5e1",
                        marginBottom: "6px",
                      }}
                    >
                      Currency
                    </label>
                    <select
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "11px 12px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        backgroundColor: "rgba(15, 23, 42, 0.9)",
                        color: "#f8fafc",
                        fontSize: "13px",
                        outline: "none",
                        cursor: "pointer",
                      }}
                    >
                      <option value="USD">USD ($ - US Dollar)</option>
                      <option value="EUR">EUR (€ - Euro)</option>
                      <option value="GBP">GBP (£ - British Pound)</option>
                      <option value="CAD">CAD ($ - Canadian Dollar)</option>
                      <option value="AUD">AUD ($ - Australian Dollar)</option>
                      <option value="AED">AED (AED - UAE Dirham)</option>
                      <option value="PKR">PKR (₨ - Pakistani Rupee)</option>
                    </select>
                  </div>
                </div>

                {/* Action Navigation */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setStage(1)}
                    style={{
                      padding: "12px",
                      borderRadius: "10px",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      backgroundColor: "rgba(15, 23, 42, 0.6)",
                      color: "#cbd5e1",
                      fontWeight: 700,
                      fontSize: "14px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    <ArrowLeft size={16} />
                    <span>Back</span>
                  </button>

                  <button
                    type="submit"
                    disabled={submitting || slugState === "unavailable"}
                    style={{
                      padding: "12px",
                      borderRadius: "10px",
                      border: "none",
                      background:
                        submitting || slugState === "unavailable"
                          ? "rgba(2, 132, 199, 0.4)"
                          : "linear-gradient(135deg, #0284c7, #2563eb)",
                      color: "#ffffff",
                      fontWeight: 800,
                      fontSize: "14.5px",
                      cursor: submitting || slugState === "unavailable" ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      boxShadow: "0 4px 18px rgba(2, 132, 199, 0.35)",
                      transition: "transform 0.15s ease, box-shadow 0.15s ease",
                    }}
                    onMouseDown={(e) => {
                      if (!submitting) e.currentTarget.style.transform = "translateY(1px)";
                    }}
                    onMouseUp={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    <span>{submitting ? "Creating Workspace…" : "Send Verification Code"}</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </AnimatedGroup>
            </form>
          </TransitionPanel>

          {/* Footer Switching Links */}
          <div
            style={{
              marginTop: "24px",
              paddingTop: "18px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              textAlign: "center",
              color: "#94a3b8",
              fontSize: "13px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div>
              Joining businesses as a customer?{" "}
              <Link href="/register/customer" style={{ color: "#38bdf8", fontWeight: 700, textDecoration: "none" }}>
                <span>Create a customer account</span> <ArrowRight size={12} style={{ display: "inline" }} />
              </Link>
            </div>
            <div>
              Already have a workspace?{" "}
              <Link href="/login" style={{ color: "#38bdf8", fontWeight: 700, textDecoration: "none" }}>
                <span>Sign in</span> <ArrowRight size={12} style={{ display: "inline" }} />
              </Link>
            </div>
          </div>
        </SpotlightCard>
      </div>
    </main>
  );
}
