"use client";

import React, { useState, useEffect } from "react";
import { CreditCard, CheckCircle2, AlertCircle, ArrowRight, ShieldCheck } from "../../../../components/icons";
import { apiFetch } from "../../../../lib/api-client";
import { StripeStatusResponseDto, StripeConnectUrlResponseDto } from "@bookpro/contracts";

import { sanitizeErrorMessage } from "../../../../lib/error-utils";

export interface PaymentData {
    paymentIntent: "ONLINE" | "IN_PERSON" | "NONE";
}

interface StepPaymentProps {
    data: PaymentData;
    onChange: (field: keyof PaymentData, value: any) => void;
    onStatusRefresh?: () => void;
}

export function StepPayment({ data, onChange, onStatusRefresh }: StepPaymentProps) {
    const [stripeStatus, setStripeStatus] = useState<StripeStatusResponseDto | null>(null);
    const [loadingStripe, setLoadingStripe] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    const [stripeResultMsg, setStripeResultMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const fetchStripeStatus = async () => {
        try {
            setLoadingStripe(true);
            const res = await apiFetch<StripeStatusResponseDto>("/payments/stripe/status");
            if (res.success && res.data) {
                setStripeStatus(res.data);
            }
        } catch {
            // ignore
        } finally {
            setLoadingStripe(false);
        }
    };

    useEffect(() => {
        fetchStripeStatus();
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const stripeResult = params.get("stripe_result");
            if (stripeResult === "pending_verification") {
                setStripeResultMsg({ type: "success", text: "Stripe Connect authorization received. Account is now active." });
            } else if (stripeResult === "authorization_denied") {
                setStripeResultMsg({ type: "error", text: "Stripe connection authorization was cancelled." });
            } else if (stripeResult === "connection_failed") {
                setStripeResultMsg({ type: "error", text: "Stripe connection could not be completed. Please try again." });
            }
        }
    }, [onStatusRefresh]);


    const handleConnectStripe = async () => {
        try {
            setConnecting(true);
            setErrorMsg("");
            const res = await apiFetch<StripeConnectUrlResponseDto>("/payments/stripe/connect", {
                method: "POST",
                body: JSON.stringify({ returnPath: "/onboarding?step=8" }),
            });
            if (res.success && res.data?.url) {
                // Redirect user to official Stripe Connect onboarding page
                window.location.href = res.data.url;
            } else {
                setErrorMsg(sanitizeErrorMessage(res.error, "Could not generate Stripe Connect onboarding link.").message);
                setConnecting(false);
            }
        } catch (err: any) {
            setErrorMsg(sanitizeErrorMessage(err, "Error initiating Stripe connection.").message);
            setConnecting(false);
        }
    };

    const handleDisconnectStripe = async () => {
        try {
            setLoadingStripe(true);
            const res = await apiFetch("/payments/stripe/disconnect", { method: "POST" });
            if (res.success) {
                await fetchStripeStatus();
                if (onStatusRefresh) onStatusRefresh();
            }
        } catch {
            // ignore
        } finally {
            setLoadingStripe(false);
        }
    };

    const isConnected = stripeStatus?.connected;

    return (
        <div style={{ display: "grid", gap: "24px" }}>
            <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "8px" }}>
                    How would you like clients to pay for bookings?
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                    {[
                        {
                            id: "ONLINE",
                            title: "Online Deposits & Cards",
                            desc: "Collect upfront deposits or full prepayments via Stripe Connect.",
                        },
                        {
                            id: "IN_PERSON",
                            title: "Pay at Business",
                            desc: "Clients book appointments online and pay at the venue (cash/card POS).",
                        },
                        {
                            id: "NONE",
                            title: "Free / No Payment",
                            desc: "No payment required. Great for consultations or introductory sessions.",
                        },
                    ].map((opt) => (
                        <div
                            key={opt.id}
                            onClick={() => onChange("paymentIntent", opt.id as any)}
                            style={{
                                padding: "16px",
                                borderRadius: "10px",
                                border: data.paymentIntent === opt.id ? "2px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
                                backgroundColor: data.paymentIntent === opt.id ? "rgba(2, 132, 199, 0.15)" : "rgba(15, 23, 42, 0.5)",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                <strong style={{ color: "#f8fafc", fontSize: "14px" }}>{opt.title}</strong>
                                {data.paymentIntent === opt.id && <CheckCircle2 size={16} color="#38bdf8" />}
                            </div>
                            <span style={{ color: "#94a3b8", fontSize: "12px", lineHeight: "1.4", display: "block" }}>
                                {opt.desc}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Stripe Connect Box */}
            <div
                style={{
                    padding: "24px",
                    borderRadius: "14px",
                    border: isConnected ? "1px solid rgba(5, 150, 105, 0.4)" : "1px solid rgba(99, 102, 241, 0.4)",
                    backgroundColor: isConnected ? "rgba(5, 150, 105, 0.08)" : "rgba(99, 102, 241, 0.08)",
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                        <div
                            style={{
                                width: "48px",
                                height: "48px",
                                borderRadius: "12px",
                                backgroundColor: isConnected ? "#059669" : "#6366f1",
                                display: "grid",
                                placeItems: "center",
                                color: "#fff",
                                fontWeight: 900,
                                fontSize: "20px",
                                flexShrink: 0,
                            }}
                        >
                            {isConnected ? "✓" : "S"}
                        </div>
                        <div>
                            <strong style={{ color: "#f8fafc", fontSize: "16px", display: "block" }}>
                                {isConnected ? "Stripe Connect Verified" : "Stripe Connect Express"}
                            </strong>
                            <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                                {isConnected
                                    ? `Direct payouts active (${stripeStatus?.accountId})`
                                    : "Connect your Stripe account to receive card deposits and automated payouts"}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {isConnected ? (
                            <button
                                type="button"
                                onClick={handleDisconnectStripe}
                                disabled={loadingStripe}
                                style={{
                                    padding: "8px 14px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(225, 29, 72, 0.3)",
                                    backgroundColor: "rgba(225, 29, 72, 0.1)",
                                    color: "#fb7185",
                                    fontSize: "12.5px",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                }}
                            >
                                Disconnect
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleConnectStripe}
                                disabled={connecting || loadingStripe}
                                style={{
                                    padding: "10px 20px",
                                    borderRadius: "8px",
                                    border: "none",
                                    backgroundColor: "#6366f1",
                                    color: "#fff",
                                    fontSize: "13.5px",
                                    fontWeight: 800,
                                    cursor: connecting ? "not-allowed" : "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    boxShadow: "0 4px 16px rgba(99, 102, 241, 0.4)",
                                }}
                            >
                                {connecting ? "Connecting…" : "Connect Stripe →"}
                            </button>
                        )}
                    </div>
                </div>

                {stripeResultMsg && (
                    <div style={{
                        marginTop: "12px",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        backgroundColor: stripeResultMsg.type === "success" ? "rgba(5, 150, 105, 0.15)" : "rgba(225, 29, 72, 0.15)",
                        border: stripeResultMsg.type === "success" ? "1px solid rgba(5, 150, 105, 0.4)" : "1px solid rgba(225, 29, 72, 0.4)",
                        color: stripeResultMsg.type === "success" ? "#34d399" : "#fb7185",
                        fontSize: "12.5px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                    }}>
                        {stripeResultMsg.type === "success" ? <CheckCircle2 size={15} color="#34d399" /> : <AlertCircle size={15} color="#fb7185" />}
                        <span>{stripeResultMsg.text}</span>
                    </div>
                )}

                {errorMsg && (
                    <div style={{ marginTop: "12px", color: "#fb7185", fontSize: "12.5px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <AlertCircle size={14} />
                        <span>{errorMsg}</span>
                    </div>
                )}
            </div>


            <div style={{ padding: "12px 16px", backgroundColor: "rgba(15, 23, 42, 0.5)", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", alignItems: "center", gap: "10px" }}>
                <ShieldCheck size={16} color="#34d399" />
                <span style={{ color: "#94a3b8", fontSize: "12.5px" }}>
                    Payments can be set up or modified later at any time from Organization Settings → Payments.
                </span>
            </div>
        </div>
    );
}
