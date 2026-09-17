"use client";

import React, { useState } from "react";
import { OnboardingStatusResponseDto, PublishReadinessIssueDto } from "@bookpro/contracts";
import { CheckCircle2, AlertCircle, ExternalLink, Copy, Check, Rocket, Sparkles } from "../../../../components/icons";
import { GlassBadge } from "../../../../components/glass-card";

interface StepPublishProps {
    status: OnboardingStatusResponseDto | null;
    onGoToStep: (stepNumber: number) => void;
    publishedUrl: string | null;
    onGoToWorkspace: () => void;
}

export function StepPublish({
    status,
    onGoToStep,
    publishedUrl,
    onGoToWorkspace,
}: StepPublishProps) {
    const [copied, setCopied] = useState(false);

    const organizationSlug = status?.organization?.slug || "workspace";
    const appBaseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const previewUrl = publishedUrl || `${appBaseUrl}/book/${organizationSlug}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(previewUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // If already published successfully
    if (publishedUrl) {
        return (
            <div style={{ textAlign: "center", padding: "20px 10px" }}>
                <div
                    style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "50%",
                        backgroundColor: "rgba(5, 150, 105, 0.2)",
                        border: "2px solid #10b981",
                        display: "grid",
                        placeItems: "center",
                        margin: "0 auto 16px",
                        color: "#34d399",
                    }}
                >
                    <Rocket size={32} />
                </div>

                <h3 style={{ fontSize: "24px", fontWeight: 800, color: "#f8fafc", margin: "0 0 8px" }}>
                    Your Booking Page is Live 🎉
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "460px", margin: "0 auto 24px" }}>
                    Customers can now view services, check real-time availability slots, and book appointments directly.
                </p>

                <div
                    style={{
                        maxWidth: "520px",
                        margin: "0 auto 28px",
                        padding: "12px 16px",
                        backgroundColor: "#0f172a",
                        borderRadius: "10px",
                        border: "1px solid rgba(56, 189, 248, 0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                    }}
                >
                    <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {previewUrl}
                    </span>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <button
                            type="button"
                            onClick={handleCopy}
                            style={{
                                padding: "6px 12px",
                                backgroundColor: "rgba(255, 255, 255, 0.08)",
                                border: "1px solid rgba(255, 255, 255, 0.15)",
                                borderRadius: "6px",
                                color: "#fff",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                            }}
                        >
                            {copied ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                            {copied ? "Copied" : "Copy"}
                        </button>
                        <a
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                padding: "6px 12px",
                                backgroundColor: "#0284c7",
                                border: "none",
                                borderRadius: "6px",
                                color: "#fff",
                                fontSize: "12px",
                                fontWeight: 700,
                                textDecoration: "none",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                            }}
                        >
                            Open <ExternalLink size={14} />
                        </a>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onGoToWorkspace}
                    style={{
                        padding: "12px 28px",
                        backgroundColor: "#059669",
                        border: "none",
                        borderRadius: "10px",
                        color: "#fff",
                        fontSize: "14.5px",
                        fontWeight: 800,
                        cursor: "pointer",
                        boxShadow: "0 4px 20px rgba(16, 185, 129, 0.4)",
                    }}
                >
                    Enter BookPro Workspace →
                </button>
            </div>
        );
    }

    const hasLocation = !!status?.firstLocation;
    const hasService = !!status?.firstService;
    const hasStaff = !!status?.firstStaff;
    const hasAvailability = (status?.completedSteps || []).includes("AVAILABILITY");
    const hasPolicy = !!status?.policy;
    const isStripeConnected = status?.stripe?.connected;

    const blockingIssues = (status?.issues || []).filter((i: PublishReadinessIssueDto) => i.blocking);

    return (
        <div style={{ display: "grid", gap: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ color: "#94a3b8", fontSize: "13.5px", margin: 0 }}>
                    Pre-launch system integrity audit verifying authoritative configuration before public bookings open.
                </p>
                <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        fontSize: "12.5px",
                        color: "#38bdf8",
                        textDecoration: "none",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                    }}
                >
                    Preview Portal <ExternalLink size={13} />
                </a>
            </div>

            {/* Organization Setup Summary Card */}
            <div
                style={{
                    padding: "20px",
                    borderRadius: "12px",
                    border: "1px solid rgba(56, 189, 248, 0.2)",
                    background: "radial-gradient(ellipse at top left, rgba(2, 132, 199, 0.12), rgba(15, 23, 42, 0.75))",
                    backdropFilter: "blur(12px)",
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
                    display: "grid",
                    gap: "16px",
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "12px" }}>
                    <div>
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            Authoritative Setup Summary
                        </span>
                        <h4 style={{ margin: "2px 0 0", fontSize: "16px", fontWeight: 800, color: "#f8fafc" }}>
                            {status?.organization?.brandName || status?.organization?.name || "BookPro Workspace"}
                        </h4>
                    </div>
                    <GlassBadge variant={blockingIssues.length === 0 ? "success" : "warning"}>
                        {blockingIssues.length === 0 ? "READY TO PUBLISH" : `${blockingIssues.length} PENDING`}
                    </GlassBadge>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
                    {/* Business & Location */}
                    <div style={{ padding: "12px", backgroundColor: "rgba(15, 23, 42, 0.5)", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                        <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                            Business & Location
                        </span>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#f8fafc" }}>
                            {status?.firstLocation?.name || "Branch not configured"}
                        </div>
                        <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                            {status?.firstLocation?.city ? `${status.firstLocation.city}, ` : ""}{status?.organization?.country || "US"} • {status?.organization?.timezone || "UTC"}
                        </div>
                    </div>

                    {/* Service & Pricing */}
                    <div style={{ padding: "12px", backgroundColor: "rgba(15, 23, 42, 0.5)", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                        <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                            Primary Service
                        </span>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#f8fafc" }}>
                            {status?.firstService?.name || "Service not configured"}
                        </div>
                        <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                            {status?.firstService ? `${status.firstService.durationMin}m session • $${((status.firstService.priceCents || 0) / 100).toFixed(2)} ${status.firstService.currency || "USD"}` : "Pricing pending"}
                        </div>
                    </div>

                    {/* Staff Provider & Shifts */}
                    <div style={{ padding: "12px", backgroundColor: "rgba(15, 23, 42, 0.5)", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                        <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                            Staff & Availability
                        </span>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#f8fafc" }}>
                            {status?.firstStaff?.displayName || "Provider not configured"}
                        </div>
                        <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                            {status?.firstStaff?.title || "Practitioner"} • {status?.firstStaff?.availabilitiesCount ? `${status.firstStaff.availabilitiesCount} active weekly shift${status.firstStaff.availabilitiesCount > 1 ? "s" : ""}` : "Hours not set"}
                        </div>
                    </div>

                    {/* Policy & Payments */}
                    <div style={{ padding: "12px", backgroundColor: "rgba(15, 23, 42, 0.5)", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                        <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                            Policy & Payments
                        </span>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#f8fafc" }}>
                            {status?.policy ? `${status.policy.cancelCutoffHours}h cancellation cutoff` : "Default policy"}
                        </div>
                        <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                            {status?.stripe?.connected ? "Stripe Online Payments" : "In-Person / Deferred Payment"}
                        </div>
                    </div>
                </div>
            </div>

            {/* Verification Checklist */}
            <div style={{ display: "grid", gap: "10px" }}>
                {/* 1. Location */}
                <div
                    style={{
                        padding: "16px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        backgroundColor: "rgba(15, 23, 42, 0.6)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <div>
                        <strong style={{ color: "#f8fafc", fontSize: "14px", display: "block" }}>
                            1. Physical / Virtual Location Branch
                        </strong>
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                            {hasLocation
                                ? `${status?.firstLocation?.name} • ${status?.firstLocation?.city || "Active branch"}`
                                : "Location branch has not been configured"}
                        </span>
                    </div>
                    {hasLocation ? (
                        <GlassBadge variant="success">✓ VERIFIED</GlassBadge>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onGoToStep(4)}
                            style={{
                                padding: "4px 10px",
                                backgroundColor: "rgba(225, 29, 72, 0.15)",
                                border: "1px solid rgba(225, 29, 72, 0.4)",
                                borderRadius: "6px",
                                color: "#fb7185",
                                fontSize: "11.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                            }}
                        >
                            Fix in Step 4 →
                        </button>
                    )}
                </div>

                {/* 2. Service */}
                <div
                    style={{
                        padding: "16px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        backgroundColor: "rgba(15, 23, 42, 0.6)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <div>
                        <strong style={{ color: "#f8fafc", fontSize: "14px", display: "block" }}>
                            2. Bookable Service with Authoritative Pricing
                        </strong>
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                            {hasService
                                ? `${status?.firstService?.name} • ${status?.firstService?.durationMin} min • $${((status?.firstService?.priceCents || 0) / 100).toFixed(2)} ${status?.firstService?.currency || "USD"}`
                                : "Service catalog is empty"}
                        </span>
                    </div>
                    {hasService ? (
                        <GlassBadge variant="success">✓ VERIFIED</GlassBadge>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onGoToStep(5)}
                            style={{
                                padding: "4px 10px",
                                backgroundColor: "rgba(225, 29, 72, 0.15)",
                                border: "1px solid rgba(225, 29, 72, 0.4)",
                                borderRadius: "6px",
                                color: "#fb7185",
                                fontSize: "11.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                            }}
                        >
                            Fix in Step 5 →
                        </button>
                    )}
                </div>

                {/* 3. Staff */}
                <div
                    style={{
                        padding: "16px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        backgroundColor: "rgba(15, 23, 42, 0.6)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <div>
                        <strong style={{ color: "#f8fafc", fontSize: "14px", display: "block" }}>
                            3. Qualified Staff Profile & Role Assignment
                        </strong>
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                            {hasStaff
                                ? `${status?.firstStaff?.displayName} (${status?.firstStaff?.title || "Practitioner"}) • ${status?.firstStaff?.email}`
                                : "No service provider configured"}
                        </span>
                    </div>
                    {hasStaff ? (
                        <GlassBadge variant="success">✓ VERIFIED</GlassBadge>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onGoToStep(6)}
                            style={{
                                padding: "4px 10px",
                                backgroundColor: "rgba(225, 29, 72, 0.15)",
                                border: "1px solid rgba(225, 29, 72, 0.4)",
                                borderRadius: "6px",
                                color: "#fb7185",
                                fontSize: "11.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                            }}
                        >
                            Fix in Step 6 →
                        </button>
                    )}
                </div>

                {/* 4. Availability */}
                <div
                    style={{
                        padding: "16px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        backgroundColor: "rgba(15, 23, 42, 0.6)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <div>
                        <strong style={{ color: "#f8fafc", fontSize: "14px", display: "block" }}>
                            4. Weekly Staff Availability Shifts
                        </strong>
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                            {hasAvailability
                                ? "Weekly shift hours assigned and active"
                                : "Working hours have not been assigned"}
                        </span>
                    </div>
                    {hasAvailability ? (
                        <GlassBadge variant="success">✓ VERIFIED</GlassBadge>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onGoToStep(7)}
                            style={{
                                padding: "4px 10px",
                                backgroundColor: "rgba(225, 29, 72, 0.15)",
                                border: "1px solid rgba(225, 29, 72, 0.4)",
                                borderRadius: "6px",
                                color: "#fb7185",
                                fontSize: "11.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                            }}
                        >
                            Fix in Step 7 →
                        </button>
                    )}
                </div>

                {/* 5. Booking Policy */}
                <div
                    style={{
                        padding: "16px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        backgroundColor: "rgba(15, 23, 42, 0.6)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <div>
                        <strong style={{ color: "#f8fafc", fontSize: "14px", display: "block" }}>
                            5. Booking, Cancellation & Rescheduling Guardrails
                        </strong>
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                            {hasPolicy
                                ? `${status?.policy?.cancelCutoffHours}h cancellation cutoff • ${status?.policy?.holdDurationMinutes}m hold`
                                : "Default organization policy missing"}
                        </span>
                    </div>
                    {hasPolicy ? (
                        <GlassBadge variant="success">✓ VERIFIED</GlassBadge>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onGoToStep(10)}
                            style={{
                                padding: "4px 10px",
                                backgroundColor: "rgba(225, 29, 72, 0.15)",
                                border: "1px solid rgba(225, 29, 72, 0.4)",
                                borderRadius: "6px",
                                color: "#fb7185",
                                fontSize: "11.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                            }}
                        >
                            Fix in Step 10 →
                        </button>
                    )}
                </div>

                {/* 6. Stripe Connect (Optional) */}
                <div
                    style={{
                        padding: "16px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        backgroundColor: "rgba(15, 23, 42, 0.6)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <div>
                        <strong style={{ color: "#f8fafc", fontSize: "14px", display: "block" }}>
                            6. Stripe Connect Online Payouts (Optional)
                        </strong>
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                            {isStripeConnected
                                ? `Connected: ${status?.stripe?.accountId || "Active account"}`
                                : "Not connected (in-person / deferred payment mode)"}
                        </span>
                    </div>
                    {isStripeConnected ? (
                        <GlassBadge variant="success">✓ CONNECTED</GlassBadge>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onGoToStep(8)}
                            style={{
                                padding: "4px 10px",
                                backgroundColor: "rgba(2, 132, 199, 0.15)",
                                border: "1px solid rgba(56, 189, 248, 0.3)",
                                borderRadius: "6px",
                                color: "#38bdf8",
                                fontSize: "11.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                            }}
                        >
                            Configure in Step 8 →
                        </button>
                    )}
                </div>
            </div>

            {blockingIssues.length > 0 && (
                <div
                    style={{
                        padding: "14px 18px",
                        backgroundColor: "rgba(225, 29, 72, 0.12)",
                        border: "1px solid rgba(225, 29, 72, 0.35)",
                        borderRadius: "10px",
                        color: "#fb7185",
                        fontSize: "13.5px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                    }}
                    role="alert"
                >
                    <AlertCircle size={18} />
                    <span>
                        {blockingIssues.length} mandatory requirement{blockingIssues.length > 1 ? "s" : ""} must be completed before publishing.
                    </span>
                </div>
            )}
        </div>
    );
}
