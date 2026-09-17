/* Hallmark · macrostructure: Staff Waitlist Operations Desk · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 * Authoritative Backend Integration: PostgreSQL BookingHolds, Offer Revocation, Smart Reschedule, Realtime SSE
 */
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Clock,
  ShieldCheck,
  Zap,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  X,
  Calendar,
  MapPin,
  User,
  Users,
  Sparkles,
  Filter,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  RotateCcw,
  UserPlus,
  Search,
  Lock,
  Phone,
  Mail,
  Trash2,
} from "lucide-react";
import { PageHeader } from "../../../components/shell/app-shell";
import { GlassCard, GlassBadge } from "../../../components/glass-card";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch } from "../../../lib/api-client";
import { useRealtimeEvents } from "../../../lib/use-realtime-events";
import { formatCurrency } from "../../../lib/currency-utils";
import { WaitlistHoldBlockDto } from "@bookpro/contracts";

interface WaitlistEntry {
  id: string;
  organizationId: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  serviceId: string;
  serviceName?: string;
  serviceDurationMin?: number;
  servicePriceCents?: number;
  locationId?: string | null;
  locationName?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  allowFallbackStaff: boolean;
  startWindowDate: string;
  endWindowDate: string;
  timePreference: "ANY" | "MORNING" | "AFTERNOON" | "EVENING";
  partySize: number;
  priorityScore?: number;
  notes?: string | null;
  status: "ACTIVE" | "OFFERED" | "BOOKED" | "EXPIRED" | "CANCELLED";
  expiresAt?: string | null;
  createdAt: string;
}

interface ServiceItem {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  currency?: string;
}

interface StaffItem {
  id: string;
  displayName: string;
}

export default function WaitlistPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId || "";
  const orgCurrency = user?.currency || "USD";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

  const { isConnected: isRealtimeLive, lastEvent } = useRealtimeEvents(orgId);

  // Data State
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [holds, setHolds] = useState<WaitlistHoldBlockDto[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [staffList, setStaffList] = useState<StaffItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedHoldId, setCopiedHoldId] = useState<string | null>(null);

  // Manual Offer Modal
  const [selectedEntryForOffer, setSelectedEntryForOffer] = useState<WaitlistEntry | null>(null);
  const [offerStartTime, setOfferStartTime] = useState<string>("");
  const [offerEndTime, setOfferEndTime] = useState<string>("");
  const [offerStaffId, setOfferStaffId] = useState<string>("");
  const [offerExpiryMinutes, setOfferExpiryMinutes] = useState<number>(15);
  const [offerSubmitting, setOfferSubmitting] = useState<boolean>(false);
  const [offerMessage, setOfferMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Revoke Hold Modal
  const [holdToRevoke, setHoldToRevoke] = useState<WaitlistHoldBlockDto | null>(null);
  const [revokeReason, setRevokeReason] = useState<string>("Staff schedule rearrangement");
  const [revoking, setRevoking] = useState<boolean>(false);

  // Add Customer Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newCustomerName, setNewCustomerName] = useState<string>("");
  const [newCustomerEmail, setNewCustomerEmail] = useState<string>("");
  const [newCustomerPhone, setNewCustomerPhone] = useState<string>("");
  const [newServiceId, setNewServiceId] = useState<string>("");
  const [newStaffId, setNewStaffId] = useState<string>("");
  const [newStartDate, setNewStartDate] = useState<string>("");
  const [newEndDate, setNewEndDate] = useState<string>("");
  const [newTimePref, setNewTimePref] = useState<"ANY" | "MORNING" | "AFTERNOON" | "EVENING">("ANY");
  const [newPartySize, setNewPartySize] = useState<number>(1);
  const [newNotes, setNewNotes] = useState<string>("");
  const [addSubmitting, setAddSubmitting] = useState<boolean>(false);

  // Timer Tick for active holds
  const [nowMs, setNowMs] = useState<number>(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Entries & Active Holds
  const fetchAllData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (statusFilter !== "ALL" && statusFilter !== "SMART_RESCHEDULE") {
        queryParams.append("status", statusFilter);
      }
      if (searchQuery) queryParams.append("search", searchQuery);

      const [entriesRes, holdsRes] = await Promise.all([
        apiFetch<{ items: WaitlistEntry[]; total: number }>(`/organizations/${orgId}/waitlist/entries?${queryParams.toString()}`, {}, orgId),
        apiFetch<WaitlistHoldBlockDto[]>(`/organizations/${orgId}/waitlist/holds`, {}, orgId),
      ]);

      if (entriesRes.success && entriesRes.data) {
        setEntries(entriesRes.data.items || []);
      } else {
        setEntries([]);
      }
      if (holdsRes.success && Array.isArray(holdsRes.data)) {
        setHolds(holdsRes.data);
      } else {
        setHolds([]);
      }
    } catch (err) {
      console.error("Failed to fetch waitlist operations data", err);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, orgId, statusFilter, searchQuery]);

  const fetchMetadata = useCallback(async () => {
    if (!orgId) return;
    try {
      const [srvRes, stfRes] = await Promise.all([
        apiFetch<ServiceItem[]>("/services", {}, orgId),
        apiFetch<StaffItem[]>("/staff", {}, orgId),
      ]);
      if (srvRes.success && Array.isArray(srvRes.data)) {
        setServices(srvRes.data);
        if (srvRes.data.length > 0 && !newServiceId) {
          setNewServiceId(srvRes.data[0].id);
        }
      }
      if (stfRes.success && Array.isArray(stfRes.data)) {
        setStaffList(stfRes.data);
      }
    } catch (err) {
      console.error("Failed to load waitlist metadata", err);
    }
  }, [apiUrl, orgId, newServiceId]);

  useEffect(() => {
    fetchAllData();
    fetchMetadata();
  }, [fetchAllData, fetchMetadata]);

  // Handle Real-time SSE updates
  useEffect(() => {
    if (
      lastEvent &&
      (lastEvent.type.startsWith("waitlist.") ||
        lastEvent.type.startsWith("appointment.") ||
        lastEvent.type.startsWith("booking_hold.") ||
        lastEvent.type.startsWith("optimizer.") ||
        lastEvent.type.startsWith("schedule."))
    ) {
      fetchAllData();
    }
  }, [lastEvent, fetchAllData]);

  // Format hold countdown
  const getHoldSecondsLeft = (expiresAtStr: string) => {
    const diff = Math.floor((new Date(expiresAtStr).getTime() - nowMs) / 1000);
    return Math.max(0, diff);
  };

  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return "Expired (Sweeping...)";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s < 10 ? "0" : ""}${s}s`;
  };

  // Open Offer Modal
  const handleOpenOfferModal = (entry: WaitlistEntry) => {
    setSelectedEntryForOffer(entry);
    const startDefault = new Date(Date.now() + 2 * 3600 * 1000);
    const endDefault = new Date(startDefault.getTime() + (entry.serviceDurationMin || 30) * 60 * 1000);

    const formatToLocalInput = (d: Date) => {
      const pad = (n: number) => (n < 10 ? "0" + n : n);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setOfferStartTime(formatToLocalInput(startDefault));
    setOfferEndTime(formatToLocalInput(endDefault));
    setOfferStaffId(entry.staffId || (staffList[0]?.id || ""));
    setOfferExpiryMinutes(15);
    setOfferMessage(null);
  };

  // Submit Manual Offer
  const handleSubmitOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntryForOffer || !offerStartTime || !offerEndTime) return;
    setOfferSubmitting(true);
    setOfferMessage(null);
    try {
      const payload = {
        waitlistEntryId: selectedEntryForOffer.id,
        startAt: new Date(offerStartTime).toISOString(),
        endAt: new Date(offerEndTime).toISOString(),
        staffId: offerStaffId || undefined,
        expiresInMinutes: offerExpiryMinutes,
      };
      const res = await apiFetch(`/organizations/${orgId}/waitlist/offers`, {
        method: "POST",
        body: JSON.stringify(payload),
      }, orgId);

      if (res.success) {
        setOfferMessage({
          type: "success",
          text: "✓ Fast-Pass offer created and slot locked via PostgreSQL BookingHold.",
        });
        await fetchAllData();
        setTimeout(() => setSelectedEntryForOffer(null), 1500);
      } else {
        setOfferMessage({
          type: "error",
          text: res.error?.message || "Failed to create waitlist offer.",
        });
      }
    } catch {
      setOfferMessage({ type: "error", text: "Network error creating offer." });
    } finally {
      setOfferSubmitting(false);
    }
  };

  // Revoke Hold Action
  const handleConfirmRevoke = async () => {
    if (!holdToRevoke || !holdToRevoke.offerId) return;
    setRevoking(true);
    try {
      const res = await apiFetch(`/organizations/${orgId}/waitlist/offers/${holdToRevoke.offerId}/revoke`, {
        method: "POST",
      }, orgId);
      if (res.success) {
        setHoldToRevoke(null);
        await fetchAllData();
      } else {
        alert(res.error?.message || "Failed to revoke hold.");
      }
    } catch {
      alert("Network error revoking hold.");
    } finally {
      setRevoking(false);
    }
  };

  // Copy Claim Link
  const handleCopyClaimLink = (hold: WaitlistHoldBlockDto) => {
    const url = `${window.location.origin}/offers/claim?token=${hold.offerId || hold.id}`;
    navigator.clipboard.writeText(url);
    setCopiedHoldId(hold.id);
    setTimeout(() => setCopiedHoldId(null), 3000);
  };

  // Remove Entry from Queue
  const handleRemoveEntry = async (id: string) => {
    if (!confirm("Are you sure you want to remove this client from the priority waitlist?")) return;
    try {
      const res = await apiFetch(`/organizations/${orgId}/waitlist/entries/${id}`, {
        method: "DELETE",
      }, orgId);
      if (res.success) {
        await fetchAllData();
      } else {
        alert(res.error?.message || "Failed to remove entry.");
      }
    } catch {
      alert("Failed to remove entry.");
    }
  };

  // Submit Add to Waitlist
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName || !newCustomerEmail || !newServiceId) {
      alert("Name, email, and service are required.");
      return;
    }
    setAddSubmitting(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const thirtyDays = new Date(Date.now() + 30 * 86400 * 1000).toISOString().split("T")[0];

      const payload = {
        guestName: newCustomerName.trim(),
        guestEmail: newCustomerEmail.trim().toLowerCase(),
        guestPhone: newCustomerPhone.trim() || undefined,
        serviceId: newServiceId,
        staffId: newStaffId || undefined,
        startWindowDate: newStartDate || today,
        endWindowDate: newEndDate || thirtyDays,
        timePreference: newTimePref,
        partySize: Number(newPartySize),
        notes: newNotes.trim() || undefined,
      };

      const res = await apiFetch(`/organizations/${orgId}/waitlist/entries`, {
        method: "POST",
        body: JSON.stringify(payload),
      }, orgId);

      if (res.success) {
        setIsAddModalOpen(false);
        setNewCustomerName("");
        setNewCustomerEmail("");
        setNewCustomerPhone("");
        setNewNotes("");
        await fetchAllData();
      } else {
        alert(res.error?.message || "Failed to add waitlist entry.");
      }
    } catch {
      alert("Network error adding to waitlist.");
    } finally {
      setAddSubmitting(false);
    }
  };

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (statusFilter === "SMART_RESCHEDULE") {
        return e.notes?.toLowerCase().includes("reschedule") || e.notes?.toLowerCase().includes("prior appt");
      }
      if (statusFilter !== "ALL" && e.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (e.customerName && e.customerName.toLowerCase().includes(q)) ||
        (e.customerEmail && e.customerEmail.toLowerCase().includes(q)) ||
        (e.serviceName && e.serviceName.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q))
      );
    });
  }, [entries, statusFilter, searchQuery]);

  const activeHoldCount = holds.length;
  const rescheduleCount = entries.filter((e) => e.notes?.toLowerCase().includes("reschedule")).length;

  return (
    <div style={{ display: "grid", gap: "28px", maxWidth: "1400px", margin: "0 auto", paddingBottom: "60px" }}>
      {/* PAGE HEADER */}
      <PageHeader
        title="Waitlist Operations Desk"
        description="Real-time queue prioritization, authoritative PostgreSQL BookingHolds, and smart rescheduling."
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            {/* Live SSE Badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 14px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: 700,
                backgroundColor: isRealtimeLive ? "rgba(16, 185, 129, 0.12)" : "rgba(245, 158, 11, 0.12)",
                border: `1px solid ${isRealtimeLive ? "rgba(16, 185, 129, 0.35)" : "rgba(245, 158, 11, 0.35)"}`,
                color: isRealtimeLive ? "#34d399" : "#fbbf24",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: isRealtimeLive ? "#10b981" : "#f59e0b",
                  boxShadow: isRealtimeLive ? "0 0 10px rgba(16, 185, 129, 0.8)" : "none",
                }}
              />
              <span>{isRealtimeLive ? "Real-time Live Sync" : "Connecting..."}</span>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={fetchAllData}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "10px",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#cbd5e1",
                fontSize: "13px",
                fontWeight: 650,
                cursor: "pointer",
              }}
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>

            {/* Add Client Button */}
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 18px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #0284c7, #0369a1)",
                border: "1px solid #38bdf8",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 750,
                cursor: "pointer",
                boxShadow: "0 4px 16px rgba(2, 132, 199, 0.35)",
              }}
            >
              <UserPlus size={15} />
              <span>Add to Waitlist</span>
            </button>
          </div>
        }
      />

      {/* ACTIVE BOOKINGHOLD TRAY */}
      {holds.length > 0 && (
        <GlassCard
          variant="panel"
          glow="primary"
          style={{
            padding: "24px",
            border: "1px solid rgba(56, 189, 248, 0.4)",
            background: "radial-gradient(ellipse at 50% 0%, rgba(56, 189, 248, 0.12) 0%, rgba(10, 16, 28, 0.95) 80%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(56, 189, 248, 0.2)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Lock size={16} color="#38bdf8" />
              </div>
              <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                Active BookingHolds (PostgreSQL Concurrency Locks)
              </h3>
            </div>

            <GlassBadge variant="warning" size="md">
              {holds.length} Active Slot Reservation{holds.length > 1 ? "s" : ""}
            </GlassBadge>
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            {holds.map((hold) => {
              const secondsLeft = getHoldSecondsLeft(hold.expiresAt);
              const isCopied = copiedHoldId === hold.id;

              return (
                <div
                  key={hold.id}
                  style={{
                    backgroundColor: "rgba(15, 23, 42, 0.75)",
                    border: "1px solid rgba(56, 189, 248, 0.25)",
                    borderRadius: "12px",
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "16px",
                  }}
                >
                  <div style={{ display: "grid", gap: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "15px", fontWeight: 750, color: "#f8fafc" }}>
                        {new Date(hold.startAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                        {" · "}
                        {new Date(hold.startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        {" – "}
                        {new Date(hold.endAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>

                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "9999px",
                          fontSize: "11px",
                          fontWeight: 800,
                          backgroundColor: secondsLeft > 180 ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                          color: secondsLeft > 180 ? "#34d399" : "#f87171",
                          border: `1px solid ${secondsLeft > 180 ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)"}`,
                          fontFamily: "monospace",
                        }}
                      >
                        ⏳ {formatCountdown(secondsLeft)}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "12px", color: "#94a3b8" }}>
                      {hold.staffName && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <User size={13} color="#94a3b8" />
                          Specialist: <strong style={{ color: "#e2e8f0" }}>{hold.staffName}</strong>
                        </span>
                      )}
                      {hold.serviceName && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          Service: <strong style={{ color: "#e2e8f0" }}>{hold.serviceName}</strong>
                        </span>
                      )}
                      <span style={{ color: "#64748b" }}>Hold Ref: #{hold.id.slice(0, 8)}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => handleCopyClaimLink(hold)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "7px 14px",
                        borderRadius: "8px",
                        backgroundColor: isCopied ? "rgba(16, 185, 129, 0.2)" : "rgba(56, 189, 248, 0.15)",
                        border: isCopied ? "1px solid #34d399" : "1px solid rgba(56, 189, 248, 0.35)",
                        color: isCopied ? "#34d399" : "#38bdf8",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {isCopied ? <Check size={14} /> : <Copy size={14} />}
                      <span>{isCopied ? "Fast-Pass Link Copied!" : "Copy Fast-Pass Link"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setHoldToRevoke(hold)}
                      style={{
                        padding: "7px 14px",
                        borderRadius: "8px",
                        backgroundColor: "rgba(239, 68, 68, 0.15)",
                        border: "1px solid rgba(239, 68, 68, 0.35)",
                        color: "#f87171",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Revoke Hold
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* 4-COLUMN KPI METRIC CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
        {/* Metric 1 */}
        <GlassCard variant="card" glow="subtle" style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Active in Queue
            </span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "rgba(56, 189, 248, 0.12)", display: "grid", placeItems: "center" }}>
              <Users size={16} color="#38bdf8" />
            </div>
          </div>
          <div style={{ fontSize: "26px", fontWeight: 850, color: "#f8fafc", letterSpacing: "-0.02em" }}>
            {entries.filter((e) => e.status === "ACTIVE" || e.status === "OFFERED").length}
          </div>
          <span style={{ fontSize: "12px", color: "#64748b", marginTop: "4px", display: "block" }}>
            Clients actively awaiting availability
          </span>
        </GlassCard>

        {/* Metric 2 */}
        <GlassCard variant="card" glow="subtle" style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Active BookingHolds
            </span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "rgba(245, 158, 11, 0.12)", display: "grid", placeItems: "center" }}>
              <Lock size={16} color="#fbbf24" />
            </div>
          </div>
          <div style={{ fontSize: "26px", fontWeight: 850, color: "#f8fafc", letterSpacing: "-0.02em" }}>
            {activeHoldCount}
          </div>
          <span style={{ fontSize: "12px", color: "#64748b", marginTop: "4px", display: "block" }}>
            Slots locked by Fast-Pass offers
          </span>
        </GlassCard>

        {/* Metric 3 */}
        <GlassCard variant="card" glow="subtle" style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Smart Reschedules
            </span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "rgba(168, 85, 247, 0.12)", display: "grid", placeItems: "center" }}>
              <RotateCcw size={16} color="#c084fc" />
            </div>
          </div>
          <div style={{ fontSize: "26px", fontWeight: 850, color: "#f8fafc", letterSpacing: "-0.02em" }}>
            {rescheduleCount}
          </div>
          <span style={{ fontSize: "12px", color: "#64748b", marginTop: "4px", display: "block" }}>
            Earlier-slot requests prioritized
          </span>
        </GlassCard>

        {/* Metric 4 */}
        <GlassCard variant="card" glow="subtle" style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Booked / Converted
            </span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "rgba(16, 185, 129, 0.12)", display: "grid", placeItems: "center" }}>
              <CheckCircle2 size={16} color="#34d399" />
            </div>
          </div>
          <div style={{ fontSize: "26px", fontWeight: 850, color: "#f8fafc", letterSpacing: "-0.02em" }}>
            {entries.filter((e) => e.status === "BOOKED").length}
          </div>
          <span style={{ fontSize: "12px", color: "#64748b", marginTop: "4px", display: "block" }}>
            Successfully recovered into appointments
          </span>
        </GlassCard>
      </div>

      {/* SEARCH AND FILTERS BAR */}
      <GlassCard variant="panel" glow="none" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          {/* Search Input */}
          <div style={{ position: "relative", flex: 1, minWidth: "260px" }}>
            <Search size={16} color="#64748b" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="text"
              placeholder="Search client name, email, phone, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 36px",
                borderRadius: "8px",
                backgroundColor: "rgba(15, 23, 42, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "#f8fafc",
                fontSize: "13px",
                outline: "none",
              }}
            />
          </div>

          {/* Status Tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            {[
              { id: "ALL", label: "All Records" },
              { id: "ACTIVE", label: "Active Queue" },
              { id: "OFFERED", label: "Hold Offered" },
              { id: "SMART_RESCHEDULE", label: "Reschedules" },
              { id: "BOOKED", label: "Booked" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  border: statusFilter === tab.id ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.08)",
                  backgroundColor: statusFilter === tab.id ? "rgba(56, 189, 248, 0.15)" : "transparent",
                  color: statusFilter === tab.id ? "#38bdf8" : "#94a3b8",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* QUEUE LIST */}
      <div style={{ display: "grid", gap: "12px" }}>
        {loading ? (
          <GlassCard variant="panel" style={{ padding: "40px", textAlign: "center" }}>
            <RefreshCw size={24} color="#38bdf8" style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
            <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>Refreshing waitlist operations data...</p>
          </GlassCard>
        ) : filteredEntries.length === 0 ? (
          <GlassCard variant="panel" style={{ padding: "48px 32px", textAlign: "center" }}>
            <Users size={32} color="#64748b" style={{ margin: "0 auto 12px" }} />
            <strong style={{ fontSize: "15px", color: "#f8fafc", display: "block" }}>No waitlist entries found</strong>
            <p style={{ color: "#64748b", fontSize: "13px", margin: "4px 0 0" }}>
              {searchQuery || statusFilter !== "ALL"
                ? "Try clearing your filters or search query."
                : "No clients currently waiting in line. Add a client using the button above."}
            </p>
          </GlassCard>
        ) : (
          filteredEntries.map((entry, idx) => {
            const isReschedule = entry.notes?.toLowerCase().includes("reschedule") || entry.notes?.toLowerCase().includes("prior appt");
            const isOffered = entry.status === "OFFERED";

            return (
              <GlassCard
                key={entry.id}
                variant="card"
                glow={isOffered ? "primary" : "subtle"}
                style={{
                  padding: "18px 24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "16px",
                }}
              >
                {/* Left Client Info */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                  {/* Seniority Rank */}
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      backgroundColor: idx === 0 ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.06)",
                      border: `1px solid ${idx === 0 ? "rgba(16, 185, 129, 0.4)" : "rgba(255, 255, 255, 0.1)"}`,
                      display: "grid",
                      placeItems: "center",
                      fontSize: "13px",
                      fontWeight: 800,
                      color: idx === 0 ? "#34d399" : "#94a3b8",
                      flexShrink: 0,
                    }}
                  >
                    #{idx + 1}
                  </div>

                  <div style={{ display: "grid", gap: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "15px", color: "#f8fafc" }}>
                        {entry.customerName || "Waitlist Client"}
                      </strong>

                      {isReschedule && (
                        <GlassBadge variant="purple" size="sm">
                          ⚡ Smart Reschedule Request
                        </GlassBadge>
                      )}

                      <GlassBadge
                        variant={entry.status === "BOOKED" ? "success" : entry.status === "OFFERED" ? "warning" : "default"}
                        size="sm"
                      >
                        {entry.status}
                      </GlassBadge>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "12px", color: "#94a3b8", flexWrap: "wrap" }}>
                      {entry.customerEmail && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <Mail size={12} color="#64748b" />
                          {entry.customerEmail}
                        </span>
                      )}
                      {entry.customerPhone && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <Phone size={12} color="#64748b" />
                          {entry.customerPhone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Center Service / Requirements */}
                <div style={{ display: "grid", gap: "4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#e2e8f0" }}>
                      {entry.serviceName || "Service Session"}
                    </span>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      ({entry.serviceDurationMin || 30}m · {formatCurrency(entry.servicePriceCents || 0, orgCurrency)})
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "12px", color: "#64748b" }}>
                    <span>Specialist: <strong style={{ color: "#94a3b8" }}>{entry.staffName || "Any Practitioner"}</strong></span>
                    <span>Window: <strong style={{ color: "#94a3b8" }}>{entry.startWindowDate} – {entry.endWindowDate}</strong></span>
                    <span>Time: <strong style={{ color: "#94a3b8" }}>{entry.timePreference}</strong></span>
                  </div>
                </div>

                {/* Right Action Buttons */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {entry.status === "ACTIVE" && (
                    <button
                      type="button"
                      onClick={() => handleOpenOfferModal(entry)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "7px 16px",
                        borderRadius: "8px",
                        background: "linear-gradient(135deg, #0284c7, #0369a1)",
                        border: "1px solid #38bdf8",
                        color: "#ffffff",
                        fontSize: "12px",
                        fontWeight: 750,
                        cursor: "pointer",
                      }}
                    >
                      <Zap size={14} />
                      <span>Manual Offer</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRemoveEntry(entry.id)}
                    style={{
                      padding: "7px 10px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "#94a3b8",
                      cursor: "pointer",
                    }}
                    title="Remove from waitlist"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </GlassCard>
            );
          })
        )}
      </div>

      {/* CREATE MANUAL OFFER MODAL */}
      {selectedEntryForOffer && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(3, 7, 18, 0.85)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            zIndex: 100,
            display: "grid",
            placeItems: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "520px",
              backgroundColor: "rgba(11, 17, 27, 0.96)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              borderRadius: "20px",
              padding: "28px",
              boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
              display: "grid",
              gap: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                  Create Fast-Pass Hold Offer
                </h3>
                <span style={{ fontSize: "12px", color: "#64748b" }}>
                  Client: {selectedEntryForOffer.customerName} ({selectedEntryForOffer.serviceName})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntryForOffer(null)}
                style={{ background: "none", border: 0, color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            {offerMessage && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 650,
                  backgroundColor: offerMessage.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  color: offerMessage.type === "success" ? "#34d399" : "#f87171",
                  border: `1px solid ${offerMessage.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                }}
              >
                {offerMessage.text}
              </div>
            )}

            <form onSubmit={handleSubmitOffer} style={{ display: "grid", gap: "16px" }}>
              {/* Slot Start & End */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ display: "grid", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Slot Start Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={offerStartTime}
                    onChange={(e) => setOfferStartTime(e.target.value)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#f8fafc",
                      fontSize: "13px",
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Slot End Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={offerEndTime}
                    onChange={(e) => setOfferEndTime(e.target.value)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#f8fafc",
                      fontSize: "13px",
                    }}
                  />
                </div>
              </div>

              {/* Staff Practitioner */}
              <div style={{ display: "grid", gap: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Assigned Specialist</label>
                <select
                  value={offerStaffId}
                  onChange={(e) => setOfferStaffId(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(15, 23, 42, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#f8fafc",
                    fontSize: "13px",
                  }}
                >
                  <option value="">Any Available Specialist</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Hold Duration */}
              <div style={{ display: "grid", gap: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>
                  Hold Duration (Client Confirmation Window)
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                  {[10, 15, 30, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setOfferExpiryMinutes(mins)}
                      style={{
                        padding: "8px",
                        borderRadius: "8px",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                        border: offerExpiryMinutes === mins ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.1)",
                        backgroundColor: offerExpiryMinutes === mins ? "rgba(56, 189, 248, 0.2)" : "rgba(15, 23, 42, 0.6)",
                        color: offerExpiryMinutes === mins ? "#38bdf8" : "#94a3b8",
                      }}
                    >
                      {mins} mins
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(56, 189, 248, 0.08)",
                  border: "1px solid rgba(56, 189, 248, 0.2)",
                  fontSize: "12px",
                  color: "#7dd3fc",
                  lineHeight: 1.5,
                }}
              >
                🔒 Dispatching this offer creates an atomic PostgreSQL <code>BookingHold</code> lock. No other client or staff can claim this slot while the hold is active.
              </div>

              {/* Actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setSelectedEntryForOffer(null)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: "#cbd5e1",
                    fontSize: "13px",
                    fontWeight: 650,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={offerSubmitting}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "8px",
                    background: "linear-gradient(135deg, #0284c7, #0369a1)",
                    border: "1px solid #38bdf8",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 750,
                    cursor: offerSubmitting ? "not-allowed" : "pointer",
                  }}
                >
                  {offerSubmitting ? "Locking Slot..." : "Lock & Dispatch Hold"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVOKE HOLD MODAL */}
      {holdToRevoke && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(3, 7, 18, 0.85)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            zIndex: 100,
            display: "grid",
            placeItems: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "460px",
              backgroundColor: "rgba(11, 17, 27, 0.96)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "20px",
              padding: "24px",
              boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
              display: "grid",
              gap: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <AlertTriangle size={20} color="#f87171" />
              <h3 style={{ fontSize: "17px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                Revoke BookingHold Lock
              </h3>
            </div>

            <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0, lineHeight: 1.5 }}>
              This will immediately release the PostgreSQL slot lock, cancel the client's Fast-Pass claim token, and return the slot to the gap recovery engine.
            </p>

            <div style={{ display: "grid", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Reason for Revocation</label>
              <input
                type="text"
                required
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: "#f8fafc",
                  fontSize: "13px",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setHoldToRevoke(null)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: "#cbd5e1",
                  fontSize: "13px",
                  fontWeight: 650,
                  cursor: "pointer",
                }}
              >
                Keep Hold
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                disabled={revoking}
                style={{
                  padding: "8px 20px",
                  borderRadius: "8px",
                  backgroundColor: "#ef4444",
                  border: 0,
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 750,
                  cursor: revoking ? "not-allowed" : "pointer",
                }}
              >
                {revoking ? "Revoking..." : "Confirm Revocation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD TO WAITLIST MODAL */}
      {isAddModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(3, 7, 18, 0.85)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            zIndex: 100,
            display: "grid",
            placeItems: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "540px",
              backgroundColor: "rgba(11, 17, 27, 0.96)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              borderRadius: "20px",
              padding: "28px",
              boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
              display: "grid",
              gap: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <UserPlus size={20} color="#38bdf8" />
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                  Add Client to Priority Waitlist
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: "none", border: 0, color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} style={{ display: "grid", gap: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ display: "grid", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Client Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Jane Doe"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#f8fafc",
                      fontSize: "13px",
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Client Email</label>
                  <input
                    type="email"
                    required
                    placeholder="jane@example.com"
                    value={newCustomerEmail}
                    onChange={(e) => setNewCustomerEmail(e.target.value)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#f8fafc",
                      fontSize: "13px",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ display: "grid", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Client Phone</label>
                  <input
                    type="tel"
                    placeholder="+1 555-0199"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#f8fafc",
                      fontSize: "13px",
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Service Required</label>
                  <select
                    required
                    value={newServiceId}
                    onChange={(e) => setNewServiceId(e.target.value)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#f8fafc",
                      fontSize: "13px",
                    }}
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.durationMin}m)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ display: "grid", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Preferred Practitioner</label>
                  <select
                    value={newStaffId}
                    onChange={(e) => setNewStaffId(e.target.value)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#f8fafc",
                      fontSize: "13px",
                    }}
                  >
                    <option value="">Any Available Specialist</option>
                    {staffList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "grid", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Time of Day Preference</label>
                  <select
                    value={newTimePref}
                    onChange={(e) => setNewTimePref(e.target.value as any)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#f8fafc",
                      fontSize: "13px",
                    }}
                  >
                    <option value="ANY">Any Time of Day</option>
                    <option value="MORNING">Morning (08:00 – 12:00)</option>
                    <option value="AFTERNOON">Afternoon (12:00 – 17:00)</option>
                    <option value="EVENING">Evening (17:00 – 21:00)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gap: "4px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Internal Notes</label>
                <textarea
                  rows={2}
                  placeholder="Preferences, referral source, or rescheduling notes..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(15, 23, 42, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#f8fafc",
                    fontSize: "13px",
                    resize: "none",
                  }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: "#cbd5e1",
                    fontSize: "13px",
                    fontWeight: 650,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addSubmitting}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "8px",
                    background: "linear-gradient(135deg, #0284c7, #0369a1)",
                    border: "1px solid #38bdf8",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 750,
                    cursor: addSubmitting ? "not-allowed" : "pointer",
                  }}
                >
                  {addSubmitting ? "Joining Queue..." : "Add to Priority Queue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
