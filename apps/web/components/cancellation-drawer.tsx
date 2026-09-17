"use client";

import React, { useState, useEffect, useMemo } from "react";
import { compareSystemAndOrgTimezones, formatInTimezone } from "../lib/timezone-utils";
import { apiFetch } from "../lib/api-client";

interface CancellationQuote {
  appointmentId: string;
  isAllowed: boolean;
  feeCents: number;
  refundableCents: number;
  capturedBalanceCents?: number;
  currency?: string;
  reason?: string;
  policyProvenance?: string;
  quoteVersion: string;
  expiresAt: string;
  organizationTimezone?: string;
  startAt?: string;
  cancelCutoffHours?: number;
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

interface CancellationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentId: string;
  organizationId: string;
  onCancelled: () => void;
}

export function CancellationDrawer({
  isOpen,
  onClose,
  appointmentId,
  organizationId,
  onCancelled,
}: CancellationDrawerProps) {
  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tzComparison = useMemo(() => {
    return compareSystemAndOrgTimezones(quote?.organizationTimezone || "UTC");
  }, [quote?.organizationTimezone]);

  useEffect(() => {
    if (isOpen && appointmentId && organizationId) {
      fetchCancellationQuote();
    }
  }, [isOpen, appointmentId, organizationId]);

  const fetchCancellationQuote = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<CancellationQuote>(
        `/policies/cancellation-quote?organizationId=${encodeURIComponent(organizationId)}&appointmentId=${encodeURIComponent(appointmentId)}`,
        {},
        organizationId
      );
      if (res.success && res.data) {
        setQuote(res.data);
      } else {
        setError(res.error?.message || "Failed to calculate authoritative cancellation quote.");
      }
    } catch {
      setError("Network error connecting to policy engine.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCancellation = async () => {
    if (!quote) return;
    setCancelling(true);
    try {
      const res = await apiFetch(
        `/appointments/${appointmentId}/cancel`,
        {
          method: "POST",
          body: JSON.stringify({
            organizationId,
            reason: "Cancelled via Operations Schedule & Visual Calendar",
            quoteVersion: quote.quoteVersion,
          }),
        },
        organizationId
      );
      if (res.success) {
        onCancelled();
        onClose();
      } else {
        setError(res.error?.message || "Failed to complete cancellation.");
      }
    } catch {
      setError("Network error executing cancellation.");
    } finally {
      setCancelling(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "440px",
        backgroundColor: "#0f172a",
        color: "#f8fafc",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.6)",
        zIndex: 1000,
        padding: "32px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        borderLeft: "1px solid #1e293b",
      }}
    >
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px" }}>
          <div>
            <span style={{ backgroundColor: "#881337", color: "#fda4af", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700" }}>
              POLICY ENFORCEMENT
            </span>
            <h2 style={{ fontSize: "20px", fontWeight: "800", margin: "6px 0 0 0", color: "#f8fafc" }}>Cancel Booking</h2>
          </div>
          <button
            onClick={onClose}
            style={{ backgroundColor: "#1e293b", border: "none", color: "#94a3b8", fontSize: "18px", width: "32px", height: "32px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>
            Evaluating cancellation hierarchy & fee penalties...
          </div>
        ) : error ? (
          <div style={{ color: "#f87171", backgroundColor: "#450a0a", padding: "14px", borderRadius: "8px", border: "1px solid #7f1d1d", fontSize: "13px" }}>
            {error}
          </div>
        ) : quote ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Timezone Comparison & Discrepancy Notice */}
            <div
              style={{
                backgroundColor: tzComparison.isDifferent ? "rgba(245, 158, 11, 0.1)" : "rgba(56, 189, 248, 0.08)",
                border: tzComparison.isDifferent ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid rgba(56, 189, 248, 0.25)",
                borderRadius: "10px",
                padding: "14px 16px",
                fontSize: "12px",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: "800", color: tzComparison.isDifferent ? "#fbbf24" : "#38bdf8", textTransform: "uppercase" }}>
                  {tzComparison.isDifferent ? "Timezone Discrepancy" : "Timezone Match"}
                </span>
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                  System: {tzComparison.systemTimezone}
                </span>
              </div>
              <div style={{ color: "#e2e8f0", lineHeight: 1.4 }}>
                {tzComparison.differenceDescription}
              </div>
              {tzComparison.isDifferent && (
                <div style={{ fontSize: "11px", color: "#fef3c7" }}>
                  ⚠️ Cutoff window ({quote.cancelCutoffHours ?? 24}h) strictly enforces Business Time ({tzComparison.orgTimezone}).
                </div>
              )}
            </div>

            <div style={{ backgroundColor: "#1e293b", padding: "18px", borderRadius: "10px", border: "1px solid #334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: "600", textTransform: "uppercase" }}>Policy Rule Status</span>
                <span style={{ backgroundColor: quote.isAllowed ? "#065f46" : "#7f1d1d", color: quote.isAllowed ? "#34d399" : "#fca5a5", fontSize: "11px", padding: "2px 8px", borderRadius: "4px", fontWeight: "700" }}>
                  {quote.isAllowed ? "Permitted" : "Cutoff Passed"}
                </span>
              </div>
              <div style={{ fontWeight: "700", fontSize: "15px", marginTop: "8px", color: "#f8fafc" }}>
                {quote.isAllowed ? "Eligible for standard cancellation" : "Late cancellation policy applies"}
              </div>
              {quote.policyProvenance && (
                <div style={{ fontSize: "12px", color: "#38bdf8", marginTop: "4px" }}>
                  Rule Source: {quote.policyProvenance} Policy Level
                </div>
              )}
            </div>

            <div style={{ backgroundColor: "#1e293b", padding: "18px", borderRadius: "10px", border: "1px solid #334155" }}>
              {quote.capturedBalanceCents !== undefined && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", fontSize: "14px" }}>
                  <span style={{ color: "#94a3b8" }}>Paid / Captured Amount:</span>
                  <span style={{ fontWeight: "700", color: "#f8fafc" }}>{formatMoney(quote.capturedBalanceCents, quote.currency)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", fontSize: "14px" }}>
                <span style={{ color: "#94a3b8" }}>Cancellation Penalty Fee:</span>
                <span style={{ fontWeight: "700", color: "#f43f5e" }}>{formatMoney(quote.feeCents, quote.currency)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "15px", paddingTop: "10px", borderTop: "1px solid #334155" }}>
                <span style={{ color: "#f8fafc", fontWeight: "600" }}>Refundable to Client:</span>
                <span style={{ fontWeight: "800", color: "#4ade80" }}>{formatMoney(quote.refundableCents, quote.currency)}</span>
              </div>
            </div>

            {/* 100% Studio Refund Guarantee Banner */}
            <div
              style={{
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "10px",
                padding: "12px 14px",
                fontSize: "12px",
                color: "#6ee7b7",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>🛡️</span>
              <span><strong>100% Studio Refund Guarantee:</strong> Customer will receive a full Stripe refund with $0 deduction when cancelled by the studio.</span>
            </div>

            <div style={{ backgroundColor: "#0b1120", padding: "12px 16px", borderRadius: "8px", fontSize: "11px", color: "#64748b" }}>
              🔒 Cryptographic Quote Version: <code style={{ color: "#94a3b8" }}>{quote.quoteVersion}</code>
              <br />
              Valid until: {new Date(quote.expiresAt).toLocaleTimeString()}
            </div>
          </div>
        ) : null}
      </div>

      {(() => {
        const hoursUntilStart = quote?.startAt ? (new Date(quote.startAt).getTime() - Date.now()) / (1000 * 60 * 60) : null;
        const isUnder3Hours = hoursUntilStart !== null && hoursUntilStart < 3;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "24px" }}>
            {isUnder3Hours && (
              <div style={{ padding: "8px 12px", borderRadius: "6px", backgroundColor: "rgba(225, 29, 72, 0.15)", border: "1px solid rgba(225, 29, 72, 0.35)", color: "#fda4af", fontSize: "12px", fontWeight: 700 }}>
                ⚠️ Cancellation locked: less than 3 hours remaining before scheduled slot time.
              </div>
            )}
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: "14px",
                  borderRadius: "8px",
                  backgroundColor: "#1e293b",
                  color: "#f8fafc",
                  border: "1px solid #334155",
                  fontWeight: "700",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Keep Booking
              </button>
              <button
                onClick={handleConfirmCancellation}
                disabled={cancelling || isUnder3Hours || (quote ? !quote.isAllowed : false)}
                style={{
                  flex: 1,
                  padding: "14px",
                  borderRadius: "8px",
                  backgroundColor: !isUnder3Hours && quote?.isAllowed ? "#e11d48" : "#475569",
                  color: "#fff",
                  border: "none",
                  fontWeight: "700",
                  fontSize: "14px",
                  cursor: !isUnder3Hours && quote?.isAllowed ? "pointer" : "not-allowed",
                }}
              >
                {cancelling ? "Cancelling..." : isUnder3Hours ? "Locked (< 3h)" : "Confirm Cancel"}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
