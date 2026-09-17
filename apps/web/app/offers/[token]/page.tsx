/* Hallmark · macrostructure: Public Waitlist Offer Acceptance · genre: modern-minimal · theme: Midnight
 * Phase P9 — Waitlist Foundation & Offer Lifecycle
 */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Card, Badge } from "@bookpro/ui";
import Link from "next/link";

interface OfferPreview {
    offerId: string;
    token: string;
    organizationId: string;
    organizationName: string;
    serviceId: string;
    serviceName: string;
    serviceDurationMin: number;
    priceCents: number;
    depositRequiredCents: number;
    staffId?: string | null;
    staffName?: string;
    locationId: string;
    locationName: string;
    locationAddress?: string;
    startAt: string;
    endAt: string;
    expiresAt: string;
    isExpired: boolean;
    status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED" | "LOST_TO_ANOTHER_CUSTOMER";
    requiresPayment: boolean;
}

export default function OfferClaimPage() {
    const params = useParams();
    const router = useRouter();
    const token = typeof params?.token === "string" ? params.token : "";
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

    const [offer, setOffer] = useState<OfferPreview | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [accepting, setAccepting] = useState<boolean>(false);
    const [acceptedResult, setAcceptedResult] = useState<{
        success: boolean;
        message: string;
        requiresPayment: boolean;
        appointmentId?: string;
        bookingHoldId?: string;
        clientSecret?: string;
    } | null>(null);

    const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(0);
    const [isDeclineModalOpen, setIsDeclineModalOpen] = useState<boolean>(false);
    const [declineReason, setDeclineReason] = useState<string>("");
    const [removeFromWaitlist, setRemoveFromWaitlist] = useState<boolean>(false);
    const [declining, setDeclining] = useState<boolean>(false);
    const [declinedResult, setDeclinedResult] = useState<string | null>(null);

    const handleDeclineOffer = async () => {
        if (!token) return;
        setDeclining(true);
        setError(null);
        try {
            const res = await fetch(`${apiUrl}/waitlist/offers/decline`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token,
                    reason: declineReason || undefined,
                    removeFromWaitlist,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setDeclinedResult(data.message || "Offer declined successfully.");
                setIsDeclineModalOpen(false);
            } else {
                setError(data.message || "Failed to decline offer.");
            }
        } catch (err: any) {
            setError(err.message || "Network error while declining offer.");
        } finally {
            setDeclining(false);
        }
    };

    const fetchOffer = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${apiUrl}/waitlist/offers/claim?token=${token}`);
            if (res.ok) {
                const data = await res.json();
                setOffer(data);

                const diff = Math.max(0, Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000));
                setTimeLeftSeconds(diff);
            } else {
                const errData = await res.json();
                setError(errData.message || "Invalid or expired offer link.");
            }
        } catch (err: any) {
            setError(err.message || "Failed to load offer details.");
        } finally {
            setLoading(false);
        }
    }, [apiUrl, token]);

    useEffect(() => {
        fetchOffer();
    }, [fetchOffer]);

    // Countdown Timer
    useEffect(() => {
        if (timeLeftSeconds <= 0) return;
        const interval = setInterval(() => {
            setTimeLeftSeconds((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [timeLeftSeconds]);

    // Handle Atomic Claim
    const handleAcceptOffer = async () => {
        if (!offer || !token) return;
        setAccepting(true);
        setError(null);

        try {
            const res = await fetch(`${apiUrl}/waitlist/offers/accept`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
            });

            const data = await res.json();
            if (res.ok) {
                setAcceptedResult(data);
                if (data.requiresPayment && data.bookingHoldId) {
                    // Redirect to checkout or display payment prompt
                }
            } else {
                setError(data.message || "Could not accept offer. The slot may have expired or been claimed.");
                fetchOffer();
            }
        } catch (err: any) {
            setError(err.message || "Network error while accepting offer.");
        } finally {
            setAccepting(false);
        }
    };

    const formatCountdown = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s < 10 ? "0" : ""}${s}`;
    };

    if (loading) {
        return (
            <div style={{ minHeight: "100vh", backgroundColor: "#090d16", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "24px", marginBottom: "8px" }}>⚡</div>
                    <p style={{ color: "#94a3b8" }}>Loading your personalized waitlist offer...</p>
                </div>
            </div>
        );
    }

    if (error || !offer) {
        return (
            <div style={{ minHeight: "100vh", backgroundColor: "#090d16", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                <Card style={{ backgroundColor: "#0f172a", border: "1px solid #334155", maxWidth: "480px", width: "100%", padding: "32px", textAlign: "center", borderRadius: "16px" }}>
                    <div style={{ fontSize: "40px", marginBottom: "16px" }}>⏳</div>
                    <h2 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "12px", color: "#f87171" }}>
                        Offer Unavailable or Expired
                    </h2>
                    <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.6", marginBottom: "24px" }}>
                        {error || "This waitlist offer is no longer valid. It may have expired or been claimed by another customer."}
                    </p>
                    <Link href="/">
                        <Button variant="secondary" style={{ backgroundColor: "#1e293b", color: "#ffffff" }}>
                            Return to Home
                        </Button>
                    </Link>
                </Card>
            </div>
        );
    }

    // Success State
    if (acceptedResult?.success) {
        return (
            <div style={{ minHeight: "100vh", backgroundColor: "#090d16", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                <Card style={{ backgroundColor: "#0f172a", border: "1px solid #10b981", maxWidth: "520px", width: "100%", padding: "36px", textAlign: "center", borderRadius: "16px" }}>
                    <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎉</div>
                    <h2 style={{ fontSize: "24px", fontWeight: "800", marginBottom: "8px", color: "#34d399" }}>
                        Offer Successfully Accepted!
                    </h2>
                    <p style={{ color: "#cbd5e1", fontSize: "14px", marginBottom: "24px" }}>
                        {acceptedResult.message}
                    </p>

                    <div style={{ backgroundColor: "#1e293b", padding: "20px", borderRadius: "12px", textAlign: "left", marginBottom: "24px" }}>
                        <div style={{ fontSize: "12px", color: "#94a3b8", textTransform: "uppercase" }}>Appointment Details</div>
                        <div style={{ fontSize: "16px", fontWeight: "700", color: "#ffffff", marginTop: "4px" }}>{offer.serviceName}</div>
                        <div style={{ fontSize: "14px", color: "#38bdf8", marginTop: "4px" }}>
                            {new Date(offer.startAt).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}
                        </div>
                        <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "6px" }}>
                            Staff: <strong>{offer.staffName || "Any Available Stylist"}</strong> • Location: <strong>{offer.locationName}</strong>
                        </div>
                    </div>

                    {acceptedResult.requiresPayment ? (
                        <div>
                            <p style={{ fontSize: "13px", color: "#fbbf24", marginBottom: "16px" }}>
                                ⚡ Please complete your deposit payment within 10 minutes to hold this slot.
                            </p>
                            <Button
                                variant="primary"
                                onClick={() => router.push(`/book/${offer.organizationName.toLowerCase().replace(/\s+/g, "-")}?holdId=${acceptedResult.bookingHoldId}`)}
                                style={{ backgroundColor: "#10b981", color: "#ffffff", width: "100%", padding: "12px", fontSize: "15px", fontWeight: "700" }}
                            >
                                Proceed to Payment Checkout →
                            </Button>
                        </div>
                    ) : (
                        <Button
                            variant="primary"
                            onClick={() => router.push("/")}
                            style={{ backgroundColor: "#3b82f6", color: "#ffffff", width: "100%" }}
                        >
                            View My Appointments
                        </Button>
                    )}
                </Card>
            </div>
        );
    }

    // Declined State
    if (declinedResult) {
        return (
            <div style={{ minHeight: "100vh", backgroundColor: "#090d16", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                <Card style={{ backgroundColor: "#0f172a", border: "1px solid #64748b", maxWidth: "480px", width: "100%", padding: "36px", textAlign: "center", borderRadius: "16px" }}>
                    <div style={{ fontSize: "40px", marginBottom: "16px" }}>👋</div>
                    <h2 style={{ fontSize: "22px", fontWeight: "700", marginBottom: "8px", color: "#ffffff" }}>
                        Offer Declined
                    </h2>
                    <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.6", marginBottom: "24px" }}>
                        {declinedResult}
                    </p>
                    <Link href="/">
                        <Button variant="secondary" style={{ backgroundColor: "#1e293b", color: "#ffffff" }}>
                            Return to Studio Home
                        </Button>
                    </Link>
                </Card>
            </div>
        );
    }

    const isExpired = offer.isExpired || timeLeftSeconds === 0;

    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#090d16", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
            <Card
                style={{
                    backgroundColor: "#0f172a",
                    border: `1px solid ${isExpired ? "#ef4444" : "#3b82f6"}`,
                    maxWidth: "540px",
                    width: "100%",
                    padding: "32px",
                    borderRadius: "16px",
                    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                }}
            >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                    <div>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {offer.organizationName}
                        </span>
                        <h1 style={{ fontSize: "24px", fontWeight: "800", margin: "4px 0 0 0", color: "#ffffff" }}>
                            ⚡ Slot Opening Available
                        </h1>
                    </div>

                    {!isExpired && (
                        <div style={{ textAlign: "right", backgroundColor: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "6px 12px", borderRadius: "10px" }}>
                            <div style={{ fontSize: "10px", color: "#f87171", fontWeight: "700", textTransform: "uppercase" }}>Expires In</div>
                            <div style={{ fontSize: "18px", fontWeight: "900", color: "#ef4444", fontFamily: "monospace" }}>
                                {formatCountdown(timeLeftSeconds)}
                            </div>
                        </div>
                    )}
                </div>

                <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.6", marginBottom: "24px" }}>
                    A slot matching your waitlist preferences has just opened up! Claim it now before the offer expires or is taken by another customer.
                </p>

                {/* Offer Details Box */}
                <div style={{ backgroundColor: "#1e293b", borderRadius: "12px", padding: "20px", marginBottom: "24px", border: "1px solid #334155" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                        <div>
                            <div style={{ fontSize: "18px", fontWeight: "700", color: "#ffffff" }}>{offer.serviceName}</div>
                            <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "2px" }}>{offer.serviceDurationMin} minutes duration</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "20px", fontWeight: "800", color: "#34d399" }}>
                                ${(offer.priceCents / 100).toFixed(2)}
                            </div>
                            {offer.depositRequiredCents > 0 && (
                                <div style={{ fontSize: "11px", color: "#fbbf24" }}>
                                    ${(offer.depositRequiredCents / 100).toFixed(2)} deposit
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: "grid", gap: "10px", fontSize: "13px", color: "#cbd5e1" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ color: "#38bdf8" }}>📅</span>
                            <span>
                                <strong>{new Date(offer.startAt).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}</strong>
                            </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ color: "#a855f7" }}>👤</span>
                            <span>Stylist: <strong>{offer.staffName || "Any Available Stylist"}</strong></span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ color: "#f59e0b" }}>📍</span>
                            <span>{offer.locationName} {offer.locationAddress ? `(${offer.locationAddress})` : ""}</span>
                        </div>
                    </div>
                </div>

                {isExpired ? (
                    <div>
                        <div style={{ backgroundColor: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", color: "#f87171", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", textAlign: "center", marginBottom: "16px" }}>
                            ⏳ This offer has expired. The opening has been returned to the queue.
                        </div>
                        <Link href="/">
                            <Button variant="secondary" style={{ width: "100%", backgroundColor: "#1e293b", color: "#ffffff" }}>
                                Return to Studio Home
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <div>
                        <Button
                            variant="primary"
                            disabled={accepting}
                            onClick={handleAcceptOffer}
                            style={{
                                width: "100%",
                                backgroundColor: "#2563eb",
                                color: "#ffffff",
                                padding: "14px",
                                fontSize: "16px",
                                fontWeight: "700",
                                borderRadius: "10px",
                                cursor: "pointer",
                            }}
                        >
                            {accepting ? "Securing Slot..." : "⚡ Claim & Confirm Slot"}
                        </Button>

                        <div style={{ marginTop: "12px", textAlign: "center" }}>
                            <Button
                                variant="secondary"
                                onClick={() => setIsDeclineModalOpen(true)}
                                style={{
                                    width: "100%",
                                    backgroundColor: "#1e293b",
                                    color: "#94a3b8",
                                    border: "1px solid #334155",
                                    padding: "10px",
                                    fontSize: "14px",
                                    fontWeight: "600",
                                    borderRadius: "8px",
                                }}
                            >
                                Can&apos;t make this time? Decline Offer
                            </Button>
                        </div>

                        <p style={{ fontSize: "11px", color: "#64748b", textAlign: "center", marginTop: "12px" }}>
                            Atomic first-wins booking. By claiming, you agree to the studio cancellation & reschedule policy.
                        </p>
                    </div>
                )}

                {/* Decline Offer Modal */}
                {isDeclineModalOpen && (
                    <div style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0,0,0,0.75)",
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
                                If this time doesn&apos;t work for you, we will immediately offer it to the next customer in line.
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
                                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>You remain #1 for future cancellation openings.</div>
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
                                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>I no longer need this service appointment.</div>
                                    </span>
                                </label>
                            </div>

                            <textarea
                                placeholder="Optional reason (e.g. conflict with work, found alternative time)"
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
                                    onClick={() => setIsDeclineModalOpen(false)}
                                    style={{ backgroundColor: "#1e293b", color: "#94a3b8" }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    disabled={declining}
                                    onClick={handleDeclineOffer}
                                    style={{ backgroundColor: "#ef4444", color: "#ffffff", fontWeight: "700" }}
                                >
                                    {declining ? "Declining..." : "Confirm Decline"}
                                </Button>
                            </div>
                        </Card>
                    </div>
                )}
            </Card>
        </div>
    );
}
