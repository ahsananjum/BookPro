"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PageHeader } from "../../../../components/shell/app-shell";
import { apiFetch } from "../../../../lib/api-client";
import { CustomerInvitationDeliveryItem } from "@bookpro/contracts";
import { sanitizeErrorMessage, SanitizedError } from "../../../../lib/error-utils";
import { SanitizedAlert } from "../../../../components/sanitized-alert";
import { motion } from "framer-motion";
import {
  SpotlightCard,
  AnimatedGroup,
  MotionAlert,
  CollapsibleDisclosure,
} from "../../../../components/motion-primitives";
import {
  Mail,
  Send,
  Check,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
} from "../../../../components/icons";
import styles from "../../customer-ops.module.css";

export default function InviteCustomers() {
  const [invitations, setInvitations] = useState<CustomerInvitationDeliveryItem[]>([]);
  const [errorState, setErrorState] = useState<SanitizedError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllInvitations, setShowAllInvitations] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    const response = await apiFetch<CustomerInvitationDeliveryItem[]>("/customer-portal/invitations");
    if (response.success && response.data) {
      setInvitations(response.data);
    }
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email")).trim();
    setBusy("new");
    setErrorState(null);
    setSuccessMessage(null);

    const response = await apiFetch<{ id: string; email: string; expiresAt: string }>("/customer-portal/invitations", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setBusy(null);

    if (response.success) {
      setSuccessMessage(`A secure invitation was queued for Brevo delivery to ${email}.`);
      form.reset();
      await load();
    } else {
      setErrorState(sanitizeErrorMessage(response.error?.message, "The customer invitation could not be queued."));
    }
  }

  async function act(invitation: CustomerInvitationDeliveryItem, action: "revoke" | "resend") {
    setBusy(invitation.id + action);
    setErrorState(null);
    setSuccessMessage(null);

    const response = await apiFetch(`/customer-portal/invitations/${invitation.id}/${action}`, {
      method: "POST",
    });
    setBusy(null);

    if (response.success) {
      setSuccessMessage(
        action === "revoke"
          ? "Invitation revoked successfully."
          : `A new replacement invitation was queued for Brevo delivery to ${invitation.email}.`
      );
      await load();
    } else {
      setErrorState(sanitizeErrorMessage(response.error?.message, "The invitation action could not be completed."));
    }
  }

  const handleCopyEmail = (email: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(null), 2000);
    }
  };

  function getStatusBadgeStyle(status: string) {
    switch (status) {
      case "Accepted":
        return { borderColor: "rgba(16, 185, 129, 0.4)", color: "#10b981", backgroundColor: "rgba(16, 185, 129, 0.1)" };
      case "Sent":
        return { borderColor: "rgba(56, 189, 248, 0.4)", color: "#38bdf8", backgroundColor: "rgba(56, 189, 248, 0.1)" };
      case "Delivery failed":
        return { borderColor: "rgba(239, 68, 68, 0.4)", color: "#ef4444", backgroundColor: "rgba(239, 68, 68, 0.1)" };
      case "Queued for Brevo delivery":
        return { borderColor: "rgba(245, 158, 11, 0.4)", color: "#f59e0b", backgroundColor: "rgba(245, 158, 11, 0.1)" };
      case "Revoked":
      case "Expired":
      default:
        return { borderColor: "rgba(148, 163, 184, 0.3)", color: "#94a3b8", backgroundColor: "rgba(148, 163, 184, 0.08)" };
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <PageHeader
        title="Customer Invitations & Delivery Status"
        description="Secure single-use invitations with live Brevo transactional email delivery tracking."
      />

      {/* Global Alerts */}
      <MotionAlert isVisible={Boolean(errorState)} type="error">
        {errorState && (
          <div style={{ marginBottom: "16px" }}>
            <SanitizedAlert error={errorState} onDismiss={() => setErrorState(null)} />
          </div>
        )}
      </MotionAlert>

      <MotionAlert isVisible={Boolean(successMessage)} type="success">
        {successMessage && (
          <div
            style={{
              marginBottom: "16px",
              padding: "12px 18px",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              backgroundColor: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.35)",
              color: "#34d399",
              fontSize: "13.5px",
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={18} />
            <span>{successMessage}</span>
          </div>
        )}
      </MotionAlert>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: "24px",
          alignItems: "start",
        }}
      >
        {/* Panel 1: Dispatch Invitation */}
        <SpotlightCard
          spotlightColor="rgba(56, 189, 248, 0.14)"
          style={{ padding: "28px" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                backgroundColor: "rgba(56, 189, 248, 0.15)",
                color: "#38bdf8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Send size={18} />
            </div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0, color: "#f8fafc" }}>
              Send a customer invitation
            </h2>
          </div>

          <p style={{ margin: "0 0 20px 0", color: "#94a3b8", fontSize: "13.5px", lineHeight: 1.6 }}>
            The recipient must register with the exact invited email, verify via 6-digit code, and accept. Invitations expire after 7 days.
          </p>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label htmlFor="customerEmailInput" style={{ fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1" }}>
                Customer Email Address
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
                  id="customerEmailInput"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="customer@example.com"
                  required
                  style={{
                    width: "100%",
                    padding: "12px 14px 12px 42px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    backgroundColor: "rgba(15, 23, 42, 0.7)",
                    color: "#f8fafc",
                    fontSize: "14px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                Only this exact email address can accept the invitation token.
              </span>
            </div>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              disabled={busy === "new"}
              style={{
                marginTop: "6px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "12px 20px",
                borderRadius: "10px",
                border: "none",
                backgroundColor: "#0284c7",
                color: "#ffffff",
                fontWeight: 750,
                fontSize: "14px",
                cursor: busy === "new" ? "not-allowed" : "pointer",
                opacity: busy === "new" ? 0.7 : 1,
                boxShadow: "0 4px 14px rgba(2, 132, 199, 0.25)",
              }}
            >
              <Send size={15} />
              <span>{busy === "new" ? "Queueing for Brevo…" : "Send Secure Invitation"}</span>
            </motion.button>
          </form>
        </SpotlightCard>

        {/* Panel 2: Live Delivery Ledger */}
        <SpotlightCard
          spotlightColor="rgba(52, 211, 153, 0.12)"
          style={{ padding: "28px" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(52, 211, 153, 0.15)",
                  color: "#34d399",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ShieldCheck size={18} />
              </div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0, color: "#f8fafc" }}>
                Invitation history & delivery
              </h2>
            </div>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={load}
              disabled={refreshing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                color: "#cbd5e1",
                fontSize: "12px",
                fontWeight: 700,
                cursor: refreshing ? "not-allowed" : "pointer",
              }}
            >
              <span>{refreshing ? "Refreshing…" : "Refresh status"}</span>
            </motion.button>
          </div>

          <p style={{ margin: "0 0 20px 0", color: "#94a3b8", fontSize: "13.5px", lineHeight: 1.6 }}>
            Review live Brevo delivery state, message IDs, failure diagnostics, or issue fresh replacement links.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {invitations.length === 0 ? (
              <div style={{ padding: "36px 16px", textAlign: "center", color: "#64748b" }}>
                <Clock size={28} style={{ margin: "0 auto 8px", color: "#475569" }} />
                <p style={{ margin: 0, fontSize: "13px" }}>No customer invitations have been issued yet.</p>
              </div>
            ) : (
              <>
                <AnimatedGroup stagger={0.04} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {(showAllInvitations ? invitations : invitations.slice(0, 8)).map((invitation) => {
                    const canRevoke = invitation.status === "PENDING" && new Date(invitation.expiresAt) > new Date();
                    const canResend = invitation.status !== "ACCEPTED";
                    const isCopied = copiedEmail === invitation.email;

                    return (
                      <motion.div
                        key={invitation.id}
                        whileHover={{ x: 2 }}
                        style={{
                          padding: "16px",
                          borderRadius: "10px",
                          backgroundColor: "rgba(255, 255, 255, 0.02)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                              <span
                                style={{
                                  ...getStatusBadgeStyle(invitation.displayStatus),
                                  borderWidth: "1px",
                                  borderStyle: "solid",
                                  borderRadius: "12px",
                                  padding: "2px 8px",
                                  fontSize: "11px",
                                  fontWeight: 800,
                                  textTransform: "uppercase",
                                }}
                              >
                                {invitation.displayStatus}
                              </span>
                              {invitation.brevoMessageId && (
                                <span style={{ fontSize: "11px", fontFamily: "monospace", color: "#7dd3fc" }}>
                                  Brevo ID: {invitation.brevoMessageId}
                                </span>
                              )}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <strong style={{ fontSize: "14.5px", color: "#f8fafc" }}>{invitation.email}</strong>
                              <button
                                type="button"
                                onClick={() => handleCopyEmail(invitation.email)}
                                title="Copy customer email"
                                style={{
                                  background: "none",
                                  border: "1px solid rgba(255, 255, 255, 0.12)",
                                  borderRadius: "4px",
                                  color: isCopied ? "#34d399" : "#94a3b8",
                                  fontSize: "11px",
                                  padding: "2px 6px",
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                {isCopied ? <Check size={11} /> : null}
                                <span>{isCopied ? "Copied" : "Copy"}</span>
                              </button>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            {canRevoke && (
                              <motion.button
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                                disabled={busy === invitation.id + "revoke"}
                                onClick={() => act(invitation, "revoke")}
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: "6px",
                                  border: "1px solid rgba(239, 68, 68, 0.35)",
                                  backgroundColor: "rgba(239, 68, 68, 0.12)",
                                  color: "#f87171",
                                  fontSize: "12px",
                                  fontWeight: 700,
                                  cursor: busy === invitation.id + "revoke" ? "not-allowed" : "pointer",
                                }}
                              >
                                {busy === invitation.id + "revoke" ? "Revoking…" : "Revoke"}
                              </motion.button>
                            )}
                            {canResend && (
                              <motion.button
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                                disabled={busy === invitation.id + "resend"}
                                onClick={() => act(invitation, "resend")}
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: "6px",
                                  border: "1px solid rgba(56, 189, 248, 0.35)",
                                  backgroundColor: "rgba(56, 189, 248, 0.12)",
                                  color: "#38bdf8",
                                  fontSize: "12px",
                                  fontWeight: 700,
                                  cursor: busy === invitation.id + "resend" ? "not-allowed" : "pointer",
                                }}
                              >
                                {busy === invitation.id + "resend" ? "Reissuing…" : "Resend"}
                              </motion.button>
                            )}
                          </div>
                        </div>

                        {/* Metadata & Diagnostics */}
                        <div style={{ display: "grid", gap: "3px", fontSize: "12px", color: "#94a3b8" }}>
                          {invitation.sentAt && (
                            <span style={{ color: "#38bdf8" }}>
                              Sent {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(invitation.sentAt))}
                            </span>
                          )}
                          <span>
                            Expires {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(invitation.expiresAt))}
                          </span>
                          {invitation.outboxStatus && (
                            <span style={{ color: "#64748b" }}>
                              Outbox: {invitation.outboxStatus} · Notification: {invitation.notificationStatus || "pending"}
                            </span>
                          )}
                          {invitation.deliveryError && (
                            <div
                              style={{
                                marginTop: "6px",
                                padding: "8px 12px",
                                backgroundColor: "rgba(239, 68, 68, 0.15)",
                                border: "1px solid rgba(239, 68, 68, 0.3)",
                                borderRadius: "6px",
                                color: "#fca5a5",
                                fontSize: "12px",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <AlertCircle size={14} color="#ef4444" />
                              <span>Delivery error: {invitation.deliveryError}</span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatedGroup>

                {invitations.length > 8 && (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowAllInvitations(!showAllInvitations)}
                    style={{
                      alignSelf: "center",
                      marginTop: "12px",
                      padding: "8px 18px",
                      backgroundColor: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      borderRadius: "8px",
                      color: "#38bdf8",
                      fontSize: "12.5px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "block",
                      marginInline: "auto",
                    }}
                  >
                    {showAllInvitations
                      ? "Show fewer invitations"
                      : `Showing 8 of ${invitations.length} invitations · See all`}
                  </motion.button>
                )}
              </>
            )}
          </div>
        </SpotlightCard>
      </div>
    </div>
  );
}

