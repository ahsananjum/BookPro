"use client";

import { ActorType, CustomerInvitationPreviewResult } from "@bookpro/contracts";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import styles from "../../customer-portal.module.css";

export default function CustomerInvitePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const returnTo = `/customer/invite?token=${encodeURIComponent(token)}`;

  const { user, loading: authLoading, refetchUser } = useAuth();
  const [preview, setPreview] = useState<CustomerInvitationPreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [consentMarketing, setConsentMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);
  const [joinedSuccess, setJoinedSuccess] = useState<boolean>(false);

  // Fetch invitation preview on mount
  useEffect(() => {
    if (!token) {
      setLoadingPreview(false);
      setPreviewError("This invitation link is missing or incomplete.");
      return;
    }

    setLoadingPreview(true);
    apiFetch<CustomerInvitationPreviewResult>("/customer-portal/invitations/preview", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        if (res.success && res.data) {
          setPreview(res.data);
        } else {
          setPreviewError(res.error?.message || "Invitation link is invalid or expired.");
        }
      })
      .catch((err) => {
        setPreviewError(err?.message || "Failed to load invitation details.");
      })
      .finally(() => {
        setLoadingPreview(false);
      });
  }, [token]);

  async function accept() {
    if (!preview) return;
    setBusy(true);
    setMessage(null);

    const response = await apiFetch<any>("/customer-portal/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token, consentMarketing }),
    });

    if (!response.success) {
      setBusy(false);
      setMessage({
        error: true,
        text: response.error?.message || "This invitation could not be accepted.",
      });
      return;
    }

    setJoinedSuccess(true);
    setMessage({
      error: false,
      text: `You joined ${preview.organizationName}. This organization is now connected to your customer portal.`,
    });

    // Automatically switch active session to newly joined organization
    try {
      const selected = await apiFetch("/auth/select-customer-organization", {
        method: "POST",
        body: JSON.stringify({ organizationId: preview.organizationId }),
      });
      await refetchUser();

      if (selected.success) {
        // Smooth transition to the customer account page
        setTimeout(() => {
          window.location.href = `/${preview.organizationSlug}/account`;
        }, 1500);
        return;
      }
    } catch {
      // Fallback message handles navigation
    }

    setBusy(false);
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <Link className={styles.brand} href="/">
            <span className={styles.brandMark}>B</span>
            <span>BookPro</span>
          </Link>
          <div className={styles.topActions}>
            <Link className={styles.textLink} href="/customer">
              Customer Portal
            </Link>
            <Link className={styles.textLink} href="/organizations">
              Directory
            </Link>
          </div>
        </header>

        <section className={styles.customerIntro}>
          <p className={styles.summary}>Verified Customer Invitation</p>
          <h1>{preview ? `Join ${preview.organizationName}` : "Customer Invitation"}</h1>
          <p>
            Connect your customer account to view past booking history, schedule services, and receive personalized member perks.
          </p>
        </section>

        {loadingPreview ? (
          <div className={styles.empty}>
            <strong>Verifying invitation security details…</strong>
            <span>Please wait while we validate this secure single-use token.</span>
          </div>
        ) : previewError ? (
          <div className={styles.error} role="alert">
            <strong>Unable to load invitation:</strong> {previewError}
            <div style={{ marginTop: "12px" }}>
              <Link className={styles.buttonSecondary} href="/customer">
                Go to Customer Portal
              </Link>
            </div>
          </div>
        ) : !preview ? null : preview.status === "EXPIRED" ? (
          <div className={styles.empty}>
            <strong>This invitation has expired.</strong>
            <span>
              The 7-day acceptance window has ended. Please ask {preview.organizationName} to send you a fresh invitation link.
            </span>
            <div className={styles.actions} style={{ marginTop: "16px" }}>
              <Link className={styles.buttonSecondary} href="/customer">
                Go to Customer Portal
              </Link>
            </div>
          </div>
        ) : preview.status === "REVOKED" ? (
          <div className={styles.empty}>
            <strong>This invitation has been revoked.</strong>
            <span>This link is no longer valid. Contact {preview.organizationName} if you believe this was an error.</span>
            <div className={styles.actions} style={{ marginTop: "16px" }}>
              <Link className={styles.buttonSecondary} href="/customer">
                Go to Customer Portal
              </Link>
            </div>
          </div>
        ) : preview.status === "ACCEPTED" ? (
          <div className={styles.empty}>
            <strong>This invitation has already been accepted.</strong>
            <span>
              {user?.actorType === ActorType.CUSTOMER
                ? `You can access your account with ${preview.organizationName} directly from your customer portal.`
                : "Sign in with your verified customer account to view your connected organizations."}
            </span>
            <div className={styles.actions} style={{ marginTop: "16px" }}>
              <Link className={styles.button} href={`/${preview.organizationSlug}/account`}>
                Open {preview.organizationName}
              </Link>
              <Link className={styles.buttonSecondary} href="/customer">
                Customer Portal
              </Link>
            </div>
          </div>
        ) : joinedSuccess ? (
          <div className={styles.card} style={{ borderColor: "rgba(16, 185, 129, 0.4)", backgroundColor: "rgba(16, 185, 129, 0.05)" }}>
            <div style={{ display: "grid", gap: "10px" }}>
              <span className={styles.meta} style={{ color: "#10b981" }}>Success</span>
              <h2 style={{ fontSize: "1.6rem", margin: 0 }}>You joined {preview.organizationName}!</h2>
              <p style={{ color: "#cbd5e1", lineHeight: 1.6 }}>
                This organization is now connected to your customer portal. Redirecting to your member account…
              </p>
            </div>
            <div className={styles.actions} style={{ marginTop: "20px" }}>
              <Link className={styles.button} href={`/${preview.organizationSlug}/account`}>
                Continue to {preview.organizationName}
              </Link>
              <Link className={styles.buttonSecondary} href="/customer">
                Go to Customer Portal
              </Link>
            </div>
          </div>
        ) : (
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <span className={styles.meta}>Connected Member Invitation</span>
                <h3>{preview.organizationName}</h3>
                <small style={{ color: "#94a3b8" }}>
                  Expires {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(preview.expiresAt))}
                </small>
              </div>
              {preview.logoUrl ? (
                <img src={preview.logoUrl} alt={preview.organizationName} className={styles.logo} />
              ) : (
                <div className={`${styles.logo} ${styles.logoFallback}`}>
                  {preview.organizationName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div style={{ marginBlock: "16px", padding: "14px", backgroundColor: "rgba(56, 189, 248, 0.08)", borderRadius: "8px", border: "1px solid rgba(56, 189, 248, 0.2)" }}>
              <strong style={{ display: "block", color: "#38bdf8", fontSize: "0.85rem", marginBottom: "4px" }}>
                🔒 Email verification required
              </strong>
              <span style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>
                This invitation can only be accepted by the verified customer account matching the invited email address.
              </span>
            </div>

            {authLoading ? (
              <div className={styles.empty}>
                <strong>Checking your session…</strong>
              </div>
            ) : !user ? (
              <div className={styles.empty}>
                <strong>Sign in or register before accepting</strong>
                <span>
                  Please sign in with the email address that received this invitation, or register a new customer account and confirm your 6-digit code.
                </span>
                <div className={styles.actions} style={{ marginTop: "12px" }}>
                  <Link className={styles.button} href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
                    Sign in
                  </Link>
                  <Link className={styles.buttonSecondary} href={`/register/customer?returnTo=${encodeURIComponent(returnTo)}`}>
                    Create customer account
                  </Link>
                </div>
              </div>
            ) : user.actorType !== ActorType.CUSTOMER ? (
              <div className={styles.error} role="alert">
                <strong>Account type mismatch:</strong> Business and staff accounts cannot accept customer invitations. Sign out and sign in with a verified customer account.
              </div>
            ) : !user.emailVerifiedAt ? (
              <div className={styles.empty}>
                <strong>Email verification required</strong>
                <span>
                  Your account ({user.email}) is not yet confirmed. Please verify your email code before accepting.
                </span>
                <div className={styles.actions} style={{ marginTop: "12px" }}>
                  <Link className={styles.button} href={`/verify-email?email=${encodeURIComponent(user.email)}&returnTo=${encodeURIComponent(returnTo)}`}>
                    Verify email code
                  </Link>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: "16px", fontSize: "0.85rem", color: "#e2e8f0" }}>
                  Signed in as: <strong>{user.email}</strong>
                </div>

                <label className={styles.consent} style={{ marginBottom: "20px" }}>
                  <input
                    type="checkbox"
                    checked={consentMarketing}
                    onChange={(e) => setConsentMarketing(e.target.checked)}
                  />
                  <span>Allow {preview.organizationName} to send me booking confirmations, offers, and promotions.</span>
                </label>

                <div className={styles.actions}>
                  <button className={styles.button} disabled={busy} onClick={accept}>
                    {busy ? "Connecting account…" : `Accept invitation & join ${preview.organizationName}`}
                  </button>
                  <Link className={styles.buttonSecondary} href="/customer">
                    Cancel
                  </Link>
                </div>
              </div>
            )}

            {message && (
              <p
                className={message.error ? styles.error : styles.success}
                role={message.error ? "alert" : "status"}
                style={{ marginTop: "16px" }}
              >
                {message.text}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
