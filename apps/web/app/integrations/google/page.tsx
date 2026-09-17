/* Hallmark · macrostructure: Google Calendar Integration Hub · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P8 H5 E5 S5 R5 V5
 */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button, Card, Badge } from "@bookpro/ui";
import { ProtectedRoute } from "../../../components/protected-route";
import { useAuth } from "../../../lib/auth-context";
import { useRealtimeEvents } from "../../../lib/use-realtime-events";
import Link from "next/link";

interface GoogleStatus {
    id?: string;
    organizationId: string;
    staffId: string;
    provider: string;
    selectedCalendarId?: string | null;
    selectedCalendarName?: string | null;
    status: "CONNECTED" | "DEGRADED" | "DISCONNECTED" | "ACTION_REQUIRED";
    lastSyncAt?: string | null;
    lastSuccessAt?: string | null;
    lastError?: string | null;
    channelExpiration?: string | null;
    isHealthy: boolean;
}

interface GoogleCalendarItem {
    id: string;
    summary: string;
    primary?: boolean;
    timeZone?: string;
}

interface StaffProfileItem {
    id: string;
    displayName: string;
    membership?: { id: string };
}

export default function GoogleIntegrationPage() {
    return (
        <ProtectedRoute>
            <GoogleIntegrationContent />
        </ProtectedRoute>
    );
}

function GoogleIntegrationContent() {
    const { user } = useAuth();
    const orgId = user?.organizationId || "";
    const [staffId, setStaffId] = useState("");
    const [staffName, setStaffName] = useState("");

    const { isConnected: isRealtimeLive, lastEvent } = useRealtimeEvents(orgId);

    const [status, setStatus] = useState<GoogleStatus | null>(null);
    const [calendars, setCalendars] = useState<GoogleCalendarItem[]>([]);
    const [selectedCalId, setSelectedCalId] = useState<string>("primary");
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

    useEffect(() => {
        if (!orgId || !user?.membershipId) return;
        fetch(`${apiBase}/staff`, { credentials: "include" })
            .then((response) => response.ok ? response.json() : Promise.reject(new Error("Unable to load staff profile")))
            .then((payload) => {
                const profiles: StaffProfileItem[] = payload.data || [];
                const ownProfile = profiles.find((profile) => profile.membership?.id === user.membershipId);
                if (!ownProfile) {
                    setFeedback({ type: "error", message: "Your account does not have an active staff profile for calendar synchronization." });
                    return;
                }
                setStaffId(ownProfile.id);
                setStaffName(ownProfile.displayName);
            })
            .catch((error: Error) => setFeedback({ type: "error", message: error.message }));
    }, [apiBase, orgId, user?.membershipId]);

    const fetchStatus = useCallback(async () => {
        if (!orgId || !staffId) return;
        try {
            const res = await fetch(`${apiBase}/integrations/google/status?staffId=${staffId}`, {
                credentials: "include",
            });
            if (res.ok) {
                const data = await res.json();
                setStatus(data.data);
                if (data.data?.selectedCalendarId) {
                    setSelectedCalId(data.data.selectedCalendarId);
                }

                if (data.data?.status === "CONNECTED" || data.data?.status === "DEGRADED") {
                    fetchCalendars();
                }
            }
        } catch {
            // Ignore network errors on polling
        } finally {
            setLoading(false);
        }
    }, [apiBase, orgId, staffId]);

    const fetchCalendars = async () => {
        try {
            const res = await fetch(`${apiBase}/integrations/google/calendars?staffId=${staffId}`, {
                credentials: "include",
            });
            if (res.ok) {
                const data = await res.json();
                setCalendars(data.data || []);
            }
        } catch {
            // Ignore
        }
    };

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus, lastEvent]);

    const handleConnect = async () => {
        setActionLoading(true);
        try {
            const res = await fetch(`${apiBase}/integrations/google/connect?staffId=${staffId}`, {
                credentials: "include",
            });
            const data = await res.json();
            if (data.success && data.data?.url) {
                window.location.href = data.data.url;
            } else {
                setFeedback({ type: "error", message: "Failed to generate Google connect URL" });
            }
        } catch (err: any) {
            setFeedback({ type: "error", message: err.message });
        } finally {
            setActionLoading(false);
        }
    };

    const handleSelectCalendar = async () => {
        setActionLoading(true);
        setFeedback(null);
        try {
            const cal = calendars.find((c) => c.id === selectedCalId);
            const res = await fetch(`${apiBase}/integrations/google/select-calendar`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({
                    staffId,
                    calendarId: selectedCalId,
                    calendarName: cal?.summary || selectedCalId,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setStatus(data.data);
                setFeedback({ type: "success", message: `Active sync calendar updated to "${cal?.summary || selectedCalId}"` });
            }
        } catch (err: any) {
            setFeedback({ type: "error", message: err.message });
        } finally {
            setActionLoading(false);
        }
    };

    const handleResync = async () => {
        setActionLoading(true);
        setFeedback(null);
        try {
            const res = await fetch(`${apiBase}/integrations/google/resync`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({ staffId }),
            });
            if (res.ok) {
                setFeedback({ type: "success", message: "Synchronization triggered. Syncing latest Google Calendar events in background." });
                setTimeout(fetchStatus, 1500);
            }
        } catch (err: any) {
            setFeedback({ type: "error", message: err.message });
        } finally {
            setActionLoading(false);
        }
    };

    const handleDisconnect = async () => {
        if (!confirm("Are you sure you want to disconnect Google Calendar? Imported external busy blocks will be removed.")) {
            return;
        }
        setActionLoading(true);
        setFeedback(null);
        try {
            const res = await fetch(`${apiBase}/integrations/google/disconnect`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({ staffId }),
            });
            if (res.ok) {
                setStatus({
                    organizationId: orgId,
                    staffId,
                    provider: "GOOGLE",
                    status: "DISCONNECTED",
                    isHealthy: false,
                });
                setCalendars([]);
                setFeedback({ type: "success", message: "Google Calendar disconnected successfully." });
            }
        } catch (err: any) {
            setFeedback({ type: "error", message: err.message });
        } finally {
            setActionLoading(false);
        }
    };

    const getStatusBadge = (st: string) => {
        switch (st) {
            case "CONNECTED":
                return <Badge variant="success">● Connected & Healthy</Badge>;
            case "DEGRADED":
                return <Badge variant="warning">● Degraded (Retrying)</Badge>;
            case "ACTION_REQUIRED":
                return <Badge variant="error">● Action Required (Reconnect)</Badge>;
            default:
                return <Badge variant="neutral">● Disconnected</Badge>;
        }
    };

    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#090d16", color: "#f8fafc", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
            {/* Header */}
            <header style={{ borderBottom: "1px solid #1e293b", backgroundColor: "rgba(15, 23, 42, 0.85)", backdropFilter: "blur(16px)", padding: "16px 24px" }}>
                <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                        <Link href="/" style={{ textDecoration: "none", color: "#94a3b8", fontSize: "14px", fontWeight: "600" }}>
                            ← Back to Command Hub
                        </Link>
                        <span style={{ color: "#334155" }}>|</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span style={{ fontSize: "22px" }}>📅</span>
                            <div>
                                <h1 style={{ fontSize: "18px", fontWeight: "800", color: "#fff", margin: 0 }}>
                                    Google Calendar Integration & Health
                                </h1>
                                <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>
                                    Phase P8 · Two-Way Sync, Secondary Busy Blocks & Authority Invariance
                                </p>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", backgroundColor: "#1e293b", padding: "6px 12px", borderRadius: "8px", border: "1px solid #334155", fontSize: "12px" }}>
                            <span style={{ color: isRealtimeLive ? "#10b981" : "#f59e0b", fontWeight: "600" }}>
                                {isRealtimeLive ? "🟢 Realtime SSE Active" : "🟡 SSE Connecting..."}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content Canvas */}
            <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "36px 24px 64px" }}>
                {feedback && (
                    <div
                        style={{
                            padding: "12px 16px",
                            borderRadius: "8px",
                            marginBottom: "24px",
                            backgroundColor: feedback.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)",
                            border: feedback.type === "success" ? "1px solid #059669" : "1px solid #e11d48",
                            color: feedback.type === "success" ? "#34d399" : "#fda4af",
                            fontSize: "14px",
                            fontWeight: "600",
                        }}
                    >
                        {feedback.type === "success" ? "✓ " : "✕ "}
                        {feedback.message}
                    </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                    {/* Connection Status Card */}
                    <Card
                        style={{
                            padding: "24px",
                            backgroundColor: "#0f172a",
                            border: "1px solid #1e293b",
                            borderRadius: "12px",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                <div
                                    style={{
                                        width: "44px",
                                        height: "44px",
                                        borderRadius: "10px",
                                        backgroundColor: "rgba(66, 133, 244, 0.15)",
                                        border: "1px solid rgba(66, 133, 244, 0.3)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: "22px",
                                    }}
                                >
                                    📆
                                </div>
                                <div>
                                    <h2 style={{ fontSize: "16px", fontWeight: "700", color: "#f8fafc", margin: 0 }}>
                                        Google Calendar Link
                                    </h2>
                                    <p style={{ fontSize: "12px", color: "#94a3b8", margin: "2px 0 0" }}>
                                        Staff: {staffName || "Current staff profile"}
                                    </p>
                                </div>
                            </div>
                            {status && getStatusBadge(status.status)}
                        </div>

                        {loading ? (
                            <div style={{ color: "#64748b", fontSize: "14px", padding: "24px 0" }}>Loading connection telemetry...</div>
                        ) : status?.status === "CONNECTED" || status?.status === "DEGRADED" || status?.status === "ACTION_REQUIRED" ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                <div style={{ backgroundColor: "#1e293b", padding: "14px", borderRadius: "8px", fontSize: "13px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                                        <span style={{ color: "#94a3b8" }}>Selected Calendar:</span>
                                        <span style={{ color: "#38bdf8", fontWeight: "700" }}>{status.selectedCalendarName || status.selectedCalendarId || "Primary"}</span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                                        <span style={{ color: "#94a3b8" }}>Last Success:</span>
                                        <span style={{ color: "#f8fafc" }}>{status.lastSuccessAt ? new Date(status.lastSuccessAt).toLocaleString() : "Never"}</span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ color: "#94a3b8" }}>Push Watch Channel:</span>
                                        <span style={{ color: status.channelExpiration ? "#34d399" : "#64748b", fontWeight: "600" }}>
                                            {status.channelExpiration ? "Active (Webhooks Enabled)" : "Disabled"}
                                        </span>
                                    </div>
                                </div>

                                {status.lastError && (
                                    <div style={{ backgroundColor: "rgba(244, 63, 94, 0.1)", border: "1px solid #f43f5e", padding: "10px 14px", borderRadius: "8px", fontSize: "12px", color: "#fda4af" }}>
                                        <strong>Sync Warning:</strong> {status.lastError}
                                    </div>
                                )}

                                <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                                    <Button variant="primary" size="sm" onClick={handleResync} disabled={actionLoading}>
                                        {actionLoading ? "Syncing..." : "🔄 Trigger Manual Sync"}
                                    </Button>
                                    <Button variant="danger" size="sm" onClick={handleDisconnect} disabled={actionLoading}>
                                        Disconnect
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                <p style={{ fontSize: "13px", color: "#94a3b8", lineHeight: "1.6", margin: 0 }}>
                                    Connect your Google Calendar to automatically mirror your BookPro appointments outward and import external personal events inward to block booking slots.
                                </p>
                                <Button variant="primary" size="md" onClick={handleConnect} disabled={actionLoading}>
                                    {actionLoading ? "Connecting..." : "🔗 Connect with Google Calendar"}
                                </Button>
                            </div>
                        )}
                    </Card>

                    {/* Calendar Selection & Invariants Card */}
                    <Card
                        style={{
                            padding: "24px",
                            backgroundColor: "#0f172a",
                            border: "1px solid #1e293b",
                            borderRadius: "12px",
                        }}
                    >
                        <h2 style={{ fontSize: "16px", fontWeight: "700", color: "#f8fafc", margin: "0 0 16px" }}>
                            Calendar Selection & Sync Invariants
                        </h2>

                        {status?.status === "CONNECTED" || status?.status === "DEGRADED" ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#94a3b8", marginBottom: "6px" }}>
                                        TARGET GOOGLE CALENDAR
                                    </label>
                                    <select
                                        value={selectedCalId}
                                        onChange={(e) => setSelectedCalId(e.target.value)}
                                        style={{
                                            width: "100%",
                                            backgroundColor: "#1e293b",
                                            border: "1px solid #334155",
                                            borderRadius: "8px",
                                            color: "#f8fafc",
                                            padding: "10px 12px",
                                            fontSize: "14px",
                                        }}
                                    >
                                        <option value="primary">Primary Calendar</option>
                                        {calendars
                                            .filter((c) => c.id !== "primary")
                                            .map((cal) => (
                                                <option key={cal.id} value={cal.id}>
                                                    {cal.summary} ({cal.id})
                                                </option>
                                            ))}
                                    </select>
                                </div>

                                <Button variant="secondary" size="sm" onClick={handleSelectCalendar} disabled={actionLoading || selectedCalId === status?.selectedCalendarId}>
                                    Save Selected Calendar
                                </Button>

                                <hr style={{ border: 0, borderTop: "1px solid #1e293b", margin: "8px 0" }} />

                                <div style={{ fontSize: "12px", color: "#64748b", display: "flex", flexDirection: "column", gap: "8px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <span style={{ color: "#34d399" }}>✓</span>
                                        <span><strong>BookPro is Primary Authority:</strong> Google API outages never invalidate appointments.</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <span style={{ color: "#34d399" }}>✓</span>
                                        <span><strong>Loop Prevention:</strong> Pushed BookPro events never duplicate availability busy blocks.</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <span style={{ color: "#34d399" }}>✓</span>
                                        <span><strong>Conflict Safety:</strong> External event overlaps surface warning without cancelling BookPro booking.</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>
                                Connect your Google account on the left to configure calendar targets, test conflict resolution, and verify secondary availability blocks.
                            </div>
                        )}
                    </Card>
                </div>
            </main>
        </div>
    );
}
