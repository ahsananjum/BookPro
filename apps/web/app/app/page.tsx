/* Hallmark · macrostructure: Operational Command Center · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 * motion-primitives: SpotlightCard, AnimatedGroup, MotionAlert, CollapsibleDisclosure
 */
"use client";

import React, { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ContactRound,
  Sparkles,
  UsersRound,
  BriefcaseBusiness,
  TrendingUp,
  ArrowUpRight,
  AlertTriangle,
  Info,
  RefreshCw,
  Plus,
  CalendarCheck2,
  CheckCircle2,
  Search,
  Check,
  Bot,
  ChevronDown,
  Play,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../lib/auth-context";
import { useDashboardOverview } from "../../lib/use-dashboard-overview";
import { useRealtimeEvents } from "../../lib/use-realtime-events";
import { apiFetch } from "../../lib/api-client";
import { GlassBadge } from "../../components/glass-card";
import { CalendarPulse, ClockSpinner } from "../../components/animated-svgs";
import { sanitizeErrorMessage } from "../../lib/error-utils";
import { SanitizedAlert } from "../../components/sanitized-alert";
import {
  SpotlightCard,
  AnimatedGroup,
  MotionAlert,
  CollapsibleDisclosure,
} from "../../components/motion-primitives";

interface CurrencyOption {
  code: string;
  name: string;
  flag: string;
  symbol: string;
}

const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: "USD", name: "US Dollar", flag: "🇺🇸", symbol: "$" },
  { code: "PKR", name: "Pakistani Rupee", flag: "🇵🇰", symbol: "₨" },
  { code: "EUR", name: "Euro", flag: "🇪🇺", symbol: "€" },
  { code: "GBP", name: "British Pound", flag: "🇬🇧", symbol: "£" },
  { code: "AED", name: "UAE Dirham", flag: "🇦🇪", symbol: "د.إ" },
  { code: "SAR", name: "Saudi Riyal", flag: "🇸🇦", symbol: "﷼" },
  { code: "INR", name: "Indian Rupee", flag: "🇮🇳", symbol: "₹" },
  { code: "CAD", name: "Canadian Dollar", flag: "🇨🇦", symbol: "C$" },
  { code: "AUD", name: "Australian Dollar", flag: "🇦🇺", symbol: "A$" },
];

function formatCurrency(amountCents: number, currency: string = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format((amountCents || 0) / 100);
  } catch {
    return `${currency} ${((amountCents || 0) / 100).toFixed(2)}`;
  }
}

function formatTimeInTimezone(isoString: string, timezone: string = "UTC"): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(isoString));
  } catch {
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}

export default function OwnerOverviewPage() {
  const { user } = useAuth();
  const { isConnected: isRealtimeLive } = useRealtimeEvents(user?.organizationId);

  // Active chosen view currency
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [isSavingCurrency, setIsSavingCurrency] = useState(false);
  const [currencySaveSuccess, setCurrencySaveSuccess] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Agenda filter, search, and progressive disclosure
  const [agendaFilter, setAgendaFilter] = useState<"ALL" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "UNPAID">("ALL");
  const [agendaSearch, setAgendaSearch] = useState("");
  const [agendaShowAll, setAgendaShowAll] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Query overview with optional currencyOverride
  const {
    data: overview,
    isLoading,
    isError,
    error,
    refetch,
  } = useDashboardOverview(undefined, selectedCurrency || undefined);

  // Natural greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.fullName ? user.fullName.split(" ")[0] : "Owner";

  // Active chosen currency & organization default currency
  const orgDefaultCurrency = overview?.organization?.currency || "USD";
  const activeCurrency = selectedCurrency || overview?.forex?.chosenCurrency || orgDefaultCurrency;
  const forexInfo = overview?.forex;

  // Business date in organization timezone
  const tz = overview?.organization?.timezone || "UTC";
  const formattedToday = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  // Save selected currency permanently to database
  const handleSaveDefaultCurrency = useCallback(
    async (currencyCode: string) => {
      setIsSavingCurrency(true);
      setActionError(null);
      try {
        const res = await apiFetch("/organization/current", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currency: currencyCode }),
        });
        if (res.success) {
          setCurrencySaveSuccess(true);
          setTimeout(() => setCurrencySaveSuccess(false), 3000);
          void refetch();
        } else {
          setActionError(sanitizeErrorMessage(res.error, "Failed to update default currency").message);
        }
      } catch (err: any) {
        setActionError(sanitizeErrorMessage(err, "Failed to update default currency").message);
      } finally {
        setIsSavingCurrency(false);
      }
    },
    [refetch]
  );

  // Execute quick appointment status transition directly from dashboard
  const handleAppointmentStatusTransition = async (apptId: string, action: "start" | "complete") => {
    setActionInProgressId(apptId);
    setActionError(null);
    try {
      const res = await apiFetch(`/appointments/${encodeURIComponent(apptId)}/${action}`, {
        method: "POST",
      });
      if (res.success) {
        void refetch();
      } else {
        setActionError(sanitizeErrorMessage(res.error, `Unable to ${action} appointment`).message);
      }
    } catch (err: any) {
      setActionError(sanitizeErrorMessage(err, `Failed to ${action} appointment`).message);
    } finally {
      setActionInProgressId(null);
    }
  };

  // Filtered upcoming appointments
  const filteredAppointments = useMemo(() => {
    const list = overview?.upcomingAppointments || [];
    return list.filter((appt) => {
      if (agendaFilter === "CONFIRMED" && appt.status !== "CONFIRMED") return false;
      if (agendaFilter === "IN_PROGRESS" && appt.status !== "IN_PROGRESS" && appt.status !== "CHECKED_IN")
        return false;
      if (agendaFilter === "COMPLETED" && appt.status !== "COMPLETED") return false;
      if (agendaFilter === "UNPAID" && appt.paymentStatus === "PAID") return false;

      if (agendaSearch.trim()) {
        const q = agendaSearch.toLowerCase().trim();
        const clientMatch = appt.customer?.fullName?.toLowerCase().includes(q);
        const serviceMatch = appt.service?.name?.toLowerCase().includes(q);
        const staffMatch = appt.staff?.displayName?.toLowerCase().includes(q);
        if (!clientMatch && !serviceMatch && !staffMatch) return false;
      }

      return true;
    });
  }, [overview?.upcomingAppointments, agendaFilter, agendaSearch]);

  const initialAppointments = useMemo(() => filteredAppointments.slice(0, 6), [filteredAppointments]);
  const extraAppointments = useMemo(() => filteredAppointments.slice(6), [filteredAppointments]);

  const activeCurrencyConfig = SUPPORTED_CURRENCIES.find((c) => c.code === activeCurrency) || {
    code: activeCurrency,
    name: activeCurrency,
    flag: "🌐",
    symbol: activeCurrency,
  };

  const isCurrencyModified = activeCurrency !== orgDefaultCurrency;

  return (
    <div style={{ display: "grid", gap: "24px", maxWidth: "1600px", margin: "0 auto", paddingBottom: "40px" }}>
      {/* 1. EXECUTIVE OPERATIONAL COMMAND BAR */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          paddingBottom: "16px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 850,
                color: "#f8fafc",
                margin: 0,
                letterSpacing: "-0.02em",
                background: "linear-gradient(135deg, #ffffff 40%, #94a3b8 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {greeting}, {firstName}
            </h1>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "6px",
                backgroundColor: "rgba(56, 189, 248, 0.12)",
                color: "#38bdf8",
                border: "1px solid rgba(56, 189, 248, 0.25)",
              }}
            >
              Executive Command
            </span>
          </div>
          <p style={{ fontSize: "13px", color: "#94a3b8", margin: "4px 0 0 0" }}>
            {formattedToday} · {overview?.organization?.brandName || overview?.organization?.name || user?.organizationName || "Workspace"} ({tz})
          </p>
        </div>

        {/* Action Controls & Live Multi-Currency Ticker */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Live Sync Pulse */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 700,
              backgroundColor: isRealtimeLive ? "rgba(16, 185, 129, 0.12)" : "rgba(245, 158, 11, 0.12)",
              border: `1px solid ${isRealtimeLive ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
              color: isRealtimeLive ? "#34d399" : "#fbbf24",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: isRealtimeLive ? "#10b981" : "#f59e0b",
                boxShadow: isRealtimeLive ? "0 0 8px rgba(16, 185, 129, 0.6)" : "none",
              }}
            />
            <span>{isRealtimeLive ? "Realtime Live" : "Connecting..."}</span>
          </div>

          {/* Live Forex Currency Switcher Dropdown */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setIsCurrencyDropdownOpen((prev) => !prev)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "7px 13px",
                borderRadius: "8px",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                border: isCurrencyModified ? "1px solid rgba(56, 189, 248, 0.45)" : "1px solid rgba(255, 255, 255, 0.14)",
                color: "#f8fafc",
                fontSize: "12.5px",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
                transition: "all 0.15s ease",
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "translateY(1px)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <span style={{ fontSize: "14px" }}>{activeCurrencyConfig.flag}</span>
              <span>
                {activeCurrencyConfig.code} ({activeCurrencyConfig.symbol})
              </span>
              {forexInfo && activeCurrency !== "USD" && (
                <span style={{ fontSize: "11px", color: "#38bdf8", fontWeight: 600 }}>
                  · {forexInfo.exchangeRate.toFixed(2)}/USD
                </span>
              )}
              <ChevronDown
                size={14}
                color="#94a3b8"
                style={{
                  transform: isCurrencyDropdownOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s ease",
                }}
              />
            </button>

            {/* Motion Popover Dropdown Menu */}
            <AnimatePresence>
              {isCurrencyDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    width: "260px",
                    borderRadius: "12px",
                    backgroundColor: "rgba(15, 23, 42, 0.96)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    backdropFilter: "blur(20px)",
                    boxShadow: "0 16px 40px rgba(0, 0, 0, 0.6)",
                    padding: "8px",
                    zIndex: 100,
                  }}
                >
                  <div
                    style={{
                      padding: "6px 8px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                      marginBottom: "4px",
                    }}
                  >
                    LIVE FOREX RATES CONVERSION
                  </div>
                  <div style={{ maxHeight: "240px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}>
                    {SUPPORTED_CURRENCIES.map((curr) => {
                      const isSelected = curr.code === activeCurrency;
                      return (
                        <button
                          key={curr.code}
                          type="button"
                          onClick={() => {
                            setSelectedCurrency(curr.code);
                            setIsCurrencyDropdownOpen(false);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 10px",
                            borderRadius: "6px",
                            backgroundColor: isSelected ? "rgba(56, 189, 248, 0.15)" : "transparent",
                            border: "none",
                            color: isSelected ? "#38bdf8" : "#e2e8f0",
                            fontSize: "12.5px",
                            fontWeight: isSelected ? 750 : 500,
                            cursor: "pointer",
                            textAlign: "left",
                            width: "100%",
                            transition: "background-color 0.1s ease",
                          }}
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>{curr.flag}</span>
                            <span>{curr.code}</span>
                            <span style={{ fontSize: "11px", color: "#64748b" }}>({curr.symbol})</span>
                          </span>
                          {isSelected && <Check size={14} color="#38bdf8" />}
                        </button>
                      );
                    })}
                  </div>

                  {isCurrencyModified && (
                    <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", marginTop: "6px", paddingTop: "6px" }}>
                      <button
                        type="button"
                        disabled={isSavingCurrency}
                        onClick={() => handleSaveDefaultCurrency(activeCurrency)}
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          backgroundColor: "#0284c7",
                          border: "none",
                          color: "#ffffff",
                          fontSize: "11.5px",
                          fontWeight: 700,
                          cursor: isSavingCurrency ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                        }}
                      >
                        {isSavingCurrency ? "Saving to DB..." : `Set ${activeCurrency} as Org Default`}
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {currencySaveSuccess && (
            <span style={{ fontSize: "11px", color: "#34d399", fontWeight: 700 }}>
              ✓ Saved to DB
            </span>
          )}

          {/* AI Co-Pilot Shortcut */}
          <Link
            href="/app/ai"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "8px",
              backgroundColor: "rgba(56, 189, 248, 0.12)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              color: "#38bdf8",
              fontSize: "12.5px",
              fontWeight: 750,
              textDecoration: "none",
              transition: "all 0.15s ease",
            }}
          >
            <Bot size={15} />
            <span>AI Co-Pilot</span>
          </Link>

          {/* New Appointment Action */}
          <Link
            href="/app/calendar"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #0284c7, #0369a1)",
              border: "1px solid #38bdf8",
              color: "#ffffff",
              fontSize: "12.5px",
              fontWeight: 800,
              textDecoration: "none",
              boxShadow: "0 4px 14px rgba(2, 132, 199, 0.35)",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
          >
            <Plus size={15} />
            <span>New Appointment</span>
          </Link>
        </div>
      </div>

      {/* 2. ERROR STATE */}
      {isError && (
        <SpotlightCard
          spotlightColor="rgba(239, 68, 68, 0.18)"
          style={{
            padding: "20px 24px",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <strong style={{ color: "#fca5a5", fontSize: "15px", display: "block" }}>
              Unable to load live operational overview
            </strong>
            <p style={{ color: "#f87171", fontSize: "13px", margin: "4px 0 0 0" }}>
              {sanitizeErrorMessage(error, "A connection error occurred while querying operational data.").message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              borderRadius: "8px",
              backgroundColor: "#ef4444",
              color: "#ffffff",
              border: 0,
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} /> Retry
          </button>
        </SpotlightCard>
      )}

      {/* Action Error Notification with MotionAlert */}
      <MotionAlert isVisible={Boolean(actionError)} type="error">
        <SanitizedAlert error={actionError} onDismiss={() => setActionError(null)} />
      </MotionAlert>

      {/* 3. AUTHORITATIVE HEALTH ALERTS */}
      {!isLoading && overview?.health && overview.health.issues.length > 0 && (
        <section aria-label="Business Health and Operational Readiness">
          <div style={{ display: "grid", gap: "10px" }}>
            {overview.health.issues.map((issue) => {
              const isCritical = issue.severity === "critical";
              return (
                <SpotlightCard
                  key={issue.code}
                  spotlightColor={isCritical ? "rgba(245, 158, 11, 0.15)" : "rgba(56, 189, 248, 0.15)"}
                  style={{
                    padding: "14px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "16px",
                    border: isCritical ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid rgba(56, 189, 248, 0.3)",
                    backgroundColor: isCritical ? "rgba(245, 158, 11, 0.08)" : "rgba(14, 116, 144, 0.08)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {isCritical ? (
                      <AlertTriangle size={18} color="#fbbf24" style={{ flexShrink: 0 }} />
                    ) : (
                      <Info size={18} color="#38bdf8" style={{ flexShrink: 0 }} />
                    )}
                    <div>
                      <strong style={{ color: isCritical ? "#fef3c7" : "#e0f2fe", fontSize: "13.5px", display: "block" }}>
                        {issue.message}
                      </strong>
                    </div>
                  </div>
                  <Link
                    href={issue.actionHref}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "6px 13px",
                      borderRadius: "6px",
                      backgroundColor: isCritical ? "#fbbf24" : "#0284c7",
                      color: isCritical ? "#1e1b4b" : "#ffffff",
                      fontSize: "12px",
                      fontWeight: 800,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {issue.actionLabel} →
                  </Link>
                </SpotlightCard>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. DYNAMIC EXECUTIVE KPI CARDS */}
      <section aria-label="Authoritative Operational Metrics">
        <AnimatedGroup
          stagger={0.07}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
          }}
        >
          {/* Card 1: Today's Appointments */}
          <SpotlightCard
            spotlightColor="rgba(56, 189, 248, 0.12)"
            style={{ padding: "20px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ color: "#94a3b8", fontSize: "11.5px", fontWeight: 750, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Today's Appointments
              </span>
              <CalendarPulse size={24} />
            </div>
            {isLoading ? (
              <div className="skeleton-box" style={{ width: "60px", height: "34px", margin: "6px 0" }} />
            ) : (
              <div>
                <strong style={{ color: "#f8fafc", fontSize: "28px", fontWeight: 850, letterSpacing: "-0.03em" }}>
                  {overview?.today?.appointments.total ?? 0}
                </strong>
                <div style={{ width: "100%", height: "5px", backgroundColor: "rgba(255, 255, 255, 0.08)", borderRadius: "4px", overflow: "hidden", margin: "8px 0" }}>
                  <div
                    style={{
                      width: `${
                        overview?.today?.appointments.total
                          ? Math.round(((overview.today.appointments.completed || 0) / overview.today.appointments.total) * 100)
                          : 0
                      }%`,
                      height: "100%",
                      backgroundColor: "#34d399",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            )}
            <span style={{ color: "#94a3b8", fontSize: "12px", display: "block" }}>
              {isLoading
                ? "Calculating schedule…"
                : `${overview?.today?.appointments.completed ?? 0} completed · ${
                    overview?.today?.appointments.upcoming ?? 0
                  } remaining`}
            </span>
          </SpotlightCard>

          {/* Card 2: Collected Today */}
          <SpotlightCard
            spotlightColor="rgba(52, 211, 153, 0.12)"
            style={{ padding: "20px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ color: "#94a3b8", fontSize: "11.5px", fontWeight: 750, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Collected Today
              </span>
              <CheckCircle2 size={22} color="#34d399" />
            </div>
            {isLoading ? (
              <div className="skeleton-box" style={{ width: "110px", height: "34px", margin: "6px 0" }} />
            ) : (
              <strong style={{ color: "#f8fafc", fontSize: "28px", fontWeight: 850, letterSpacing: "-0.03em", display: "block" }}>
                {formatCurrency(overview?.today?.collectedRevenueCents ?? 0, activeCurrency)}
              </strong>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
              <span style={{ fontSize: "10.5px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", backgroundColor: "rgba(52, 211, 153, 0.12)", color: "#34d399" }}>
                Live Forex {activeCurrency}
              </span>
              <span style={{ color: "#64748b", fontSize: "11.5px" }}>captured in DB</span>
            </div>
          </SpotlightCard>

          {/* Card 3: Scheduled Booked Value */}
          <SpotlightCard
            spotlightColor="rgba(56, 189, 248, 0.12)"
            style={{ padding: "20px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ color: "#94a3b8", fontSize: "11.5px", fontWeight: 750, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Scheduled Booked Value
              </span>
              <CalendarCheck2 size={22} color="#38bdf8" />
            </div>
            {isLoading ? (
              <div className="skeleton-box" style={{ width: "110px", height: "34px", margin: "6px 0" }} />
            ) : (
              <strong style={{ color: "#f8fafc", fontSize: "28px", fontWeight: 850, letterSpacing: "-0.03em", display: "block" }}>
                {formatCurrency(overview?.today?.expectedRevenueCents ?? 0, activeCurrency)}
              </strong>
            )}
            <span style={{ color: "#64748b", fontSize: "12px", display: "block", marginTop: "6px" }}>
              active bookings for today ({activeCurrency})
            </span>
          </SpotlightCard>

          {/* Card 4: 7-Day Performance */}
          <SpotlightCard
            spotlightColor="rgba(129, 140, 248, 0.12)"
            style={{ padding: "20px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ color: "#94a3b8", fontSize: "11.5px", fontWeight: 750, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                7-Day Volume
              </span>
              <TrendingUp size={22} color="#818cf8" />
            </div>
            {isLoading ? (
              <div className="skeleton-box" style={{ width: "80px", height: "34px", margin: "6px 0" }} />
            ) : (
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                <strong style={{ color: "#f8fafc", fontSize: "28px", fontWeight: 850, letterSpacing: "-0.03em" }}>
                  {overview?.performance?.bookingsCount ?? 0}
                </strong>
                {overview?.performance?.bookingsVsPrev !== null && overview?.performance?.bookingsVsPrev !== undefined && (
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 750,
                      color: overview.performance.bookingsVsPrev >= 0 ? "#34d399" : "#f87171",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "2px",
                    }}
                  >
                    {overview.performance.bookingsVsPrev >= 0 ? "+" : ""}
                    {overview.performance.bookingsVsPrev}% vs prev
                  </span>
                )}
              </div>
            )}
            <span style={{ color: "#64748b", fontSize: "12px", display: "block", marginTop: "6px" }}>
              {formatCurrency(overview?.performance?.collectedRevenueCents ?? 0, activeCurrency)} 7d revenue
            </span>
          </SpotlightCard>
        </AnimatedGroup>
      </section>

      {/* 5. AUTONOMOUS SCHEDULE ENGINE & WAITLIST RADAR */}
      {!isLoading && overview?.waitlistOpportunity && overview.waitlistOpportunity.pendingCount > 0 && (
        <SpotlightCard
          spotlightColor="rgba(168, 85, 247, 0.15)"
          style={{
            padding: "16px 20px",
            border: "1px solid rgba(168, 85, 247, 0.35)",
            backgroundColor: "rgba(168, 85, 247, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Sparkles size={22} color="#c084fc" />
            <div>
              <strong style={{ color: "#f3e8ff", fontSize: "14px", display: "block" }}>
                Autonomous Engine Radar: {overview.waitlistOpportunity.pendingCount} client(s) on priority waitlist
              </strong>
              <p style={{ color: "#d8b4fe", fontSize: "12px", margin: "2px 0 0 0" }}>
                Slots opening via cancellations are automatically evaluated and dispatched by the background schedule engine.
              </p>
            </div>
          </div>
          <Link
            href="/app/waitlist"
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              backgroundColor: "#c084fc",
              color: "#3b0764",
              fontSize: "12px",
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            Review waitlist queue →
          </Link>
        </SpotlightCard>
      )}

      {/* 6. INTERACTIVE OPERATING AGENDA (TODAY'S SCHEDULE) */}
      <section aria-label="Today's Operating Agenda">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "14px" }}>
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
              Today's Operating Agenda
            </h2>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>
              Authoritative appointments converted to {activeCurrencyConfig.name} ({activeCurrency})
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {/* Search filter input */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "8px",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <Search size={14} color="#94a3b8" />
              <input
                type="text"
                value={agendaSearch}
                onChange={(e) => setAgendaSearch(e.target.value)}
                placeholder="Filter client, service…"
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#f8fafc",
                  fontSize: "12.5px",
                  width: "140px",
                }}
              />
            </div>

            <Link
              href="/app/calendar"
              style={{
                color: "#38bdf8",
                fontSize: "12.5px",
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Full calendar →
            </Link>
          </div>
        </div>

        {/* Agenda Filter Tabs */}
        <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "8px", marginBottom: "10px" }}>
          {[
            { key: "ALL", label: "All Items" },
            { key: "CONFIRMED", label: "Confirmed" },
            { key: "IN_PROGRESS", label: "In Progress / Checked In" },
            { key: "COMPLETED", label: "Completed" },
            { key: "UNPAID", label: "Pending Payment" },
          ].map((tab) => {
            const isActive = agendaFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setAgendaFilter(tab.key as any)}
                style={{
                  fontSize: "11.5px",
                  fontWeight: 700,
                  padding: "5px 12px",
                  borderRadius: "6px",
                  backgroundColor: isActive ? "rgba(56, 189, 248, 0.18)" : "rgba(255, 255, 255, 0.04)",
                  border: isActive ? "1px solid rgba(56, 189, 248, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)",
                  color: isActive ? "#38bdf8" : "#94a3b8",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div style={{ display: "grid", gap: "10px" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton-box" style={{ width: "100%", height: "72px", borderRadius: "10px" }} />
            ))}
          </div>
        ) : filteredAppointments.length === 0 ? (
          <SpotlightCard style={{ padding: "36px 20px", textAlign: "center" }}>
            <ClockSpinner size={36} className="mx-auto mb-2" />
            <strong style={{ color: "#f1f5f9", fontSize: "15px", display: "block", marginTop: "8px" }}>
              {agendaSearch
                ? "No matching appointments found"
                : overview?.organization?.bookingPage?.status === "UNPUBLISHED"
                ? "Booking portal is not published"
                : "No appointments scheduled for today"}
            </strong>
            <p style={{ color: "#94a3b8", fontSize: "13px", margin: "6px auto 16px auto", maxWidth: "420px" }}>
              {overview?.organization?.bookingPage?.status === "UNPUBLISHED"
                ? "Publish your public booking portal so clients can schedule online."
                : "Your schedule is clear for today. You can book an appointment manually or review the full calendar."}
            </p>
            <Link
              href={overview?.organization?.bookingPage?.status === "UNPUBLISHED" ? "/onboarding" : "/app/calendar"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                borderRadius: "8px",
                backgroundColor: "#1e293b",
                border: "1px solid #334155",
                color: "#38bdf8",
                fontSize: "12.5px",
                fontWeight: 750,
                textDecoration: "none",
              }}
            >
              {overview?.organization?.bookingPage?.status === "UNPUBLISHED"
                ? "Finish booking setup →"
                : "+ New appointment on calendar"}
            </Link>
          </SpotlightCard>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {/* Primary Initial Appointments (Top 6) */}
            {initialAppointments.map((appt) => {
              const timeDisplay = formatTimeInTimezone(appt.startAt, tz);
              const isActionBusy = actionInProgressId === appt.id;

              return (
                <SpotlightCard
                  key={appt.id}
                  spotlightColor="rgba(56, 189, 248, 0.12)"
                  className="agenda-appointment-item"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px minmax(0, 1fr) auto auto",
                    alignItems: "center",
                    gap: "16px",
                    padding: "14px 18px",
                  }}
                >
                  <div>
                    <span style={{ color: "#38bdf8", fontWeight: 800, fontSize: "14px", display: "block" }}>
                      {timeDisplay}
                    </span>
                    <span style={{ color: "#64748b", fontSize: "11px" }}>
                      {appt.service?.durationMin || 30} mins
                    </span>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <strong
                        style={{
                          color: "#f8fafc",
                          fontSize: "14.5px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {appt.customer?.fullName || "Guest Client"}
                      </strong>
                      {appt.customer?.phone && (
                        <span style={{ color: "#64748b", fontSize: "11.5px" }}>· {appt.customer.phone}</span>
                      )}
                    </div>
                    <span
                      style={{
                        color: "#94a3b8",
                        fontSize: "12.5px",
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginTop: "2px",
                      }}
                    >
                      ✂️ {appt.service?.name || "Service"} · Staff: {appt.staff?.displayName || "Any"} · 📍 {appt.location?.name || "Main"}
                    </span>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <strong style={{ color: "#f8fafc", fontSize: "14.5px", display: "block" }}>
                      {formatCurrency(appt.priceCents, appt.currency)}
                    </strong>
                    {appt.originalCurrency && appt.originalCurrency !== appt.currency && (
                      <span style={{ fontSize: "10.5px", color: "#64748b", display: "block" }}>
                        Orig: {formatCurrency(appt.originalPriceCents ?? 0, appt.originalCurrency)}
                      </span>
                    )}
                    {appt.paymentStatus && (
                      <span
                        style={{
                          fontSize: "10.5px",
                          fontWeight: 700,
                          color:
                            appt.paymentStatus === "PAID"
                              ? "#34d399"
                              : appt.paymentStatus === "DEPOSIT_PAID"
                              ? "#fbbf24"
                              : "#f87171",
                        }}
                      >
                        {appt.paymentStatus === "PAID"
                          ? "✓ Paid"
                          : appt.paymentStatus === "DEPOSIT_PAID"
                          ? "Deposit Paid"
                          : "Unpaid Balance"}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <GlassBadge
                      variant={
                        appt.status === "COMPLETED"
                          ? "success"
                          : appt.status === "CHECKED_IN" || appt.status === "IN_PROGRESS"
                          ? "purple"
                          : "info"
                      }
                      size="sm"
                    >
                      {appt.status.toLowerCase().replace("_", " ")}
                    </GlassBadge>

                    {appt.status === "CONFIRMED" && (
                      <button
                        type="button"
                        disabled={isActionBusy}
                        onClick={() => handleAppointmentStatusTransition(appt.id, "start")}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          backgroundColor: "rgba(56, 189, 248, 0.15)",
                          border: "1px solid rgba(56, 189, 248, 0.3)",
                          color: "#38bdf8",
                          fontSize: "11px",
                          fontWeight: 700,
                          cursor: isActionBusy ? "not-allowed" : "pointer",
                          transition: "transform 0.1s ease",
                        }}
                        onMouseDown={(e) => {
                          if (!isActionBusy) e.currentTarget.style.transform = "translateY(1px)";
                        }}
                        onMouseUp={(e) => {
                          e.currentTarget.style.transform = "translateY(0)";
                        }}
                      >
                        <Play size={11} />
                        <span>Start</span>
                      </button>
                    )}

                    {(appt.status === "IN_PROGRESS" || appt.status === "CHECKED_IN") && (
                      <button
                        type="button"
                        disabled={isActionBusy}
                        onClick={() => handleAppointmentStatusTransition(appt.id, "complete")}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          backgroundColor: "rgba(52, 211, 153, 0.15)",
                          border: "1px solid rgba(52, 211, 153, 0.3)",
                          color: "#34d399",
                          fontSize: "11px",
                          fontWeight: 700,
                          cursor: isActionBusy ? "not-allowed" : "pointer",
                          transition: "transform 0.1s ease",
                        }}
                        onMouseDown={(e) => {
                          if (!isActionBusy) e.currentTarget.style.transform = "translateY(1px)";
                        }}
                        onMouseUp={(e) => {
                          e.currentTarget.style.transform = "translateY(0)";
                        }}
                      >
                        <Check size={11} />
                        <span>Complete</span>
                      </button>
                    )}
                  </div>
                </SpotlightCard>
              );
            })}

            {/* Progressive Disclosure: Collapsible Extra Appointments */}
            <CollapsibleDisclosure isOpen={agendaShowAll}>
              <div style={{ display: "grid", gap: "10px", marginTop: "10px" }}>
                {extraAppointments.map((appt) => {
                  const timeDisplay = formatTimeInTimezone(appt.startAt, tz);
                  const isActionBusy = actionInProgressId === appt.id;

                  return (
                    <SpotlightCard
                      key={appt.id}
                      spotlightColor="rgba(56, 189, 248, 0.12)"
                      className="agenda-appointment-item"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px minmax(0, 1fr) auto auto",
                        alignItems: "center",
                        gap: "16px",
                        padding: "14px 18px",
                      }}
                    >
                      <div>
                        <span style={{ color: "#38bdf8", fontWeight: 800, fontSize: "14px", display: "block" }}>
                          {timeDisplay}
                        </span>
                        <span style={{ color: "#64748b", fontSize: "11px" }}>
                          {appt.service?.durationMin || 30} mins
                        </span>
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <strong
                            style={{
                              color: "#f8fafc",
                              fontSize: "14.5px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {appt.customer?.fullName || "Guest Client"}
                          </strong>
                          {appt.customer?.phone && (
                            <span style={{ color: "#64748b", fontSize: "11.5px" }}>· {appt.customer.phone}</span>
                          )}
                        </div>
                        <span
                          style={{
                            color: "#94a3b8",
                            fontSize: "12.5px",
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            marginTop: "2px",
                          }}
                        >
                          ✂️ {appt.service?.name || "Service"} · Staff: {appt.staff?.displayName || "Any"} · 📍 {appt.location?.name || "Main"}
                        </span>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <strong style={{ color: "#f8fafc", fontSize: "14.5px", display: "block" }}>
                          {formatCurrency(appt.priceCents, appt.currency)}
                        </strong>
                        {appt.originalCurrency && appt.originalCurrency !== appt.currency && (
                          <span style={{ fontSize: "10.5px", color: "#64748b", display: "block" }}>
                            Orig: {formatCurrency(appt.originalPriceCents ?? 0, appt.originalCurrency)}
                          </span>
                        )}
                        {appt.paymentStatus && (
                          <span
                            style={{
                              fontSize: "10.5px",
                              fontWeight: 700,
                              color:
                                appt.paymentStatus === "PAID"
                                  ? "#34d399"
                                  : appt.paymentStatus === "DEPOSIT_PAID"
                                  ? "#fbbf24"
                                  : "#f87171",
                            }}
                          >
                            {appt.paymentStatus === "PAID"
                              ? "✓ Paid"
                              : appt.paymentStatus === "DEPOSIT_PAID"
                              ? "Deposit Paid"
                              : "Unpaid Balance"}
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <GlassBadge
                          variant={
                            appt.status === "COMPLETED"
                              ? "success"
                              : appt.status === "CHECKED_IN" || appt.status === "IN_PROGRESS"
                              ? "purple"
                              : "info"
                          }
                          size="sm"
                        >
                          {appt.status.toLowerCase().replace("_", " ")}
                        </GlassBadge>

                        {appt.status === "CONFIRMED" && (
                          <button
                            type="button"
                            disabled={isActionBusy}
                            onClick={() => handleAppointmentStatusTransition(appt.id, "start")}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              backgroundColor: "rgba(56, 189, 248, 0.15)",
                              border: "1px solid rgba(56, 189, 248, 0.3)",
                              color: "#38bdf8",
                              fontSize: "11px",
                              fontWeight: 700,
                              cursor: isActionBusy ? "not-allowed" : "pointer",
                              transition: "transform 0.1s ease",
                            }}
                            onMouseDown={(e) => {
                              if (!isActionBusy) e.currentTarget.style.transform = "translateY(1px)";
                            }}
                            onMouseUp={(e) => {
                              e.currentTarget.style.transform = "translateY(0)";
                            }}
                          >
                            <Play size={11} />
                            <span>Start</span>
                          </button>
                        )}

                        {(appt.status === "IN_PROGRESS" || appt.status === "CHECKED_IN") && (
                          <button
                            type="button"
                            disabled={isActionBusy}
                            onClick={() => handleAppointmentStatusTransition(appt.id, "complete")}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              backgroundColor: "rgba(52, 211, 153, 0.15)",
                              border: "1px solid rgba(52, 211, 153, 0.3)",
                              color: "#34d399",
                              fontSize: "11px",
                              fontWeight: 700,
                              cursor: isActionBusy ? "not-allowed" : "pointer",
                              transition: "transform 0.1s ease",
                            }}
                            onMouseDown={(e) => {
                              if (!isActionBusy) e.currentTarget.style.transform = "translateY(1px)";
                            }}
                            onMouseUp={(e) => {
                              e.currentTarget.style.transform = "translateY(0)";
                            }}
                          >
                            <Check size={11} />
                            <span>Complete</span>
                          </button>
                        )}
                      </div>
                    </SpotlightCard>
                  );
                })}
              </div>
            </CollapsibleDisclosure>

            {/* Progressive Disclosure Toggle Button */}
            {filteredAppointments.length > 6 && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={() => setAgendaShowAll((prev) => !prev)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 18px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(56, 189, 248, 0.08)",
                    border: "1px solid rgba(56, 189, 248, 0.25)",
                    color: "#38bdf8",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = "translateY(1px)";
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <ChevronDown
                    size={15}
                    style={{
                      transform: agendaShowAll ? "rotate(180deg)" : "none",
                      transition: "transform 0.2s ease",
                    }}
                  />
                  <span>
                    {agendaShowAll
                      ? `Show fewer appointments (top 6 of ${filteredAppointments.length})`
                      : `Showing 6 of ${filteredAppointments.length} appointments · Show all (${filteredAppointments.length - 6} more)`}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        <style jsx global>{`
          @media (max-width: 640px) {
            .agenda-appointment-item {
              grid-template-columns: 1fr !important;
              gap: 10px !important;
              padding: 12px 14px !important;
            }
          }
        `}</style>
      </section>

      {/* 7. QUICK WORKFLOW SHORTCUTS */}
      <section aria-label="Frequent Operational Workflows">
        <h2 style={{ fontSize: "16px", fontWeight: 800, color: "#f8fafc", marginBottom: "14px" }}>
          Operational Shortcuts
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "12px",
          }}
        >
          {[
            {
              title: "New Appointment",
              desc: "Schedule slot manually on calendar",
              href: "/app/calendar",
              icon: CalendarDays,
              color: "#38bdf8",
            },
            {
              title: "Customer Directory",
              desc: "Search client dossiers & notes",
              href: "/app/customers",
              icon: ContactRound,
              color: "#f472b6",
            },
            {
              title: "Service Catalog",
              desc: "Pricing, buffers & duration",
              href: "/app/services",
              icon: BriefcaseBusiness,
              color: "#34d399",
            },
            {
              title: "Staff & Roster",
              desc: "Practitioners & working hours",
              href: "/app/staff",
              icon: UsersRound,
              color: "#818cf8",
            },
            {
              title: "AI Co-Pilot",
              desc: "Executive command deck",
              href: "/app/ai",
              icon: Bot,
              color: "#c084fc",
            },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} href={action.href} style={{ textDecoration: "none" }}>
                <SpotlightCard
                  spotlightColor={`${action.color}25`}
                  style={{
                    padding: "16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    height: "100%",
                  }}
                >
                  <div
                    style={{
                      width: "38px",
                      height: "38px",
                      minWidth: "38px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(15, 23, 42, 0.9)",
                      border: `1px solid ${action.color}40`,
                      display: "grid",
                      placeItems: "center",
                      color: action.color,
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ color: "#f8fafc", fontSize: "13.5px", display: "block" }}>
                      {action.title}
                    </strong>
                    <span style={{ color: "#64748b", fontSize: "11.5px", display: "block", marginTop: "2px" }}>
                      {action.desc}
                    </span>
                  </div>
                  <ArrowUpRight size={14} color="#64748b" />
                </SpotlightCard>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 8. 7-DAY BUSINESS PERFORMANCE ANALYTICS */}
      <section aria-label="7-Day Performance Analytics Snapshot">
        <SpotlightCard
          spotlightColor="rgba(56, 189, 248, 0.12)"
          style={{ padding: "22px" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                7-Day Business Performance
              </h2>
              <span style={{ color: "#64748b", fontSize: "12px", marginTop: "2px", display: "block" }}>
                Converted to live {activeCurrencyConfig.name} ({activeCurrency})
              </span>
            </div>
            <Link
              href="/app/analytics"
              style={{
                color: "#38bdf8",
                fontSize: "12.5px",
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              View deep analytics →
            </Link>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "18px",
            }}
          >
            <div>
              <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>
                Total Bookings
              </span>
              <strong style={{ color: "#f8fafc", fontSize: "22px", display: "block", marginTop: "4px" }}>
                {overview?.performance?.bookingsCount ?? 0}
              </strong>
            </div>

            <div>
              <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>
                Collected Revenue ({activeCurrency})
              </span>
              <strong style={{ color: "#f8fafc", fontSize: "22px", display: "block", marginTop: "4px" }}>
                {formatCurrency(
                  overview?.performance?.collectedRevenueCents ?? 0,
                  activeCurrency
                )}
              </strong>
            </div>

            <div>
              <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>
                Cancellations
              </span>
              <strong style={{ color: "#f8fafc", fontSize: "22px", display: "block", marginTop: "4px" }}>
                {overview?.performance?.cancellationCount ?? 0}
              </strong>
            </div>

            <div>
              <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>
                Roster Utilization
              </span>
              <strong style={{ color: "#f8fafc", fontSize: "22px", display: "block", marginTop: "4px" }}>
                {overview?.performance?.utilizationRate !== null && overview?.performance?.utilizationRate !== undefined
                  ? `${overview.performance.utilizationRate}%`
                  : "—"}
              </strong>
            </div>
          </div>
        </SpotlightCard>
      </section>
    </div>
  );
}
