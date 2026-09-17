/* Hallmark · macrostructure: Customer Waitlist & Fast-Pass Hub · genre: modern-minimal · theme: Midnight
 * Phase P9 — Autonomous Waitlist & Schedule Optimizer
 */
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { ProtectedRoute } from "../../../components/protected-route";
import { apiFetch } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { useRealtimeEvents } from "../../../lib/use-realtime-events";
import { GlassCard, GlassBadge } from "../../../components/glass-card";
import { CustomerPortalShell } from "../../../components/shell/customer-portal-shell";
import {
    Calendar,
    Clock,
    MapPin,
    ArrowRight,
    RefreshCw,
    XCircle,
    AlertCircle,
    User,
    CheckCircle2,
    Sparkles,
    Check,
} from "../../../components/icons";
import { Button, Card, Badge } from "@bookpro/ui";
import { CustomerActiveOfferDto, WaitlistEntryDto } from "@bookpro/contracts";

interface OrganizationInfo {
    id: string;
    name: string;
    slug: string;
    currency: string;
}

export default function CustomerWaitlistPage() {
    return (
        <ProtectedRoute>
            <CustomerWaitlistContent />
        </ProtectedRoute>
    );
}

function CustomerWaitlistContent() {
    const params = useParams();
    const router = useRouter();
    const tenant = (params?.tenant as string) || "";
    const { user } = useAuth();

    const [organization, setOrganization] = useState<OrganizationInfo | null>(null);
    const [activeOffers, setActiveOffers] = useState<CustomerActiveOfferDto[]>([]);
    const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntryDto[]>([]);
    const [services, setServices] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

    // Join Waitlist Modal / Form State
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
    const [selectedServiceId, setSelectedServiceId] = useState("");
    const [selectedLocationId, setSelectedLocationId] = useState("");
    const [startWindowDate, setStartWindowDate] = useState(() => new Date().toISOString().split("T")[0]);
    const [endWindowDate, setEndWindowDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return d.toISOString().split("T")[0];
    });
    const [timePreference, setTimePreference] = useState<"ANY" | "MORNING" | "AFTERNOON" | "EVENING">("ANY");
    const [submittingJoin, setSubmittingJoin] = useState(false);

    // Decline Offer Modal State
    const [selectedDeclineOffer, setSelectedDeclineOffer] = useState<CustomerActiveOfferDto | null>(null);
    const [declineReason, setDeclineReason] = useState("");
    const [removeFromWaitlist, setRemoveFromWaitlist] = useState(false);
    const [declining, setDeclining] = useState(false);

    // Live Timers State
    const [nowTimestamp, setNowTimestamp] = useState(Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNowTimestamp(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    // 1. Fetch Organization Context
    useEffect(() => {
        if (!tenant) return;
        apiFetch<OrganizationInfo>(`/organizations/public/${tenant}`)
            .then((res) => {
                if (res.success && res.data) {
                    setOrganization(res.data);
                }
            })
            .catch(() => null);
    }, [tenant]);

    const orgId = organization?.id || user?.organizationId || "";

    // 2. Load Customer Waitlist Data
    const loadWaitlistData = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        setError(null);
        try {
            const [offersRes, entriesRes, servicesRes, locationsRes] = await Promise.all([
                apiFetch<CustomerActiveOfferDto[]>("/waitlist/offers/my", {}, orgId),
                apiFetch<WaitlistEntryDto[]>("/waitlist/entries/my", {}, orgId),
                apiFetch<any[]>(`/services?organizationId=${orgId}&activeOnly=true`, {}, orgId),
                apiFetch<any[]>(`/locations?organizationId=${orgId}`, {}, orgId),
            ]);

            if (offersRes.success && Array.isArray(offersRes.data)) {
                setActiveOffers(offersRes.data);
            }
            if (entriesRes.success && Array.isArray(entriesRes.data)) {
                setWaitlistEntries(entriesRes.data);
            }
            if (servicesRes.success && Array.isArray(servicesRes.data)) {
                setServices(servicesRes.data);
                if (servicesRes.data.length > 0 && !selectedServiceId) {
                    setSelectedServiceId(servicesRes.data[0].id);
                }
            }
            if (locationsRes.success && Array.isArray(locationsRes.data)) {
                setLocations(locationsRes.data);
                if (locationsRes.data.length > 0 && !selectedLocationId) {
                    setSelectedLocationId(locationsRes.data[0].id);
                }
            }
        } catch (err: any) {
            setError(err.message || "Failed to load waitlist information.");
        } finally {
            setLoading(false);
        }
    }, [orgId, selectedServiceId, selectedLocationId]);

    useEffect(() => {
        if (orgId) {
            loadWaitlistData();
        }
    }, [orgId, loadWaitlistData]);

    // Real-time SSE Live Refresh
    useRealtimeEvents(orgId, {
        onEvent: (hint) => {
            if (hint.type.startsWith("waitlist.") || hint.type.startsWith("appointment.")) {
                loadWaitlistData();
            }
        },
    });

    // Handle Join Waitlist Submission
    const handleJoinWaitlist = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgId || !selectedServiceId) return;
        setSubmittingJoin(true);
        setActionMessage(null);

        try {
            const res = await apiFetch<WaitlistEntryDto>("/waitlist/entries", {
                method: "POST",
                body: JSON.stringify({
                    serviceId: selectedServiceId,
                    locationId: selectedLocationId || undefined,
                    startWindowDate,
                    endWindowDate,
                    timePreference,
                    allowFallbackStaff: true,
                    partySize: 1,
                }),
            }, orgId);

            if (res.success) {
                setActionMessage({ text: "Successfully joined the priority waitlist! We will alert you immediately when an opening appears.", type: "success" });
                setIsJoinModalOpen(false);
                loadWaitlistData();
            } else {
                setActionMessage({ text: res.error?.message || "Failed to join waitlist.", type: "error" });
            }
        } catch (err: any) {
            setActionMessage({ text: err.message || "Network error while joining waitlist.", type: "error" });
        } finally {
            setSubmittingJoin(false);
        }
    };

    // Handle Decline Offer
    const handleConfirmDecline = async () => {
        if (!selectedDeclineOffer) return;
        setDeclining(true);
        try {
            const res = await apiFetch<{ success: boolean; message: string }>("/waitlist/offers/decline", {
                method: "POST",
                body: JSON.stringify({
                    token: selectedDeclineOffer.token,
                    reason: declineReason || undefined,
                    removeFromWaitlist,
                }),
            }, orgId);

            if (res.success) {
                setActionMessage({ text: res.data?.message || "Offer declined.", type: "success" });
                setSelectedDeclineOffer(null);
                setDeclineReason("");
                loadWaitlistData();
            } else {
                setActionMessage({ text: res.error?.message || "Failed to decline offer.", type: "error" });
            }
        } catch (err: any) {
            setActionMessage({ text: err.message || "Error declining offer.", type: "error" });
        } finally {
            setDeclining(false);
        }
    };

    // Handle Cancel Waitlist Entry
    const handleCancelEntry = async (entryId: string) => {
        if (!confirm("Are you sure you want to cancel this waitlist request?")) return;
        try {
            const res = await apiFetch(`/waitlist/entries/${entryId}`, {
                method: "DELETE",
            }, orgId);

            if (res.success) {
                setActionMessage({ text: "Waitlist request cancelled.", type: "success" });
                loadWaitlistData();
            } else {
                setActionMessage({ text: res.error?.message || "Failed to cancel waitlist request.", type: "error" });
            }
        } catch (err: any) {
            setActionMessage({ text: err.message || "Error cancelling request.", type: "error" });
        }
    };

    const formatCountdown = (expiresAtStr: string) => {
        const diff = Math.max(0, Math.floor((new Date(expiresAtStr).getTime() - nowTimestamp) / 1000));
        const m = Math.floor(diff / 60);
        const s = diff % 60;
        return `${m}:${s < 10 ? "0" : ""}${s}`;
    };

    return (
        <CustomerPortalShell
            tenantSlug={tenant}
            organizationName={organization?.name || "Studio Portal"}
            activeNav="waitlist"
        >
            <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "24px 16px" }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px", flexWrap: "wrap", gap: "16px" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span style={{ fontSize: "24px" }}>⚡</span>
                            <h1 style={{ fontSize: "28px", fontWeight: "800", color: "#ffffff", letterSpacing: "-0.02em", margin: 0 }}>
                                Priority Waitlist & Fast-Pass Hub
                            </h1>
                        </div>
                        <p style={{ color: "#94a3b8", fontSize: "14px", marginTop: "6px" }}>
                            Manage your cancellation waitlist requests and claim exclusive Fast-Pass openings in real time.
                        </p>
                    </div>

                    <div style={{ display: "flex", gap: "12px" }}>
                        <Button
                            variant="secondary"
                            onClick={loadWaitlistData}
                            style={{ backgroundColor: "#1e293b", color: "#cbd5e1", border: "1px solid #334155" }}
                        >
                            <RefreshCw style={{ width: "14px", height: "14px", marginRight: "6px" }} />
                            Refresh
                        </Button>
                        <Button
                            variant="primary"
                            onClick={() => setIsJoinModalOpen(true)}
                            style={{ backgroundColor: "#2563eb", color: "#ffffff", fontWeight: "700" }}
                        >
                            + Join Priority Waitlist
                        </Button>
                    </div>
                </div>

                {/* Status Feedback Banner */}
                {actionMessage && (
                    <div style={{
                        backgroundColor: actionMessage.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                        border: `1px solid ${actionMessage.type === "success" ? "#10b981" : "#ef4444"}`,
                        color: actionMessage.type === "success" ? "#34d399" : "#f87171",
                        padding: "12px 16px",
                        borderRadius: "10px",
                        marginBottom: "24px",
                        fontSize: "14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}>
                        <span>{actionMessage.text}</span>
                        <button
                            onClick={() => setActionMessage(null)}
                            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "16px" }}
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* 1. HERO FAST-PASS CLAIM CARDS (Active Pending Offers) */}
                {activeOffers.length > 0 && (
                    <div style={{ marginBottom: "36px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                            <span style={{ fontSize: "16px" }}>🎉</span>
                            <h2 style={{ fontSize: "18px", fontWeight: "800", color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                                Exclusive Fast-Pass Openings ({activeOffers.length})
                            </h2>
                            <GlassBadge variant="success">Action Required</GlassBadge>
                        </div>

                        <div style={{ display: "grid", gap: "20px" }}>
                            {activeOffers.map((offer) => {
                                const isExp = new Date(offer.expiresAt).getTime() <= nowTimestamp;
                                return (
                                    <div
                                        key={offer.offerId}
                                        style={{
                                            background: "linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)",
                                            border: "2px solid #38bdf8",
                                            borderRadius: "18px",
                                            padding: "24px",
                                            boxShadow: "0 20px 40px -15px rgba(56, 189, 248, 0.3)",
                                            position: "relative",
                                            overflow: "hidden",
                                        }}
                                    >
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "16px" }}>
                                            <div>
                                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                    <GlassBadge variant="info">Fast-Pass Priority Match</GlassBadge>
                                                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                                                        Match Quality: <strong>{offer.score || 95}% Fit</strong>
                                                    </span>
                                                </div>
                                                <h3 style={{ fontSize: "22px", fontWeight: "800", color: "#ffffff", marginTop: "8px", marginBottom: "4px" }}>
                                                    {offer.serviceName}
                                                </h3>
                                                <div style={{ fontSize: "13px", color: "#94a3b8" }}>
                                                    Duration: {offer.serviceDurationMin} min • Special opening reserved exclusively for you
                                                </div>
                                            </div>

                                            <div style={{
                                                backgroundColor: "rgba(239, 68, 68, 0.2)",
                                                border: "1px solid #ef4444",
                                                padding: "8px 16px",
                                                borderRadius: "12px",
                                                textAlign: "center",
                                            }}>
                                                <div style={{ fontSize: "11px", fontWeight: "700", color: "#f87171", textTransform: "uppercase" }}>Offer Timer</div>
                                                <div style={{ fontSize: "22px", fontWeight: "900", color: "#ef4444", fontFamily: "monospace" }}>
                                                    {isExp ? "EXPIRED" : formatCountdown(offer.expiresAt)}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{
                                            backgroundColor: "rgba(15, 23, 42, 0.6)",
                                            border: "1px solid #334155",
                                            borderRadius: "12px",
                                            padding: "16px",
                                            marginBottom: "20px",
                                            display: "grid",
                                            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                                            gap: "14px",
                                        }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                                <Calendar style={{ width: "18px", height: "18px", color: "#38bdf8" }} />
                                                <div>
                                                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>Date & Time</div>
                                                    <div style={{ fontSize: "14px", fontWeight: "700", color: "#ffffff" }}>
                                                        {new Date(offer.startAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                                <User style={{ width: "18px", height: "18px", color: "#a855f7" }} />
                                                <div>
                                                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>Specialist</div>
                                                    <div style={{ fontSize: "14px", fontWeight: "700", color: "#ffffff" }}>
                                                        {offer.staffName || "Any Qualified Stylist"}
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                                <MapPin style={{ width: "18px", height: "18px", color: "#f59e0b" }} />
                                                <div>
                                                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>Location</div>
                                                    <div style={{ fontSize: "14px", fontWeight: "700", color: "#ffffff" }}>
                                                        {offer.locationName}
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                                <span style={{ fontSize: "18px" }}>💳</span>
                                                <div>
                                                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>Price</div>
                                                    <div style={{ fontSize: "14px", fontWeight: "700", color: "#34d399" }}>
                                                        ${(offer.priceCents / 100).toFixed(2)}
                                                        {offer.depositRequiredCents > 0 && ` ($${(offer.depositRequiredCents / 100).toFixed(2)} dep)`}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: "flex", gap: "14px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                                            <Button
                                                variant="secondary"
                                                onClick={() => setSelectedDeclineOffer(offer)}
                                                style={{ backgroundColor: "#1e293b", color: "#94a3b8", border: "1px solid #334155" }}
                                            >
                                                Decline Opening
                                            </Button>

                                            <Link href={`/offers/${offer.token}`}>
                                                <Button
                                                    variant="primary"
                                                    style={{
                                                        backgroundColor: "#2563eb",
                                                        color: "#ffffff",
                                                        fontWeight: "800",
                                                        padding: "10px 24px",
                                                        boxShadow: "0 4px 14px rgba(37, 99, 235, 0.4)",
                                                    }}
                                                >
                                                    ⚡ Claim & Confirm Slot →
                                                </Button>
                                            </Link>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 2. ACTIVE WAITLIST QUEUE SECTION */}
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "16px" }}>📋</span>
                            <h2 style={{ fontSize: "18px", fontWeight: "800", color: "#ffffff", margin: 0 }}>
                                My Active Waitlist Queue ({waitlistEntries.length})
                            </h2>
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8" }}>
                            <RefreshCw style={{ width: "24px", height: "24px", animation: "spin 1s linear infinite", marginBottom: "8px" }} />
                            <p>Loading your queue status...</p>
                        </div>
                    ) : waitlistEntries.length === 0 ? (
                        <GlassCard style={{ padding: "48px 24px", textAlign: "center", borderRadius: "16px" }}>
                            <div style={{ fontSize: "40px", marginBottom: "12px" }}>🛋️</div>
                            <h3 style={{ fontSize: "18px", fontWeight: "700", color: "#ffffff", marginBottom: "8px" }}>
                                You are not currently in any waitlists
                            </h3>
                            <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "420px", margin: "0 auto 20px auto" }}>
                                When fully booked, you can join the priority waitlist to be first in line when a cancellation opening appears.
                            </p>
                            <Button
                                variant="primary"
                                onClick={() => setIsJoinModalOpen(true)}
                                style={{ backgroundColor: "#2563eb", color: "#ffffff" }}
                            >
                                + Join Priority Waitlist
                            </Button>
                        </GlassCard>
                    ) : (
                        <div style={{ display: "grid", gap: "16px" }}>
                            {waitlistEntries.map((entry, idx) => (
                                <GlassCard
                                    key={entry.id}
                                    style={{
                                        padding: "20px 24px",
                                        borderRadius: "14px",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        flexWrap: "wrap",
                                        gap: "16px",
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                                        <div style={{
                                            width: "42px",
                                            height: "42px",
                                            borderRadius: "12px",
                                            backgroundColor: "rgba(56, 189, 248, 0.15)",
                                            border: "1px solid rgba(56, 189, 248, 0.3)",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            color: "#38bdf8",
                                            fontWeight: "800",
                                            fontSize: "16px",
                                        }}>
                                            #{idx + 1}
                                        </div>

                                        <div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                <h3 style={{ fontSize: "17px", fontWeight: "700", color: "#ffffff", margin: 0 }}>
                                                    {entry.serviceName}
                                                </h3>
                                                <GlassBadge variant={entry.status === "OFFERED" ? "warning" : "success"}>
                                                    {entry.status === "OFFERED" ? "Offer Pending" : "In Line (Active)"}
                                                </GlassBadge>
                                            </div>

                                            <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "4px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                                                <span>📅 Dates: {entry.startWindowDate} to {entry.endWindowDate}</span>
                                                <span>⏰ Time: {entry.timePreference}</span>
                                                {entry.locationName && <span>📍 {entry.locationName}</span>}
                                                {entry.staffName && <span>👤 Stylist: {entry.staffName}</span>}
                                            </div>

                                            {entry.notes && (
                                                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px", fontStyle: "italic" }}>
                                                    Note: {entry.notes}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <Button
                                            variant="secondary"
                                            onClick={() => handleCancelEntry(entry.id)}
                                            style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", color: "#f87171", border: "1px solid rgba(239, 68, 68, 0.3)" }}
                                        >
                                            Leave Waitlist
                                        </Button>
                                    </div>
                                </GlassCard>
                            ))}
                        </div>
                    )}
                </div>

                {/* 3. JOIN WAITLIST MODAL */}
                {isJoinModalOpen && (
                    <div style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0,0,0,0.8)",
                        backdropFilter: "blur(6px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "16px",
                        zIndex: 100,
                    }}>
                        <Card style={{ backgroundColor: "#0f172a", border: "1px solid #334155", maxWidth: "480px", width: "100%", padding: "28px", borderRadius: "16px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span style={{ fontSize: "20px" }}>⚡</span>
                                    <h3 style={{ fontSize: "18px", fontWeight: "800", color: "#ffffff", margin: 0 }}>
                                        Join Priority Waitlist
                                    </h3>
                                </div>
                                <button
                                    onClick={() => setIsJoinModalOpen(false)}
                                    style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "20px" }}
                                >
                                    ×
                                </button>
                            </div>

                            <form onSubmit={handleJoinWaitlist}>
                                <div style={{ display: "grid", gap: "14px", marginBottom: "20px" }}>
                                    <div>
                                        <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
                                            Service
                                        </label>
                                        <select
                                            value={selectedServiceId}
                                            onChange={(e) => setSelectedServiceId(e.target.value)}
                                            style={{ width: "100%", backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px", color: "#ffffff", fontSize: "13px" }}
                                            required
                                        >
                                            {services.map((s) => (
                                                <option key={s.id} value={s.id}>
                                                    {s.name} ({s.durationMin}m — ${(s.priceCents / 100).toFixed(2)})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {locations.length > 1 && (
                                        <div>
                                            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
                                                Location
                                            </label>
                                            <select
                                                value={selectedLocationId}
                                                onChange={(e) => setSelectedLocationId(e.target.value)}
                                                style={{ width: "100%", backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px", color: "#ffffff", fontSize: "13px" }}
                                            >
                                                {locations.map((l) => (
                                                    <option key={l.id} value={l.id}>{l.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                        <div>
                                            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
                                                Earliest Date
                                            </label>
                                            <input
                                                type="date"
                                                value={startWindowDate}
                                                min={new Date().toISOString().split("T")[0]}
                                                onChange={(e) => setStartWindowDate(e.target.value)}
                                                style={{ width: "100%", backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px", color: "#ffffff", fontSize: "13px" }}
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
                                                Latest Date
                                            </label>
                                            <input
                                                type="date"
                                                value={endWindowDate}
                                                min={startWindowDate}
                                                onChange={(e) => setEndWindowDate(e.target.value)}
                                                style={{ width: "100%", backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px", color: "#ffffff", fontSize: "13px" }}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
                                            Time of Day Preference
                                        </label>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                                            {[
                                                { val: "ANY", label: "Any Time" },
                                                { val: "MORNING", label: "Morning (8a–12p)" },
                                                { val: "AFTERNOON", label: "Afternoon (12p–5p)" },
                                                { val: "EVENING", label: "Evening (5p–9p)" },
                                            ].map((opt) => (
                                                <button
                                                    key={opt.val}
                                                    type="button"
                                                    onClick={() => setTimePreference(opt.val as any)}
                                                    style={{
                                                        padding: "10px",
                                                        borderRadius: "8px",
                                                        fontSize: "12px",
                                                        fontWeight: "600",
                                                        border: `1px solid ${timePreference === opt.val ? "#38bdf8" : "#334155"}`,
                                                        backgroundColor: timePreference === opt.val ? "rgba(56, 189, 248, 0.15)" : "#1e293b",
                                                        color: timePreference === opt.val ? "#38bdf8" : "#94a3b8",
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                                    <Button
                                        variant="secondary"
                                        type="button"
                                        onClick={() => setIsJoinModalOpen(false)}
                                        style={{ backgroundColor: "#1e293b", color: "#94a3b8" }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="primary"
                                        type="submit"
                                        disabled={submittingJoin}
                                        style={{ backgroundColor: "#2563eb", color: "#ffffff", fontWeight: "700" }}
                                    >
                                        {submittingJoin ? "Joining..." : "Confirm & Join Waitlist"}
                                    </Button>
                                </div>
                            </form>
                        </Card>
                    </div>
                )}

                {/* 4. DECLINE OFFER MODAL */}
                {selectedDeclineOffer && (
                    <div style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0,0,0,0.8)",
                        backdropFilter: "blur(4px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "16px",
                        zIndex: 100,
                    }}>
                        <Card style={{ backgroundColor: "#0f172a", border: "1px solid #334155", maxWidth: "440px", width: "100%", padding: "24px", borderRadius: "14px" }}>
                            <h3 style={{ fontSize: "18px", fontWeight: "700", color: "#ffffff", marginBottom: "8px" }}>
                                Decline This Opening?
                            </h3>
                            <p style={{ fontSize: "13px", color: "#94a3b8", lineHeight: "1.5", marginBottom: "16px" }}>
                                If you decline this opening for <strong>{selectedDeclineOffer.serviceName}</strong>, it will immediately cascade to the next candidate in line.
                            </p>

                            <div style={{ display: "grid", gap: "10px", marginBottom: "16px" }}>
                                <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", color: "#e2e8f0", cursor: "pointer" }}>
                                    <input
                                        type="radio"
                                        name="declineOption"
                                        checked={!removeFromWaitlist}
                                        onChange={() => setRemoveFromWaitlist(false)}
                                        style={{ marginTop: "3px" }}
                                    />
                                    <span>
                                        <strong>Keep me on priority waitlist</strong>
                                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>You remain #1 for future openings.</div>
                                    </span>
                                </label>

                                <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", color: "#e2e8f0", cursor: "pointer" }}>
                                    <input
                                        type="radio"
                                        name="declineOption"
                                        checked={removeFromWaitlist}
                                        onChange={() => setRemoveFromWaitlist(true)}
                                        style={{ marginTop: "3px" }}
                                    />
                                    <span>
                                        <strong>Remove me from waitlist</strong>
                                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>Cancel my waitlist request for this service.</div>
                                    </span>
                                </label>
                            </div>

                            <textarea
                                placeholder="Optional reason (e.g. scheduling conflict)"
                                value={declineReason}
                                onChange={(e) => setDeclineReason(e.target.value)}
                                style={{
                                    width: "100%",
                                    backgroundColor: "#1e293b",
                                    border: "1px solid #334155",
                                    borderRadius: "8px",
                                    color: "#ffffff",
                                    padding: "10px",
                                    fontSize: "13px",
                                    resize: "none",
                                    height: "60px",
                                    marginBottom: "16px",
                                }}
                            />

                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                                <Button
                                    variant="secondary"
                                    onClick={() => setSelectedDeclineOffer(null)}
                                    style={{ backgroundColor: "#1e293b", color: "#94a3b8" }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    disabled={declining}
                                    onClick={handleConfirmDecline}
                                    style={{ backgroundColor: "#ef4444", color: "#ffffff", fontWeight: "700" }}
                                >
                                    {declining ? "Declining..." : "Confirm Decline"}
                                </Button>
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        </CustomerPortalShell>
    );
}
