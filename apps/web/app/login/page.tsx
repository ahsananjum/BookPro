/* Hallmark · macrostructure: Authenticated Portal Login · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 * motion-primitives: TransitionPanel, SpotlightCard, AnimatedGroup, MotionAlert
 */
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { Suspense, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { resolvePostAuthDestination } from "../../lib/auth/resolve-post-auth-destination";
import { ShieldLock, FloatingParticles } from "../../components/animated-svgs";
import { OrganizationSelector, OrganizationOption } from "./organization-selector";
import { ArrowLeft, ArrowRight, Check, Copy, Eye, EyeOff, Lock, Mail, ShieldCheck } from "../../components/icons";
import { sanitizeErrorMessage, SanitizedError } from "../../lib/error-utils";
import { SanitizedAlert } from "../../components/sanitized-alert";
import {
  TransitionPanel,
  SpotlightCard,
  AnimatedGroup,
  MotionAlert,
} from "../../components/motion-primitives";
import styles from "./login.module.css";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<SanitizedError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [customerOrgs, setCustomerOrgs] = useState<OrganizationOption[] | null>(null);
  const [loadingOrgId, setLoadingOrgId] = useState<string | null>(null);
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState<"secret" | "recovery" | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { refetchUser } = useAuth();

  // Active panel index for Motion-Primitives TransitionPanel:
  // 0: Standard Login
  // 1: MFA Challenge / Setup
  // 2: Recovery Codes
  // 3: Organization Selector
  const activePanelIndex = customerOrgs
    ? 3
    : recoveryCodes
    ? 2
    : mfaChallenge
    ? 1
    : 0;

  async function continueAfterRecovery() {
    await refetchUser();
    const sessionResponse = await apiFetch<any>("/auth/me");
    if (sessionResponse.success && sessionResponse.data) {
      window.location.assign(
        resolvePostAuthDestination(sessionResponse.data, searchParams.get("returnTo"))
      );
    } else {
      setError({
        message: "Your session could not be verified. Please sign in again.",
      });
    }
  }

  function resetMfa() {
    setMfaChallenge(null);
    setMfaCode("");
    setTotpSecret(null);
    setError(null);
  }

  async function copyText(value: string, kind: "secret" | "recovery") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1800);
  }

  function updateMfaCode(value: string) {
    setMfaCode(value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = mfaChallenge
        ? await apiFetch<any>("/auth/mfa/complete", {
            method: "POST",
            body: JSON.stringify({ challengeToken: mfaChallenge, code: mfaCode }),
          })
        : await apiFetch<any>("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
          });

      if (!response.success) {
        // Foolproof Error Messaging: transform technical/401/unauthorized errors into clear user copy
        const rawErr = response.error;
        const errMsg = typeof rawErr === "string" ? rawErr : rawErr?.message || "";
        const isAuthCredentialFailure =
          response.error?.code === "INVALID_CREDENTIALS" ||
          response.error?.code === "UNAUTHORIZED" ||
          /unauthorized|invalid credentials|invalid email or password|wrong password|status 401|server error \(401\)/i.test(
            errMsg
          );

        if (isAuthCredentialFailure) {
          setError({
            message: "Incorrect email or password. Please check your credentials and try again.",
            refId: response.error?.requestId || response.error?.code,
          });
        } else {
          setError(
            sanitizeErrorMessage(response.error, "We could not sign you in. Check your details and try again.")
          );
        }
        setSubmitting(false);
        return;
      }

      if (!mfaChallenge && response.data?.mfaRequired) {
        setMfaChallenge(response.data.challengeToken);
        setTotpSecret(response.data.totpSecret || null);
        setSubmitting(false);
        return;
      }

      if (response.data?.recoveryCodes?.length) {
        setRecoveryCodes(response.data.recoveryCodes);
        setSubmitting(false);
        return;
      }

      await refetchUser();
      const sessionResponse = await apiFetch<any>("/auth/me");

      if (!sessionResponse.success || !sessionResponse.data) {
        setError({
          message: "Your session could not be verified. Please sign in again.",
        });
        setSubmitting(false);
        return;
      }

      const userData = sessionResponse.data;

      // Check if user is a CUSTOMER and associated with organizations (only show selector if no returnTo requested)
      const requestedReturnTo = searchParams.get("returnTo");
      if (userData.actorType === "CUSTOMER" && !requestedReturnTo) {
        const customerOrgsRes = await apiFetch<any[]>("/auth/customer-organizations");
        if (customerOrgsRes.success && Array.isArray(customerOrgsRes.data) && customerOrgsRes.data.length > 1) {
          // Multi-org customer -> Show selector
          setCustomerOrgs(
            customerOrgsRes.data.map((item) => ({
              id: item.organization.id,
              name: item.organization.name,
              slug: item.organization.slug,
              brandName: item.organization.brandName,
              logoUrl: item.organization.logoUrl,
              totalAppointments: item.totalAppointments,
            }))
          );
          setSubmitting(false);
          return;
        }
      }

      // Direct routing
      const destination = resolvePostAuthDestination(userData, searchParams.get("returnTo"));
      window.location.assign(destination);
    } catch (err: any) {
      console.error("[LoginForm] Unexpected submission error:", err);
      setError(
        sanitizeErrorMessage(err, "An unexpected network error occurred during sign in. Please try again.")
      );
      setSubmitting(false);
    }
  }

  async function handleSelectOrg(organizationId: string, slug: string) {
    setLoadingOrgId(organizationId);
    const selectRes = await apiFetch("/auth/select-customer-organization", {
      method: "POST",
      body: JSON.stringify({ organizationId }),
    });

    if (selectRes.success) {
      await refetchUser();
      window.location.assign(`/${slug}/account`);
    } else {
      setError(sanitizeErrorMessage(selectRes.error, "Could not switch to that organization. Try again."));
      setLoadingOrgId(null);
    }
  }

  return (
    <main
      className="glass-container"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px 16px",
        position: "relative",
      }}
    >
      <FloatingParticles count={14} />

      <div
        style={{
          width: "100%",
          maxWidth: customerOrgs ? "560px" : "440px",
          position: "relative",
          zIndex: 10,
          transition: "max-width 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Top Back-to-Home & Redirect Nav */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "14px",
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
            href="/register/customer"
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
            <span>Client Sign Up</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* Motion-Primitives Spotlight Card */}
        <SpotlightCard
          spotlightColor="rgba(56, 189, 248, 0.15)"
          style={{
            padding: "32px 28px",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5), 0 0 40px rgba(2, 132, 199, 0.15)",
          }}
        >
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                color: "#f8fafc",
                textDecoration: "none",
                fontWeight: 900,
                fontSize: "22px",
                marginBottom: "18px",
              }}
            >
              <span
                style={{
                  display: "grid",
                  width: "38px",
                  height: "38px",
                  placeItems: "center",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #0284c7, #7c3aed)",
                  color: "#fff",
                  boxShadow: "0 4px 16px rgba(2, 132, 199, 0.4)",
                }}
              >
                B
              </span>
              <span>
                Book<span style={{ color: "#38bdf8" }}>Pro</span>
              </span>
            </Link>

            <div style={{ margin: "0 auto 12px", display: "grid", placeItems: "center" }}>
              <ShieldLock size={50} />
            </div>

            <h1
              id="login-title"
              style={{ fontSize: "24px", fontWeight: 800, color: "#f8fafc", margin: "0 0 6px 0" }}
            >
              Welcome back
            </h1>
            <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>
              Sign in to your business, staff, or customer workspace.
            </p>
          </div>

          {/* Animated Error Alert with Motion Primitives */}
          <MotionAlert isVisible={Boolean(error)} type="error">
            <div style={{ marginBottom: "16px" }}>
              <SanitizedAlert error={error} onDismiss={() => setError(null)} />
            </div>
          </MotionAlert>

          {/* TransitionPanel: Smoothly animating between Login, MFA, Recovery, and Org Selector */}
          <TransitionPanel activeIndex={activePanelIndex}>
            {/* Panel 0: Primary Login Form */}
            <form onSubmit={submit} style={{ display: "grid", gap: "16px" }}>
              <AnimatedGroup stagger={0.07}>
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
                      autoComplete="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="name@business.com"
                      required
                      style={{
                        width: "100%",
                        padding: "12px 14px 12px 38px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        backgroundColor: "rgba(15, 23, 42, 0.8)",
                        color: "#f8fafc",
                        fontSize: "14px",
                        outline: "none",
                        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = "#38bdf8";
                        e.target.style.boxShadow = "0 0 0 2px rgba(56, 189, 248, 0.25)";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = "rgba(255, 255, 255, 0.12)";
                        e.target.style.boxShadow = "none";
                      }}
                    />
                    <Mail
                      size={16}
                      color="#64748b"
                      style={{ position: "absolute", left: "12px", top: "14px" }}
                    />
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "6px",
                    }}
                  >
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
                      autoComplete="current-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••••••"
                      minLength={8}
                      required
                      style={{
                        width: "100%",
                        padding: "12px 14px 12px 38px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        backgroundColor: "rgba(15, 23, 42, 0.8)",
                        color: "#f8fafc",
                        fontSize: "14px",
                        outline: "none",
                        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = "#38bdf8";
                        e.target.style.boxShadow = "0 0 0 2px rgba(56, 189, 248, 0.25)";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = "rgba(255, 255, 255, 0.12)";
                        e.target.style.boxShadow = "none";
                      }}
                    />
                    <Lock
                      size={16}
                      color="#64748b"
                      style={{ position: "absolute", left: "12px", top: "14px" }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    marginTop: "8px",
                    width: "100%",
                    padding: "13px",
                    borderRadius: "10px",
                    border: "none",
                    background: "linear-gradient(135deg, #0284c7, #2563eb)",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: "14.5px",
                    cursor: submitting ? "not-allowed" : "pointer",
                    opacity: submitting ? 0.7 : 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    boxShadow: "0 4px 20px rgba(2, 132, 199, 0.4)",
                    transition: "transform 0.1s ease, box-shadow 0.15s ease",
                  }}
                  onMouseDown={(e) => {
                    if (!submitting) e.currentTarget.style.transform = "translateY(1px)";
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  {submitting ? "Signing in…" : "Sign In to Workspace"} <ArrowRight size={16} />
                </button>
              </AnimatedGroup>
            </form>

            {/* Panel 1: MFA Challenge Form */}
            <form onSubmit={submit} className={styles.securityStep}>
              <button type="button" className={styles.backButton} onClick={resetMfa}>
                <ArrowLeft size={15} /> Back to sign in
              </button>
              <div className={styles.stepIcon}>
                <ShieldCheck size={24} />
              </div>
              <div className={styles.stepHeading}>
                <p>{totpSecret ? "Required security setup" : "Two-step verification"}</p>
                <h2>{totpSecret ? "Protect your BookPro account" : "Verify it’s you"}</h2>
                <span>
                  {totpSecret
                    ? "BookPro requires an authenticator for privileged accounts. Setup takes about a minute."
                    : "Enter the current code from your authenticator app. You can also use one of your recovery codes."}
                </span>
              </div>

              {totpSecret && (
                <ol className={styles.setupSteps}>
                  <li>
                    <span>1</span>
                    <div>
                      <strong>Open your authenticator app</strong>
                      <small>Use Google Authenticator, Microsoft Authenticator, 1Password, Authy, or another TOTP app.</small>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>Add a new account</strong>
                      <small>
                        Choose “Enter a setup key,” then use the account name <b>{email}</b>.
                      </small>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>Enter this one-time setup key</strong>
                      <div className={styles.secretRow}>
                        <code>{totpSecret.match(/.{1,4}/g)?.join(" ")}</code>
                        <button
                          type="button"
                          onClick={() => copyText(totpSecret, "secret")}
                          aria-label="Copy setup key"
                        >
                          {copied === "secret" ? <Check size={16} /> : <Copy size={16} />}
                          {copied === "secret" ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  </li>
                </ol>
              )}

              <label className={styles.codeField}>
                <span>{totpSecret ? "Confirm with the six-digit code" : "Authentication or recovery code"}</span>
                <input
                  autoFocus
                  inputMode={totpSecret ? "numeric" : "text"}
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(event) => updateMfaCode(event.target.value)}
                  placeholder={totpSecret ? "000 000" : "Enter your code"}
                  aria-invalid={Boolean(error)}
                  required
                />
                <small>
                  {totpSecret
                    ? "Codes refresh every 30 seconds."
                    : "Never share this code with anyone, including BookPro support."}
                </small>
              </label>
              <button
                type="submit"
                disabled={submitting || (totpSecret ? mfaCode.length !== 6 : mfaCode.length < 6)}
                className={styles.primaryButton}
              >
                {submitting ? "Verifying…" : totpSecret ? "Enable and continue" : "Verify and continue"}{" "}
                <ArrowRight size={16} />
              </button>
            </form>

            {/* Panel 2: Recovery Codes */}
            <section className={styles.securityStep} aria-labelledby="recovery-title">
              <div className={styles.stepIcon}>
                <ShieldCheck size={24} />
              </div>
              <div className={styles.stepHeading}>
                <p>Two-step verification is on</p>
                <h2 id="recovery-title">Save your recovery codes</h2>
                <span>Store these somewhere safe. Each code can be used once if you lose access to your authenticator.</span>
              </div>
              <pre className={styles.recoveryGrid}>{recoveryCodes?.join("\n")}</pre>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => recoveryCodes && copyText(recoveryCodes.join("\n"), "recovery")}
              >
                {copied === "recovery" ? <Check size={16} /> : <Copy size={16} />}{" "}
                {copied === "recovery" ? "Copied" : "Copy all codes"}
              </button>
              <button type="button" className={styles.primaryButton} onClick={continueAfterRecovery}>
                I’ve saved them — continue <ArrowRight size={16} />
              </button>
            </section>

            {/* Panel 3: Organization Selector */}
            {customerOrgs && (
              <OrganizationSelector
                title="Select Organization Portal"
                subtitle="You have appointments with multiple businesses. Choose which portal to open:"
                organizations={customerOrgs}
                isCustomer={true}
                onSelect={handleSelectOrg}
                loadingOrgId={loadingOrgId}
              />
            )}
          </TransitionPanel>

          {/* Footer links */}
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
              New business or studio?{" "}
              <Link href="/register" style={{ color: "#38bdf8", fontWeight: 700, textDecoration: "none" }}>
                <span>Register a workspace</span>{" "}
                <ArrowRight size={13} style={{ display: "inline", verticalAlign: "middle" }} />
              </Link>
            </div>
            <div>
              Booking as a client?{" "}
              <Link href="/register/customer" style={{ color: "#c084fc", fontWeight: 700, textDecoration: "none" }}>
                <span>Create customer account</span>{" "}
                <ArrowRight size={13} style={{ display: "inline", verticalAlign: "middle" }} />
              </Link>
            </div>
          </div>
        </SpotlightCard>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="glass-container" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
          <p style={{ color: "#94a3b8" }}>Loading sign in…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
