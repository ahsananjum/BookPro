"use client";

import React, { useState, useEffect, useMemo } from "react";
import { apiFetch } from "../lib/api-client";
import {
  detectSystemTimezone,
  compareSystemAndOrgTimezones,
  formatInTimezone,
} from "../lib/timezone-utils";
import {
  syncServerTime,
  getServerNow,
  isDeviceClockManipulated,
  getClockSkewDescription,
} from "../lib/time-sync";
import { GlassCard, GlassBadge } from "./glass-card";
import { ClockSpinner } from "./animated-svgs";
import {
  AlertTriangle,
  Clock,
  Calendar,
  XCircle,
  Shield,
  Info,
  CheckCircle2,
} from "./icons";

export interface CustomerAppointmentForCancel {
  id: string;
  startAt: string;
  endAt: string;
  priceCents: number;
  currency: string;
  service?: { name: string; durationMin?: number };
  staff?: { displayName: string };
  location?: { name: string; timezone?: string };
}

export interface CancellationQuoteData {
  quoteId?: string;
  quoteVersion: string;
  appointmentId: string;
  isAllowed: boolean;
  feeCents: number;
  cancellationFeeCents?: number;
  refundableCents: number;
  refundableAmountCents?: number;
  capturedBalanceCents?: number;
  currency?: string;
  reason: string;
  expiresAt: string;
  organizationTimezone?: string;
  locationTimezone?: string;
  serverTime?: string;
  startAt?: string;
  cancelCutoffHours?: number;
  minNoticeHours?: number;
  cancelFeeType?: string;
  cancelFeeValue?: number;
}

interface CustomerCancellationModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: CustomerAppointmentForCancel | null;
  tenantSlug: string;
  organizationTimezone?: string;
  onCancelled: () => void;
}

function formatMoney(cents: number = 0, currency: string = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "USD").toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(currency || "USD").toUpperCase()} ${(cents / 100).toFixed(2)}`;
  }
}

const COMMON_REASONS = [
  "Schedule conflict",
  "Illness / Personal emergency",
  "Booked wrong time or service",
  "Change of plans",
  "Financial reasons",
  "Other reason",
];

export function CustomerCancellationModal({
  isOpen,
  onClose,
  appointment,
  tenantSlug,
  organizationTimezone: initialOrgTz = "UTC",
  onCancelled,
}: CustomerCancellationModalProps) {
  const [quote, setQuote] = useState<CancellationQuoteData | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState(COMMON_REASONS[0]);
  const [customNotes, setCustomNotes] = useState("");

  const systemTimezone = useMemo(() => detectSystemTimezone(), []);
  const effectiveOrgTz = quote?.organizationTimezone || initialOrgTz || "UTC";

  // Authoritative quote fetch on open
  useEffect(() => {
    if (!isOpen || !appointment) {
      setQuote(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    apiFetch<CancellationQuoteData>(
      `/policies/cancellation-quote?appointmentId=${encodeURIComponent(appointment.id)}`,
      {
        headers: { "x-tenant-slug": tenantSlug },
      }
    )
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          setQuote(res.data);
          if (res.data.serverTime) {
            syncServerTime(res.data.serverTime);
          }
        } else {
          setError(
            res.error?.message ||
              "Could not calculate cancellation policy quote. Please refresh or contact support."
          );
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || "Network error loading cancellation policy quote.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, appointment, tenantSlug]);

  // Real-time timezone comparison using authoritative server time baseline
  const tzComparison = useMemo(() => {
    const baseDate = quote?.serverTime ? getServerNow() : new Date();
    return compareSystemAndOrgTimezones(effectiveOrgTz, baseDate);
  }, [effectiveOrgTz, quote?.serverTime]);

  const clockSkewWarning = useMemo(() => {
    if (quote?.serverTime && isDeviceClockManipulated()) {
      return getClockSkewDescription();
    }
    return null;
  }, [quote?.serverTime]);

  const apptDateSystem = useMemo(() => {
    if (!appointment?.startAt) return "";
    return formatInTimezone(appointment.startAt, systemTimezone, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }, [appointment?.startAt, systemTimezone]);

  const apptDateOrg = useMemo(() => {
    if (!appointment?.startAt) return "";
    return formatInTimezone(appointment.startAt, effectiveOrgTz, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }, [appointment?.startAt, effectiveOrgTz]);

  if (!isOpen || !appointment) return null;

  const handleConfirm = async () => {
    setCancelling(true);
    setError(null);

    const fullReason = customNotes.trim()
      ? `${selectedReason}: ${customNotes.trim()}`
      : selectedReason;

    try {
      const res = await apiFetch(`/appointments/${appointment.id}/cancel`, {
        method: "POST",
        headers: { "x-tenant-slug": tenantSlug },
        body: JSON.stringify({
          reason: fullReason,
          quoteVersion: quote?.quoteVersion,
        }),
      });

      if (res.success) {
        onCancelled();
        onClose();
      } else {
        setError(res.error?.message || "Failed to cancel appointment. Please try again.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during cancellation.");
    } finally {
      setCancelling(false);
    }
  };

  const currency = quote?.currency || appointment.currency || "USD";
  const feeCents = quote?.feeCents ?? quote?.cancellationFeeCents ?? 0;
  const refundableCents =
    quote?.refundableAmountCents ?? quote?.refundableCents ?? 0;
  const capturedCents =
    quote?.capturedBalanceCents ?? appointment.priceCents ?? 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        backgroundColor: "rgba(2, 6, 23, 0.82)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !cancelling) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "600px",
          maxHeight: "92vh",
          overflowY: "auto",
          backgroundColor: "#0b1329",
          borderRadius: "16px",
          border: "1px solid rgba(56, 189, 248, 0.2)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
          color: "#f8fafc",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px 28px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#fca5a5",
                  fontSize: "11px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                <AlertTriangle size={12} />
                <span>Cancellation Policy Warning</span>
              </span>
            </div>
            <h2
              style={{
                fontSize: "20px",
                fontWeight: 800,
                color: "#f8fafc",
                margin: "0 0 4px 0",
                letterSpacing: "-0.02em",
              }}
            >
              Cancel Appointment
            </h2>
            <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8" }}>
              {appointment.service?.name || "Service Session"} · Ref:{" "}
              <code style={{ color: "#38bdf8", fontFamily: "monospace" }}>
                {appointment.id.slice(0, 8)}
              </code>
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={cancelling}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              color: "#94a3b8",
              cursor: cancelling ? "not-allowed" : "pointer",
              padding: "6px 10px",
              fontSize: "14px",
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: "24px 28px", display: "grid", gap: "20px" }}>
          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "10px",
                backgroundColor: "rgba(244, 63, 94, 0.12)",
                border: "1px solid rgba(244, 63, 94, 0.35)",
                color: "#fca5a5",
                fontSize: "13px",
                fontWeight: 600,
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
              }}
            >
              <XCircle size={18} color="#f43f5e" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>{error}</div>
            </div>
          )}

          {/* Clock Tampering / Discrepancy Defense Warning */}
          {clockSkewWarning && (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "12px",
                backgroundColor: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.35)",
                display: "grid",
                gap: "6px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertTriangle size={18} color="#f87171" />
                <span style={{ fontSize: "13px", fontWeight: 800, color: "#fca5a5" }}>
                  Device Clock Desynchronized ({clockSkewWarning})
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "12px", color: "#cbd5e1", lineHeight: 1.5 }}>
                Your device hardware clock differs from the official network time.
                To protect business operations and maintain financial integrity, all cancellation cutoff windows, fees,
                and refund settlements are strictly governed by <strong>Authoritative Server Time</strong>.
                Altering your device clock does not change policy rules or penalty outcomes.
              </p>
            </div>
          )}

          {/* Timezone Comparison & Discrepancy Warning */}
          <div
            style={{
              padding: "16px 18px",
              borderRadius: "12px",
              backgroundColor: tzComparison.isDifferent
                ? "rgba(245, 158, 11, 0.08)"
                : "rgba(56, 189, 248, 0.06)",
              border: tzComparison.isDifferent
                ? "1px solid rgba(245, 158, 11, 0.35)"
                : "1px solid rgba(56, 189, 248, 0.2)",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Clock size={16} color={tzComparison.isDifferent ? "#f59e0b" : "#38bdf8"} />
                <strong
                  style={{
                    fontSize: "13px",
                    fontWeight: 800,
                    color: tzComparison.isDifferent ? "#fbbf24" : "#38bdf8",
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                  }}
                >
                  {tzComparison.isDifferent
                    ? "Timezone Discrepancy Detected"
                    : "Timezone Synchronization"}
                </strong>
              </div>

              <span
                style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "9999px",
                  fontWeight: 700,
                  backgroundColor: tzComparison.isDifferent
                    ? "rgba(245, 158, 11, 0.2)"
                    : "rgba(52, 211, 153, 0.15)",
                  color: tzComparison.isDifferent ? "#fde68a" : "#6ee7b7",
                }}
              >
                {tzComparison.isDifferent ? "Time Offset Active" : "Times Match"}
              </span>
            </div>

            {/* Current Clock Readings */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "10px",
                fontSize: "12.5px",
              }}
            >
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(0, 0, 0, 0.25)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                <div style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 700, marginBottom: "2px", display: "flex", justifyContent: "space-between" }}>
                  <span>YOUR DEVICE (SYSTEM TIME)</span>
                  {clockSkewWarning && (
                    <span style={{ color: "#f87171", fontSize: "10px" }}>⚠️ Desynchronized</span>
                  )}
                </div>
                <div style={{ fontWeight: 800, color: "#f8fafc" }}>
                  {tzComparison.systemTimeFormatted}
                </div>
                <div style={{ fontSize: "11px", color: "#38bdf8", fontFamily: "monospace" }}>
                  {tzComparison.systemTimezone}
                </div>
              </div>

              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(0, 0, 0, 0.25)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                <div style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 700, marginBottom: "2px", display: "flex", justifyContent: "space-between" }}>
                  <span>BUSINESS (ORGANIZATION TIME)</span>
                  <span style={{ color: "#34d399", fontSize: "10px" }}>✓ Authoritative Server Time</span>
                </div>
                <div style={{ fontWeight: 800, color: "#f8fafc" }}>
                  {tzComparison.orgTimeFormatted}
                </div>
                <div style={{ fontSize: "11px", color: "#fbbf24", fontFamily: "monospace" }}>
                  {tzComparison.orgTimezone}
                </div>
              </div>
            </div>

            {/* Time Difference & Policy Warning */}
            <div
              style={{
                fontSize: "12.5px",
                color: tzComparison.isDifferent ? "#fef3c7" : "#cbd5e1",
                lineHeight: 1.5,
              }}
            >
              <strong>Time Difference: </strong>
              <span>{tzComparison.differenceDescription}</span>
              {tzComparison.isDifferent && (
                <div
                  style={{
                    marginTop: "6px",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(245, 158, 11, 0.15)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    fontSize: "12px",
                    color: "#fef3c7",
                  }}
                >
                  ⚠️ <strong>Notice:</strong> All organization cancellation cutoff deadlines (e.g.{" "}
                  {quote?.cancelCutoffHours ?? 24}h notice requirement) are strictly evaluated against{" "}
                  <strong>Organization Time ({tzComparison.orgTimezone})</strong>.
                </div>
              )}
            </div>

            {/* Appointment Time in both timezones */}
            <div
              style={{
                paddingTop: "8px",
                borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                fontSize: "12px",
                display: "grid",
                gap: "4px",
              }}
            >
              <div style={{ color: "#94a3b8" }}>
                <strong>Appointment Time (In Your Local Time):</strong>{" "}
                <span style={{ color: "#f8fafc" }}>{apptDateSystem}</span>
              </div>
              <div style={{ color: "#94a3b8" }}>
                <strong>Appointment Time (In Organization Time):</strong>{" "}
                <span style={{ color: "#f8fafc" }}>{apptDateOrg}</span>
              </div>
            </div>
          </div>

          {/* Policy Evaluation & Quote Breakdown */}
          {loading ? (
            <div
              style={{
                padding: "32px",
                textAlign: "center",
                display: "grid",
                placeItems: "center",
                gap: "10px",
                backgroundColor: "rgba(255, 255, 255, 0.02)",
                borderRadius: "12px",
                border: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              <ClockSpinner size={28} />
              <span style={{ fontSize: "13px", color: "#94a3b8" }}>
                Evaluating organization policy rules & calculating refund quote…
              </span>
            </div>
          ) : quote ? (
            <div
              style={{
                padding: "18px",
                borderRadius: "12px",
                backgroundColor: "rgba(15, 23, 42, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                display: "grid",
                gap: "14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Shield size={16} color="#38bdf8" />
                  <span style={{ fontSize: "13px", fontWeight: 800, color: "#f8fafc" }}>
                    Policy Terms & Financial Settlement
                  </span>
                </div>
                <span
                  style={{
                    padding: "3px 8px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 800,
                    backgroundColor: quote.isAllowed
                      ? quote.feeCents > 0
                        ? "rgba(245, 158, 11, 0.2)"
                        : "rgba(16, 185, 129, 0.2)"
                      : "rgba(239, 68, 68, 0.2)",
                    color: quote.isAllowed
                      ? quote.feeCents > 0
                        ? "#fbbf24"
                        : "#34d399"
                      : "#f87171",
                  }}
                >
                  {quote.isAllowed
                    ? quote.feeCents > 0
                      ? "Late Cancellation Fee Applies"
                      : "Eligible For Full Refund"
                    : "Cutoff Window Passed"}
                </span>
              </div>

              {/* Policy Reason string from backend */}
              <div
                style={{
                  fontSize: "12.5px",
                  color: "#cbd5e1",
                  backgroundColor: "rgba(0, 0, 0, 0.3)",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  borderLeft: "3px solid #38bdf8",
                }}
              >
                {quote.reason}
              </div>

              {/* Financial Breakdown Table */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "10px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    padding: "10px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700 }}>PAID AMOUNT</div>
                  <div style={{ fontSize: "15px", fontWeight: 800, color: "#f8fafc", marginTop: "2px" }}>
                    {formatMoney(capturedCents, currency)}
                  </div>
                </div>

                <div
                  style={{
                    padding: "10px",
                    borderRadius: "8px",
                    backgroundColor:
                      feeCents > 0 ? "rgba(239, 68, 68, 0.1)" : "rgba(255, 255, 255, 0.04)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      color: feeCents > 0 ? "#fca5a5" : "#94a3b8",
                      fontWeight: 700,
                    }}
                  >
                    CANCELLATION FEE
                  </div>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 800,
                      color: feeCents > 0 ? "#f87171" : "#cbd5e1",
                      marginTop: "2px",
                    }}
                  >
                    {formatMoney(feeCents, currency)}
                  </div>
                </div>

                <div
                  style={{
                    padding: "10px",
                    borderRadius: "8px",
                    backgroundColor:
                      refundableCents > 0
                        ? "rgba(16, 185, 129, 0.1)"
                        : "rgba(255, 255, 255, 0.04)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      color: refundableCents > 0 ? "#6ee7b7" : "#94a3b8",
                      fontWeight: 700,
                    }}
                  >
                    ESTIMATED REFUND
                  </div>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 800,
                      color: refundableCents > 0 ? "#34d399" : "#94a3b8",
                      marginTop: "2px",
                    }}
                  >
                    {formatMoney(refundableCents, currency)}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Reason for Cancellation Input */}
          <div style={{ display: "grid", gap: "8px" }}>
            <label style={{ fontSize: "12.5px", fontWeight: 750, color: "#e2e8f0" }}>
              Reason for Cancellation <span style={{ color: "#f43f5e" }}>*</span>
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              disabled={cancelling}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "8px",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#f8fafc",
                fontSize: "13.5px",
                outline: "none",
              }}
            >
              {COMMON_REASONS.map((r) => (
                <option key={r} value={r} style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>
                  {r}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Additional details or notes (optional)"
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              disabled={cancelling}
              maxLength={250}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 14px",
                borderRadius: "8px",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#f8fafc",
                fontSize: "13px",
                outline: "none",
                marginTop: "4px",
              }}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "18px 28px 24px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
          }}
        >
          <button
            onClick={onClose}
            disabled={cancelling}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#cbd5e1",
              fontSize: "13.5px",
              fontWeight: 700,
              cursor: cancelling ? "not-allowed" : "pointer",
            }}
          >
            Nevermind, Keep Appointment
          </button>

          <button
            onClick={handleConfirm}
            disabled={cancelling || loading}
            style={{
              padding: "10px 22px",
              borderRadius: "8px",
              backgroundColor: "#e11d48",
              border: "1px solid #f43f5e",
              color: "#ffffff",
              fontSize: "13.5px",
              fontWeight: 800,
              cursor: cancelling || loading ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 4px 14px rgba(225, 29, 72, 0.4)",
            }}
          >
            {cancelling ? (
              <>
                <ClockSpinner size={16} />
                <span>Cancelling…</span>
              </>
            ) : (
              <>
                <XCircle size={16} />
                <span>Confirm & Cancel Appointment</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
