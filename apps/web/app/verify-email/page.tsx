/* Hallmark · macrostructure: Secure confirmation console · genre: atmospheric · theme: BookPro Midnight
 * pre-emit critique: P5 H5 E5 S5 R4 V5
 * motion-primitives: TransitionPanel, SpotlightCard, AnimatedGroup, MotionAlert
 */
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { isSafeReturnPath } from "../../lib/auth/resolve-post-auth-destination";
import { CheckmarkDraw, FloatingParticles, ShieldLock } from "../../components/animated-svgs";
import { ArrowRight, Mail } from "../../components/icons";
import { sanitizeErrorMessage, SanitizedError } from "../../lib/error-utils";
import { SanitizedAlert } from "../../components/sanitized-alert";
import {
  TransitionPanel,
  SpotlightCard,
  AnimatedGroup,
  MotionAlert,
} from "../../components/motion-primitives";
import styles from "./verify-email.module.css";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

type VerificationResponse = { nextUrl?: string };

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refetchUser } = useAuth();
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [message, setMessage] = useState<SanitizedError | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [nextUrl, setNextUrl] = useState("/onboarding");
  const code = digits.join("");

  useEffect(() => {
    const queryEmail = searchParams.get("email");
    const pendingEmail = queryEmail || window.sessionStorage.getItem("bookpro.pendingVerificationEmail");
    if (pendingEmail) setEmail(pendingEmail);
  }, [searchParams]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  function setDigit(index: number, value: string) {
    const nextValue = value.replace(/\D/g, "").slice(-1);
    setDigits((current) => current.map((digit, position) => (position === index ? nextValue : digit)));
    setMessage(null);
    if (nextValue && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
    if (event.key === "ArrowLeft" && index > 0) inputRefs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    setDigits(Array.from({ length: CODE_LENGTH }, (_, index) => pasted[index] || ""));
    inputRefs.current[Math.min(pasted.length, CODE_LENGTH) - 1]?.focus();
    setMessage(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setMessage({
        message: "Please enter the valid email address used during registration.",
      });
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setMessage({
        message: "Please enter all six digits from your confirmation email.",
      });
      return;
    }

    setStatus("submitting");
    setMessage(null);
    try {
      const response = await apiFetch<VerificationResponse>("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail, token: code }),
      });
      if (!response.success) {
        setMessage(
          sanitizeErrorMessage(
            response.error,
            "The confirmation code is invalid or has expired. Request a new code and try again."
          )
        );
        setStatus("idle");
        return;
      }
      window.sessionStorage.removeItem("bookpro.pendingVerificationEmail");
      const pendingReturnTo =
        searchParams.get("returnTo") || window.sessionStorage.getItem("bookpro.pendingVerificationReturnTo");
      window.sessionStorage.removeItem("bookpro.pendingVerificationReturnTo");
      const safeTarget = isSafeReturnPath(pendingReturnTo) ? pendingReturnTo : null;
      setNextUrl(safeTarget || response.data?.nextUrl || "/customer");
      await refetchUser();
      setStatus("success");
    } catch (error) {
      setMessage(
        sanitizeErrorMessage(error, "Verification is temporarily unavailable. Please check your connection and try again.")
      );
      setStatus("idle");
    }
  }

  async function handleResend() {
    const normalizedEmail = email.trim().toLowerCase();
    if (resendSeconds > 0) return;
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setMessage({
        message: "Enter the email address used during registration before requesting another code.",
      });
      return;
    }
    setResendMessage(null);
    setMessage(null);
    setResendSeconds(RESEND_SECONDS);
    try {
      const response = await apiFetch("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail }),
      });
      if (!response.success) throw new Error(response.error?.message || "A new code could not be dispatched.");
      setDigits(Array(CODE_LENGTH).fill(""));
      setResendMessage("A new verification code has been dispatched. Check your inbox and spam folder.");
      inputRefs.current[0]?.focus();
    } catch (error) {
      setResendSeconds(0);
      setMessage(
        sanitizeErrorMessage(error, "Email dispatch is temporarily unavailable. Please try again shortly.")
      );
    }
  }

  return (
    <main className={styles.page}>
      <FloatingParticles count={18} />
      <div className={styles.ambientOrb} aria-hidden="true" />
      <Link className={styles.backLink} href="/" aria-label="Back to BookPro home">
        ← <span>Back to home</span>
      </Link>

      <TransitionPanel activeIndex={status === "success" ? 1 : 0} direction={1}>
        {/* Panel 0: Verification Entry */}
        <div className={styles.layout}>
          <SpotlightCard
            spotlightColor="rgba(56, 189, 248, 0.12)"
            className={styles.contextPanel}
            aria-label="Verification details"
          >
            <div className={styles.brand}>
              <span className={styles.brandMark}>B</span>
              <span>
                Book<span>Pro</span>
              </span>
            </div>
            <div className={styles.orbitStage}>
              <ShieldLock size={104} />
              <span className={styles.orbitOne} />
              <span className={styles.orbitTwo} />
            </div>
            <p className={styles.eyebrow}>Secure registration</p>
            <h2>
              One short check.
              <br />
              Your workspace stays yours.
            </h2>
            <p>
              We use a time-limited code to confirm your email without exposing an account-activation link in your inbox.
            </p>
            <div className={styles.securityNote}>
              <span className={styles.liveDot} />
              <span>Code expires after 15 minutes and locks after repeated incorrect attempts.</span>
            </div>
          </SpotlightCard>

          <SpotlightCard
            spotlightColor="rgba(56, 189, 248, 0.16)"
            className={styles.console}
          >
            <div className={styles.consoleHeader}>
              <div className={styles.iconTile}>
                <Mail size={24} />
              </div>
              <div>
                <p className={styles.eyebrow}>Email confirmation</p>
                <h1>Enter your six-digit code</h1>
              </div>
            </div>
            <p className={styles.lead}>
              Use the code sent to the email address you registered with. No action occurs until you select{" "}
              <strong>Confirm email</strong>.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <AnimatedGroup stagger={0.07}>
                <div>
                  <label className={styles.label} htmlFor="verification-email">
                    Registration email
                  </label>
                  <input
                    id="verification-email"
                    className={styles.emailInput}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setMessage(null);
                    }}
                    placeholder="you@business.com"
                    disabled={status === "submitting"}
                  />
                </div>

                <fieldset className={styles.codeFieldset}>
                  <legend>Six-digit confirmation code</legend>
                  <div className={styles.codeRow} onPaste={handlePaste}>
                    {digits.map((digit, index) => (
                      <input
                        key={index}
                        ref={(element) => {
                          inputRefs.current[index] = element;
                        }}
                        className={styles.codeInput}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete={index === 0 ? "one-time-code" : "off"}
                        maxLength={1}
                        value={digit}
                        onChange={(event) => setDigit(index, event.target.value)}
                        onKeyDown={(event) => handleKeyDown(index, event)}
                        aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
                        disabled={status === "submitting"}
                      />
                    ))}
                  </div>
                </fieldset>

                <MotionAlert isVisible={Boolean(message)} type="error">
                  <SanitizedAlert error={message} onDismiss={() => setMessage(null)} />
                </MotionAlert>

                {resendMessage && !message && (
                  <div className={styles.successMessage} role="status">
                    <span className={styles.liveDot} />
                    <span>{resendMessage}</span>
                  </div>
                )}

                <button
                  className={styles.primaryButton}
                  type="submit"
                  disabled={status === "submitting" || code.length !== CODE_LENGTH}
                >
                  {status === "submitting" ? (
                    <>
                      <span className={styles.spinner} /> Confirming…
                    </>
                  ) : (
                    <>
                      Confirm email <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </AnimatedGroup>
            </form>

            <div className={styles.resendRow}>
              <span>Didn’t receive the email?</span>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendSeconds > 0 || status === "submitting"}
              >
                {resendSeconds > 0 ? `Request again in ${resendSeconds}s` : "Send a new code"}
              </button>
            </div>
            <p className={styles.deliveryHint}>
              Check your spam folder and confirm that the email address above is correct.
            </p>
          </SpotlightCard>
        </div>

        {/* Panel 1: Success State */}
        <div style={{ display: "grid", placeItems: "center", width: "100%" }}>
          <SpotlightCard
            spotlightColor="rgba(52, 211, 153, 0.18)"
            className={`${styles.console} ${styles.successConsole}`}
            aria-live="polite"
          >
            <div className={styles.successMark}>
              <CheckmarkDraw size={72} />
            </div>
            <p className={styles.eyebrow}>Identity confirmed</p>
            <h1>Email confirmed.</h1>
            <p className={styles.lead}>
              {nextUrl === "/login"
                ? "Sign in once more to secure this privileged account with MFA."
                : nextUrl === "/customer"
                ? "Your customer portal is ready. You can now join organizations safely."
                : "Your BookPro workspace is ready for the next setup step."}
            </p>
            <button className={styles.primaryButton} onClick={() => router.push(nextUrl)}>
              Continue securely <ArrowRight size={18} />
            </button>
            <p className={styles.supportCopy}>
              You remain in control—BookPro will not move forward until you continue.
            </p>
          </SpotlightCard>
        </div>
      </TransitionPanel>
    </main>
  );
}
