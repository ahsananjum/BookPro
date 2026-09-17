/* Hallmark · macrostructure: Workbench · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 * Authoritative Multi-Currency Analytics, Live SVG Visualizations, PostgreSQL Read Models, Realtime SSE Sync
 */
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp,
  DollarSign,
  Users,
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Percent,
  Sparkles,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  ShieldCheck,
  Building2,
  Clock3,
} from "lucide-react";
import { PageHeader } from "../../components/shell/app-shell";
import { GlassCard, GlassBadge } from "../../components/glass-card";
import { useAuth } from "../../lib/auth-context";
import { useRealtimeEvents } from "../../lib/use-realtime-events";
import { formatCurrency, getCurrencySymbol } from "../../lib/currency-utils";
import { DashboardOverviewDto } from "@bookpro/contracts";
import { motion, AnimatePresence } from "framer-motion";
import {
  SpotlightCard,
  AnimatedGroup,
  MotionAlert,
  CollapsibleDisclosure,
} from "../../components/motion-primitives";
import {
  RevenueTrendSvgChart,
  StatusDonutSvgChart,
  BookingVolumeSvgChart,
  CapacityGaugeSvgChart,
  PerformanceDistributionBars,
} from "../../components/analytics-charts";

const TIMEFRAMES = [
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "90d", label: "90 Days" },
  { id: "12m", label: "12 Months" },
];

const CURRENCIES = [
  { code: "PKR", label: "PKR (Rs)", symbol: "Rs" },
  { code: "USD", label: "USD ($)", symbol: "$" },
  { code: "EUR", label: "EUR (€)", symbol: "€" },
  { code: "GBP", label: "GBP (£)", symbol: "£" },
  { code: "CAD", label: "CAD (CA$)", symbol: "CA$" },
  { code: "AUD", label: "AUD (A$)", symbol: "A$" },
  { code: "AED", label: "AED", symbol: "AED" },
  { code: "SAR", label: "SAR", symbol: "SAR" },
  { code: "INR", label: "INR (₹)", symbol: "₹" },
];

export default function AnalyticsDashboardPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId || "";

  // Filter state
  const [timeframe, setTimeframe] = useState<"7d" | "30d" | "90d" | "12m">("30d");
  const [currency, setCurrency] = useState<string>(user?.currency || "USD");

  // Data state
  const [data, setData] = useState<DashboardOverviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Sync default currency when user session loads
  useEffect(() => {
    if (user?.currency && currency === "USD" && user.currency !== "USD") {
      setCurrency(user.currency);
    }
  }, [user?.currency]);

  // Compute ISO dates for selected timeframe
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    if (timeframe === "7d") start.setDate(start.getDate() - 6);
    else if (timeframe === "30d") start.setDate(start.getDate() - 29);
    else if (timeframe === "90d") start.setDate(start.getDate() - 89);
    else if (timeframe === "12m") start.setDate(start.getDate() - 364);
    else start.setDate(start.getDate() - 29);

    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }, [timeframe]);

  const fetchAnalytics = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${orgId}/analytics/overview?startDate=${startDate}&endDate=${endDate}&currency=${currency}`,
        {
          headers: {
            "x-organization-id": orgId,
          },
          credentials: "include",
        }
      );
      if (res.ok) {
        const json: DashboardOverviewDto = await res.json();
        setData(json);
      } else {
        const body = await res.json().catch(() => null);
        setData(null);
        setError(body?.error?.message || "Analytics data could not be retrieved.");
      }
    } catch {
      setData(null);
      setError("Analytics service is temporarily unavailable. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [orgId, startDate, endDate, currency]);

  // Real-time SSE subscription: auto-refetch on financial or appointment events
  const { isConnected: isRealtimeLive } = useRealtimeEvents(orgId, {
    onEvent: (hint) => {
      if (
        hint.type.startsWith("appointment.") ||
        hint.type.startsWith("payment.") ||
        hint.type.startsWith("refund.") ||
        hint.type.startsWith("waitlist.")
      ) {
        fetchAnalytics();
      }
    },
  });

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleRebuild = async () => {
    if (!orgId) return;
    setRebuilding(true);
    setRebuildMsg("");
    try {
      const res = await fetch(`/api/v1/organizations/${orgId}/analytics/rebuild`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        credentials: "include",
        body: JSON.stringify({ metricFamily: "ALL", startDate, endDate }),
      });
      if (res.ok) {
        const resJson = await res.json();
        setRebuildMsg(`Rebuild complete: ${resJson.processedDaysCount || 0} daily read models updated.`);
        fetchAnalytics();
      } else {
        const body = await res.json().catch(() => null);
        setRebuildMsg(body?.error?.message || "Analytics rebuild could not be executed.");
      }
    } catch {
      setRebuildMsg("Analytics rebuild could not be executed.");
    } finally {
      setRebuilding(false);
      setTimeout(() => setRebuildMsg(""), 5000);
    }
  };

  const d = data;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#06090f",
        color: "#f8fafc",
        padding: "24px 28px 80px 28px",
        overflowX: "clip",
      }}
    >
      <div style={{ maxWidth: "1360px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "28px" }}>
        {/* Header with Hallmark workbench styling */}
        <PageHeader
          title="Financial & Operational Analytics"
          description="Authoritative PostgreSQL metrics • Live multi-currency conversion • Provider capacity telemetry"
          actions={
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
              {/* Real-time SSE Live Indicator */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: "9999px",
                  fontSize: "12px",
                  fontWeight: "700",
                  backgroundColor: isRealtimeLive ? "rgba(16, 185, 129, 0.12)" : "rgba(245, 158, 11, 0.12)",
                  border: `1px solid ${isRealtimeLive ? "rgba(16, 185, 129, 0.35)" : "rgba(245, 158, 11, 0.35)"}`,
                  color: isRealtimeLive ? "#34d399" : "#fbbf24",
                  backdropFilter: "blur(8px)",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: isRealtimeLive ? "#10b981" : "#f59e0b",
                    boxShadow: isRealtimeLive ? "0 0 8px rgba(16, 185, 129, 0.7)" : "none",
                  }}
                />
                <span>{isRealtimeLive ? "Live Sync Active" : "Connecting..."}</span>
              </div>

              {/* Currency Selector Pill */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  backgroundColor: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "10px",
                  padding: "2px 8px",
                }}
              >
                <DollarSign style={{ width: "14px", height: "14px", color: "#38bdf8", marginRight: "4px" }} />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{
                    backgroundColor: "transparent",
                    color: "#f8fafc",
                    border: "none",
                    outline: "none",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                    padding: "6px 4px",
                  }}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code} style={{ backgroundColor: "#0b111b", color: "#f8fafc" }}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Timeframe Selector Pill Group */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  backgroundColor: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "10px",
                  padding: "3px",
                  position: "relative",
                }}
              >
                {TIMEFRAMES.map((tf) => {
                  const isSelected = timeframe === tf.id;
                  return (
                    <button
                      key={tf.id}
                      onClick={() => setTimeframe(tf.id as any)}
                      style={{
                        position: "relative",
                        padding: "5px 12px",
                        borderRadius: "7px",
                        fontSize: "12px",
                        fontWeight: "700",
                        border: "none",
                        cursor: "pointer",
                        backgroundColor: "transparent",
                        color: isSelected ? "#38bdf8" : "#94a3b8",
                        transition: "color 150ms ease",
                      }}
                    >
                      {isSelected && (
                        <motion.div
                          layoutId="active-analytics-timeframe-indicator"
                          transition={{ type: "spring", stiffness: 450, damping: 35 }}
                          style={{
                            position: "absolute",
                            inset: 0,
                            backgroundColor: "rgba(56, 189, 248, 0.18)",
                            border: "1px solid rgba(56, 189, 248, 0.35)",
                            borderRadius: "7px",
                            boxShadow: "0 0 10px rgba(56, 189, 248, 0.25)",
                            zIndex: 0,
                          }}
                        />
                      )}
                      <span style={{ position: "relative", zIndex: 1 }}>{tf.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Rebuild Trigger Button */}
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleRebuild}
                disabled={rebuilding}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "10px",
                  fontSize: "12px",
                  fontWeight: "700",
                  backgroundColor: "rgba(99, 102, 241, 0.18)",
                  border: "1px solid rgba(129, 140, 248, 0.35)",
                  color: "#c7d2fe",
                  cursor: rebuilding ? "not-allowed" : "pointer",
                  opacity: rebuilding ? 0.6 : 1,
                  transition: "all 150ms ease",
                }}
              >
                <RefreshCw
                  style={{
                    width: "14px",
                    height: "14px",
                    animation: rebuilding ? "spin 1s linear infinite" : "none",
                  }}
                />
                <span>{rebuilding ? "Rebuilding..." : "Rebuild Aggregates"}</span>
              </motion.button>
            </div>
          }
        />

        {/* Feedback Alert for Rebuild */}
        <MotionAlert isVisible={Boolean(rebuildMsg)} type="success">
          <div
            style={{
              padding: "12px 18px",
              backgroundColor: "rgba(5, 150, 105, 0.15)",
              border: "1px solid rgba(52, 211, 153, 0.35)",
              borderRadius: "12px",
              color: "#6ee7b7",
              fontSize: "13px",
              fontWeight: "600",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <CheckCircle style={{ width: "16px", height: "16px" }} />
            <span>{rebuildMsg}</span>
          </div>
        </MotionAlert>

        {/* Loading / Error States */}
        {loading && !data && (
          <GlassCard variant="panel" style={{ textAlign: "center", padding: "64px 20px" }}>
            <RefreshCw style={{ width: "32px", height: "32px", color: "#38bdf8", animation: "spin 1s linear infinite", margin: "0 auto 16px auto" }} />
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#f8fafc" }}>
              Loading authoritative financial & operational analytics...
            </div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
              Converting Stripe USD transactions to {currency} via live Forex rates.
            </div>
          </GlassCard>
        )}

        {error && !loading && (
          <GlassCard variant="panel" style={{ textAlign: "center", padding: "48px 20px", borderColor: "rgba(244, 63, 94, 0.4)" }}>
            <AlertTriangle style={{ width: "32px", height: "32px", color: "#f43f5e", margin: "0 auto 12px auto" }} />
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#f8fafc" }}>
              {error}
            </div>
            <button
              onClick={fetchAnalytics}
              style={{
                marginTop: "16px",
                padding: "8px 16px",
                borderRadius: "8px",
                backgroundColor: "#38bdf8",
                color: "#0f172a",
                fontWeight: "700",
                border: "none",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </GlassCard>
        )}

        {d && (
          <>
            {/* Primary KPI Metric Ribbon (4 Key Cards) */}
            <AnimatedGroup
              stagger={0.05}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "18px",
              }}
            >
              {/* 1. Total Booked Revenue */}
              <SpotlightCard spotlightColor="rgba(56, 189, 248, 0.14)" style={{ padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Gross Booked Revenue
                    </span>
                    <div style={{ fontSize: "32px", fontWeight: "900", color: "#f8fafc", marginTop: "6px", letterSpacing: "-0.02em" }}>
                      {formatCurrency(d.kpis.totalBookedRevenueCents, d.period.currency || currency)}
                    </div>
                  </div>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      backgroundColor: "rgba(56, 189, 248, 0.12)",
                      border: "1px solid rgba(56, 189, 248, 0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#38bdf8",
                    }}
                  >
                    <DollarSign style={{ width: "22px", height: "22px" }} />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "14px" }}>
                  {d.kpis.revenueGrowthPct != null ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "3px",
                        padding: "2px 8px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "800",
                        backgroundColor: d.kpis.revenueGrowthPct >= 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)",
                        border: `1px solid ${d.kpis.revenueGrowthPct >= 0 ? "rgba(52, 211, 153, 0.35)" : "rgba(251, 113, 133, 0.35)"}`,
                        color: d.kpis.revenueGrowthPct >= 0 ? "#34d399" : "#fb7185",
                      }}
                    >
                      {d.kpis.revenueGrowthPct >= 0 ? (
                        <ArrowUpRight style={{ width: "12px", height: "12px" }} />
                      ) : (
                        <ArrowDownRight style={{ width: "12px", height: "12px" }} />
                      )}
                      {d.kpis.revenueGrowthPct > 0 ? `+${d.kpis.revenueGrowthPct}%` : `${d.kpis.revenueGrowthPct}%`}
                    </span>
                  ) : (
                    <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>
                      Baseline period
                    </span>
                  )}
                  <span style={{ fontSize: "11px", color: "#94a3b8" }}>vs. prior {timeframe}</span>
                </div>

                <div
                  style={{
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                    marginTop: "16px",
                    paddingTop: "10px",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    color: "#94a3b8",
                  }}
                >
                  <span>Net Cash: <strong style={{ color: "#34d399" }}>{formatCurrency(d.kpis.netRevenueCents, d.period.currency || currency)}</strong></span>
                  <span>Refunds: <strong style={{ color: "#fb7185" }}>{formatCurrency(d.kpis.totalRefundedRevenueCents, d.period.currency || currency)}</strong></span>
                </div>
              </SpotlightCard>

              {/* 2. Stripe Collected Cash */}
              <SpotlightCard spotlightColor="rgba(168, 85, 247, 0.14)" style={{ padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Stripe Captured Cash
                    </span>
                    <div style={{ fontSize: "32px", fontWeight: "900", color: "#f8fafc", marginTop: "6px", letterSpacing: "-0.02em" }}>
                      {formatCurrency(d.kpis.totalCollectedRevenueCents, d.period.currency || currency)}
                    </div>
                  </div>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      backgroundColor: "rgba(168, 85, 247, 0.12)",
                      border: "1px solid rgba(168, 85, 247, 0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#c084fc",
                    }}
                  >
                    <CheckCircle style={{ width: "22px", height: "22px" }} />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "14px" }}>
                  <GlassBadge variant="purple" size="sm">
                    Stripe USD Forex converted
                  </GlassBadge>
                  <span style={{ fontSize: "11px", color: "#94a3b8" }}>Live bank rate</span>
                </div>

                <div
                  style={{
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                    marginTop: "16px",
                    paddingTop: "10px",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    color: "#94a3b8",
                  }}
                >
                  <span>Pending: <strong style={{ color: "#fbbf24" }}>{formatCurrency(d.kpis.pendingRevenueCents || 0, d.period.currency || currency)}</strong></span>
                  <span>Avg Value: <strong style={{ color: "#f8fafc" }}>{formatCurrency(d.kpis.averageBookingValueCents, d.period.currency || currency)}</strong></span>
                </div>
              </SpotlightCard>

              {/* 3. Schedule Capacity Utilization */}
              <SpotlightCard spotlightColor="rgba(52, 211, 153, 0.14)" style={{ padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Capacity Utilization
                    </span>
                    <div style={{ fontSize: "32px", fontWeight: "900", color: "#f8fafc", marginTop: "6px", letterSpacing: "-0.02em" }}>
                      {d.kpis.overallUtilizationRate}%
                    </div>
                  </div>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      backgroundColor: "rgba(16, 185, 129, 0.12)",
                      border: "1px solid rgba(16, 185, 129, 0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#34d399",
                    }}
                  >
                    <Activity style={{ width: "22px", height: "22px" }} />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "14px" }}>
                  <GlassBadge
                    variant={d.kpis.overallUtilizationRate >= 65 && d.kpis.overallUtilizationRate <= 85 ? "success" : "warning"}
                    size="sm"
                  >
                    {d.kpis.overallUtilizationRate >= 85 ? "High Demand" : d.kpis.overallUtilizationRate >= 65 ? "Optimal Zone" : "Available Capacity"}
                  </GlassBadge>
                  <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                    {d.capacityHours ? `${d.capacityHours.totalBookedHours}h / ${d.capacityHours.totalBookableHours}h` : "Shift ratio"}
                  </span>
                </div>

                <div
                  style={{
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                    marginTop: "16px",
                    paddingTop: "10px",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    color: "#94a3b8",
                  }}
                >
                  <span>Bookings: <strong style={{ color: "#f8fafc" }}>{d.kpis.totalBookings} appts</strong></span>
                  <span>Completed: <strong style={{ color: "#34d399" }}>{d.kpis.completedBookings}</strong></span>
                </div>
              </SpotlightCard>

              {/* 4. Customer Retention & Quality */}
              <SpotlightCard spotlightColor="rgba(245, 158, 11, 0.14)" style={{ padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Client Retention
                    </span>
                    <div style={{ fontSize: "32px", fontWeight: "900", color: "#f8fafc", marginTop: "6px", letterSpacing: "-0.02em" }}>
                      {d.kpis.newCustomersCount + d.kpis.returningCustomersCount > 0
                        ? Math.round(
                            (d.kpis.returningCustomersCount /
                              (d.kpis.newCustomersCount + d.kpis.returningCustomersCount)) *
                              100
                          )
                        : 0}
                      %
                    </div>
                  </div>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      backgroundColor: "rgba(245, 158, 11, 0.12)",
                      border: "1px solid rgba(245, 158, 11, 0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fbbf24",
                    }}
                  >
                    <Users style={{ width: "22px", height: "22px" }} />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "14px" }}>
                  <span style={{ fontSize: "11px", color: "#c084fc", fontWeight: "700" }}>
                    {d.kpis.returningCustomersCount} Returning
                  </span>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>•</span>
                  <span style={{ fontSize: "11px", color: "#38bdf8", fontWeight: "700" }}>
                    {d.kpis.newCustomersCount} New Clients
                  </span>
                </div>

                <div
                  style={{
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                    marginTop: "16px",
                    paddingTop: "10px",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    color: "#94a3b8",
                  }}
                >
                  <span>Cancel: <strong style={{ color: "#fb7185" }}>{d.kpis.cancellationRate}%</strong></span>
                  <span>No-Show: <strong style={{ color: "#fbbf24" }}>{d.kpis.noShowRate}%</strong></span>
                </div>
              </SpotlightCard>
            </AnimatedGroup>

            {/* Today's Operational Pulse Ribbon (4 Panels) */}
            <AnimatedGroup
              stagger={0.04}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "14px",
              }}
            >
              <SpotlightCard
                spotlightColor="rgba(56, 189, 248, 0.12)"
                style={{
                  padding: "16px 18px",
                  borderRadius: "14px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "rgba(15, 23, 42, 0.45)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#94a3b8", fontWeight: "600" }}>
                  <Calendar style={{ width: "14px", height: "14px", color: "#38bdf8" }} />
                  Today's Bookings
                </div>
                <div style={{ fontSize: "24px", fontWeight: "800", color: "#f8fafc", marginTop: "6px", letterSpacing: "-0.02em" }}>
                  {d.today.bookingsCount}
                </div>
                <div style={{ fontSize: "11px", color: "#34d399", marginTop: "4px" }}>
                  {d.today.completedCount} completed • {d.today.cancelledCount} cancelled
                </div>
              </SpotlightCard>

              <SpotlightCard
                spotlightColor="rgba(52, 211, 153, 0.12)"
                style={{
                  padding: "16px 18px",
                  borderRadius: "14px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "rgba(15, 23, 42, 0.45)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#94a3b8", fontWeight: "600" }}>
                  <DollarSign style={{ width: "14px", height: "14px", color: "#34d399" }} />
                  Today's Booked Scheduled
                </div>
                <div style={{ fontSize: "24px", fontWeight: "800", color: "#34d399", marginTop: "6px", letterSpacing: "-0.02em" }}>
                  {formatCurrency(d.today.bookedRevenueCents, d.period.currency || currency)}
                </div>
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                  Day schedule gross
                </div>
              </SpotlightCard>

              <SpotlightCard
                spotlightColor="rgba(192, 132, 252, 0.12)"
                style={{
                  padding: "16px 18px",
                  borderRadius: "14px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "rgba(15, 23, 42, 0.45)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#94a3b8", fontWeight: "600" }}>
                  <DollarSign style={{ width: "14px", height: "14px", color: "#c084fc" }} />
                  Today's Captured Cash
                </div>
                <div style={{ fontSize: "24px", fontWeight: "800", color: "#c084fc", marginTop: "6px", letterSpacing: "-0.02em" }}>
                  {formatCurrency(d.today.collectedRevenueCents, d.period.currency || currency)}
                </div>
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                  Stripe captured
                </div>
              </SpotlightCard>

              <SpotlightCard
                spotlightColor="rgba(245, 158, 11, 0.12)"
                style={{
                  padding: "16px 18px",
                  borderRadius: "14px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "rgba(15, 23, 42, 0.45)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#94a3b8", fontWeight: "600" }}>
                  <Sparkles style={{ width: "14px", height: "14px", color: "#fbbf24" }} />
                  Optimizer Revenue Recovered
                </div>
                <div style={{ fontSize: "24px", fontWeight: "800", color: "#fbbf24", marginTop: "6px", letterSpacing: "-0.02em" }}>
                  {formatCurrency(d.kpis.recoveredWaitlistRevenueCents, d.period.currency || currency)}
                </div>
                <div style={{ fontSize: "11px", color: "#38bdf8", marginTop: "4px" }}>
                  <Link href="/app/optimizer" style={{ color: "#38bdf8", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                    View Optimizer Engine →
                  </Link>
                </div>
              </SpotlightCard>
            </AnimatedGroup>

            {/* Main Visualizations: Revenue Trend & Status Donut */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                gap: "20px",
              }}
            >
              {/* Revenue & Cash Flow Trend (Area/Line SVG) */}
              <SpotlightCard
                spotlightColor="rgba(56, 189, 248, 0.08)"
                style={{
                  gridColumn: "span 2",
                  padding: "22px",
                  borderRadius: "16px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "rgba(15, 23, 42, 0.5)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    paddingBottom: "14px",
                    marginBottom: "16px",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <TrendingUp style={{ width: "18px", height: "18px", color: "#38bdf8" }} />
                      <h2 style={{ fontSize: "16px", fontWeight: "700", color: "#f8fafc", margin: 0 }}>
                        Revenue & Cash Inflow Trend
                      </h2>
                    </div>
                    <p style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                      Daily scheduled gross value vs. authoritative Stripe collected cash in {currency}
                    </p>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#cbd5e1" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "2px", backgroundColor: "#38bdf8" }} />
                      <span>Booked Revenue</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#cbd5e1" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "2px", backgroundColor: "#c084fc" }} />
                      <span>Collected Cash</span>
                    </div>
                  </div>
                </div>

                <RevenueTrendSvgChart
                  dates={d.chartSeries.dates}
                  bookedRevenue={d.chartSeries.bookedRevenue}
                  collectedRevenue={d.chartSeries.collectedRevenue}
                  currency={d.period.currency || currency}
                />
              </SpotlightCard>

              {/* Status Breakdown (Donut SVG) */}
              <SpotlightCard
                spotlightColor="rgba(52, 211, 153, 0.08)"
                style={{
                  padding: "22px",
                  borderRadius: "16px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "rgba(15, 23, 42, 0.5)",
                }}
              >
                <div
                  style={{
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    paddingBottom: "14px",
                    marginBottom: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Activity style={{ width: "18px", height: "18px", color: "#34d399" }} />
                    <h2 style={{ fontSize: "16px", fontWeight: "700", color: "#f8fafc", margin: 0 }}>
                      Appointment Outcomes
                    </h2>
                  </div>
                  <p style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                    Distribution across completed, active, cancelled, and no-shows
                  </p>
                </div>

                <StatusDonutSvgChart
                  completed={d.statusBreakdown?.completed ?? d.kpis.completedBookings}
                  confirmed={d.statusBreakdown?.confirmed ?? 0}
                  inProgress={d.statusBreakdown?.inProgress ?? 0}
                  cancelled={d.statusBreakdown?.cancelled ?? 0}
                  noShow={d.statusBreakdown?.noShow ?? 0}
                  hold={d.statusBreakdown?.hold ?? 0}
                />
              </SpotlightCard>
            </div>

            {/* Secondary Visualizations: Volume History & Capacity Speedometer */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                gap: "20px",
              }}
            >
              {/* Daily Booking Volume (Bar Chart SVG) */}
              <SpotlightCard
                spotlightColor="rgba(129, 140, 248, 0.08)"
                style={{
                  padding: "22px",
                  borderRadius: "16px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "rgba(15, 23, 42, 0.5)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    paddingBottom: "14px",
                    marginBottom: "16px",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Calendar style={{ width: "18px", height: "18px", color: "#818cf8" }} />
                      <h2 style={{ fontSize: "16px", fontWeight: "700", color: "#f8fafc", margin: 0 }}>
                        Booking Volume History
                      </h2>
                    </div>
                    <p style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                      Total appointments scheduled per calendar day
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "#94a3b8" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#38bdf8" }} /> Completed
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#fb7185" }} /> Cancelled
                    </span>
                  </div>
                </div>

                <BookingVolumeSvgChart
                  dates={d.chartSeries.dates}
                  bookingsCount={d.chartSeries.bookingsCount}
                  completedCount={d.chartSeries.completedCount}
                  cancelledCount={d.chartSeries.cancelledCount}
                />
              </SpotlightCard>

              {/* Provider Shift Capacity (Speedometer Gauge SVG) */}
              <SpotlightCard
                spotlightColor="rgba(245, 158, 11, 0.08)"
                style={{
                  padding: "22px",
                  borderRadius: "16px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "rgba(15, 23, 42, 0.5)",
                }}
              >
                <div
                  style={{
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    paddingBottom: "14px",
                    marginBottom: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Clock3 style={{ width: "18px", height: "18px", color: "#fbbf24" }} />
                    <h2 style={{ fontSize: "16px", fontWeight: "700", color: "#f8fafc", margin: 0 }}>
                      Staff Shift Capacity & Utilization
                    </h2>
                  </div>
                  <p style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                    Productive scheduled minutes against active provider shift schedules
                  </p>
                </div>

                <CapacityGaugeSvgChart
                  utilizationRate={d.kpis.overallUtilizationRate}
                  totalBookedHours={d.capacityHours?.totalBookedHours || 0}
                  totalBookableHours={d.capacityHours?.totalBookableHours || 1}
                />
              </SpotlightCard>
            </div>

            {/* Top Services & Top Staff Performance Breakdown */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                gap: "20px",
              }}
            >
              {/* Top Services */}
              <SpotlightCard
                spotlightColor="rgba(56, 189, 248, 0.08)"
                style={{
                  padding: "22px",
                  borderRadius: "16px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "rgba(15, 23, 42, 0.5)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    paddingBottom: "14px",
                    marginBottom: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Sparkles style={{ width: "18px", height: "18px", color: "#38bdf8" }} />
                    <h2 style={{ fontSize: "16px", fontWeight: "700", color: "#f8fafc", margin: 0 }}>
                      Top Services by Revenue
                    </h2>
                  </div>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>Ranked by volume</span>
                </div>

                <PerformanceDistributionBars
                  items={d.topServices.map((s) => ({
                    id: s.serviceId,
                    name: s.serviceName,
                    count: s.bookingsCount,
                    revenueCents: s.revenueCents,
                  }))}
                  currency={d.period.currency || currency}
                  metricLabel="appointments"
                />
              </SpotlightCard>

              {/* Provider Performance */}
              <SpotlightCard
                spotlightColor="rgba(192, 132, 252, 0.08)"
                style={{
                  padding: "22px",
                  borderRadius: "16px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "rgba(15, 23, 42, 0.5)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    paddingBottom: "14px",
                    marginBottom: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Users style={{ width: "18px", height: "18px", color: "#c084fc" }} />
                    <h2 style={{ fontSize: "16px", fontWeight: "700", color: "#f8fafc", margin: 0 }}>
                      Provider Performance & Utilization
                    </h2>
                  </div>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>Active providers</span>
                </div>

                <PerformanceDistributionBars
                  items={d.topStaff.map((st) => ({
                    id: st.staffId,
                    name: st.staffName,
                    count: st.bookingsCount,
                    revenueCents: st.revenueCents,
                    utilizationRate: st.utilizationRate,
                  }))}
                  currency={d.period.currency || currency}
                  metricLabel="bookings"
                  showUtilization={true}
                />
              </SpotlightCard>
            </div>

            {/* Integration Warnings Banner if any connections degraded */}
            {d.integrationWarnings && d.integrationWarnings.length > 0 && (
              <GlassCard variant="panel" style={{ borderColor: "rgba(245, 158, 11, 0.4)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <AlertTriangle style={{ width: "20px", height: "20px", color: "#fbbf24" }} />
                  <div>
                    <h3 style={{ fontSize: "14px", fontWeight: "700", color: "#fbbf24", margin: 0 }}>
                      Integration Sync Notice
                    </h3>
                    <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                      {d.integrationWarnings.map((w) => `${w.integrationType}: ${w.message}`).join(" • ")}
                    </p>
                  </div>
                </div>
              </GlassCard>
            )}

            {/* Quick Navigation Footer */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "14px",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                paddingTop: "24px",
              }}
            >
              <motion.div whileHover={{ y: -2, scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Link
                  href="/workspace"
                  style={{
                    padding: "16px 18px",
                    borderRadius: "14px",
                    backgroundColor: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    textDecoration: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: "5px",
                    transition: "all 150ms ease",
                  }}
                >
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#38bdf8", display: "flex", alignItems: "center", gap: "4px" }}>
                    Staff Workspace <ArrowRight style={{ width: "13px", height: "13px" }} />
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>Attendance, shift roster & commissions</div>
                </Link>
              </motion.div>

              <motion.div whileHover={{ y: -2, scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Link
                  href="/app/optimizer"
                  style={{
                    padding: "16px 18px",
                    borderRadius: "14px",
                    backgroundColor: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    textDecoration: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: "5px",
                    transition: "all 150ms ease",
                  }}
                >
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#c084fc", display: "flex", alignItems: "center", gap: "4px" }}>
                    Schedule Optimizer <ArrowRight style={{ width: "13px", height: "13px" }} />
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>Autonomous gap recovery & smart offers</div>
                </Link>
              </motion.div>

              <motion.div whileHover={{ y: -2, scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Link
                  href="/app/customers"
                  style={{
                    padding: "16px 18px",
                    borderRadius: "14px",
                    backgroundColor: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    textDecoration: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: "5px",
                    transition: "all 150ms ease",
                  }}
                >
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#34d399", display: "flex", alignItems: "center", gap: "4px" }}>
                    Customer Directory <ArrowRight style={{ width: "13px", height: "13px" }} />
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>Client history, retention & invitations</div>
                </Link>
              </motion.div>

              <motion.div whileHover={{ y: -2, scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Link
                  href="/app/settings/audit"
                  style={{
                    padding: "16px 18px",
                    borderRadius: "14px",
                    backgroundColor: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    textDecoration: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: "5px",
                    transition: "all 150ms ease",
                  }}
                >
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#fbbf24", display: "flex", alignItems: "center", gap: "4px" }}>
                    Tenant Audit Logs <ArrowRight style={{ width: "13px", height: "13px" }} />
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>Immutable audit trace & actor event logs</div>
                </Link>
              </motion.div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
