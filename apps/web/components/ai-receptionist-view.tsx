/* Hallmark · macrostructure: Conversational Concierge Studio · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 */
"use client";

import React, { FormEvent, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { AIActionCard, AIConversationDto, AIMessageResponseDto } from "@bookpro/contracts";
import { ProtectedRoute } from "./protected-route";
import { useAuth } from "../lib/auth-context";
import { apiFetch } from "../lib/api-client";
import { GlassCard, GlassBadge } from "./glass-card";
import {
  OrbitRings,
  WaveformBars,
  FloatingParticles,
  ClockSpinner,
  SparklesGlow,
  PulsingDot,
} from "./animated-svgs";
import {
  Bot,
  User,
  Send,
  Sparkles,
  RefreshCw,
  Clock,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  MapPin,
  X,
  Copy,
  Check,
  Download,
  CreditCard,
} from "./icons";
import Link from "next/link";
import { CustomerPortalShell } from "./shell/customer-portal-shell";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

export function AIReceptionistView({ tenantSlug }: { tenantSlug?: string }) {
  return (
    <ProtectedRoute>
      <ReceptionistPanel tenantSlug={tenantSlug} />
    </ProtectedRoute>
  );
}

function ReceptionistPanel({ tenantSlug }: { tenantSlug?: string }) {
  const { user } = useAuth();
  const slug = tenantSlug || user?.organizationSlug || "";
  const [organization, setOrganization] = useState<any>(null);

  useEffect(() => {
    if (!slug) return;
    apiFetch(`/organization/by-slug/${encodeURIComponent(slug)}`).then((res) => {
      if (res.success && res.data) setOrganization(res.data);
    });
  }, [slug]);

  const bookingHref = slug ? `/${slug}/book` : "/organizations";
  const businessName = organization?.brandName || organization?.name || user?.organizationName || "BookPro";
  const accentColor = organization?.primaryColor || "#0284c7";
  const orgCurrency = organization?.currency;

  const SESSION_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours
  const storageKey = `bookpro:ai_customer_session:${slug}`;

  const [conversation, setConversation] = useState<AIConversationDto | null>(null);
  const [cards, setCards] = useState<AIActionCard[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyStatus, setBusyStatus] = useState("Grounding response with BookPro schedule database…");
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const createConversation = useCallback(async (isReset = false) => {
    setBusy(true);
    setError(null);
    try {
      if (isReset && typeof window !== "undefined") {
        window.localStorage.removeItem(storageKey);
      }
      const response = await fetch(`${apiBase}/ai/conversations`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(slug ? { "x-tenant-slug": slug } : {}),
        },
        body: JSON.stringify({ channel: "TEXT", scope: "CUSTOMER" }),
      });
      const textResponse = await response.text();
      let body: any;
      try {
        body = JSON.parse(textResponse);
      } catch {
        throw new Error(response.ok ? "Invalid server response format." : "The AI assistant service is temporarily reconnecting. Please retry.");
      }
      if (!response.ok) {
        throw new Error(body?.error?.message || body?.message || body?.detail || "Could not start the receptionist session.");
      }
      setConversation(body);
      setCards([]);
      if (typeof window !== "undefined" && body?.id) {
        window.localStorage.setItem(storageKey, JSON.stringify({
          conversationId: body.id,
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
        }));
      }
    } catch (err: any) {
      setUnavailable(true);
      setError(err.message || "The AI receptionist is currently unavailable.");
    } finally {
      setBusy(false);
    }
  }, [slug, storageKey]);

  // Load existing session within 5 hours, or create fresh conversation
  useEffect(() => {
    if (!slug || typeof window === "undefined") return;

    const rawSession = window.localStorage.getItem(storageKey);
    if (rawSession) {
      try {
        const parsed = JSON.parse(rawSession);
        const age = Date.now() - (parsed.createdAt || 0);
        if (parsed.conversationId && age < SESSION_TTL_MS) {
          setBusy(true);
          fetch(`${apiBase}/ai/conversations/${encodeURIComponent(parsed.conversationId)}`, {
            headers: {
              ...(slug ? { "x-tenant-slug": slug } : {}),
            },
            credentials: "include",
          })
            .then(async (res) => {
              if (!res.ok) throw new Error("Conversation expired or not found");
              return res.json();
            })
            .then((convData: AIConversationDto) => {
              setConversation(convData);
              // Restore active cards from the latest assistant message that contained action cards
              const lastMsgWithCards = [...(convData.messages || [])]
                .reverse()
                .find((m: any) => m.role === "ASSISTANT" && Array.isArray(m.cards) && m.cards.length > 0);
              if (lastMsgWithCards?.cards) {
                setCards(lastMsgWithCards.cards);
              }
            })
            .catch(() => {
              void createConversation();
            })
            .finally(() => {
              setBusy(false);
            });
          return;
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }

    void createConversation();
  }, [slug, storageKey, createConversation, SESSION_TTL_MS]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages, cards, busy]);

  // Handle return from Stripe checkout (?payment=success|failed|cancelled&holdId=...)
  useEffect(() => {
    if (typeof window === "undefined" || !slug) return;
    const urlParams = new URLSearchParams(window.location.search);
    const payment = urlParams.get("payment");
    const returnHoldId = urlParams.get("holdId");
    const returnGuestToken = urlParams.get("guestToken");

    if (payment === "success" && returnHoldId) {
      let attempts = 0;
      const maxAttempts = 15;
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch(
            `${apiBase}/appointments/public/status?holdId=${encodeURIComponent(returnHoldId)}${
              returnGuestToken ? `&guestToken=${encodeURIComponent(returnGuestToken)}` : ""
            }`,
            { headers: { "x-tenant-slug": slug } }
          );
          if (res.ok) {
            const json = await res.json();
            const statusData = json.data || json;
            if (statusData.status === "CONFIRMED" && statusData.appointment) {
              clearInterval(pollInterval);
              const appt = statusData.appointment;
              // Clean up search params from URL
              window.history.replaceState({}, "", window.location.pathname);
              const refCode = appt.referenceCode || `BK-${appt.id.slice(0, 6).toUpperCase()}`;
              const receiptCard: AIActionCard = {
                toolName: "confirmBooking",
                kind: "BOOKING_RECEIPT",
                title: `Booking Confirmed: ${refCode}`,
                data: {
                  appointmentId: appt.id,
                  referenceCode: refCode,
                  serviceName: appt.service?.name || appt.serviceName || "Scheduled Service",
                  staffDisplayName: appt.staff?.displayName || appt.staff?.name || appt.staffName,
                  locationName: appt.location?.name || appt.locationName,
                  startAt: appt.startAt,
                  endAt: appt.endAt,
                  currency: appt.currency || appt.service?.currency || orgCurrency || "USD",
                  totalCents: appt.priceCents || 0,
                  paidOnlineCents: appt.paidDepositCents || appt.priceCents || 0,
                  remainingBalanceCents: Math.max(0, (appt.priceCents || 0) - (appt.paidDepositCents || 0)),
                  paymentStatus: appt.paymentStatus || "PAID",
                  status: appt.status || "CONFIRMED",
                  calendarDownloadUrl: `/api/v1/appointments/public/${appt.id}/calendar.ics`,
                  customerEmail: appt.customer?.email || user?.email,
                  message: "Payment received via Stripe! Your appointment has been secured and confirmed.",
                },
              };
              setCards([receiptCard]);
              // Inject celebratory assistant confirmation message
              setConversation((prev) => {
                if (!prev) return prev;
                const alreadyAnnounced = prev.messages.some((m) => m.content.includes(refCode) || m.content.includes("Payment received via Stripe"));
                if (alreadyAnnounced) return prev;
                return {
                  ...prev,
                  messages: [
                    ...prev.messages,
                    {
                      role: "ASSISTANT",
                      content: `Payment received successfully! Your booking is confirmed with reference code **${refCode}**. You can review the receipt card below or download the calendar invite (.ics) anytime.`,
                      createdAt: new Date().toISOString(),
                      actionState: "CONFIRMED",
                      cards: [receiptCard],
                    },
                  ],
                };
              });
            }
          }
        } catch (err) {
          console.warn("Failed to check payment status:", err);
        }
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
        }
      }, 1500);

      return () => clearInterval(pollInterval);
    }

    if ((payment === "failed" || payment === "cancelled") && returnHoldId) {
      window.history.replaceState({}, "", window.location.pathname);
      const isFailed = payment === "failed";
      setConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: [
            ...prev.messages,
            {
              role: "ASSISTANT",
              content: isFailed
                ? "Your online payment could not be processed. No unconfirmed charge was made to your card. Would you like to retry completing checkout or select another available slot?"
                : "Checkout was cancelled. Your temporary seat hold has not been charged. If you would like to complete your booking or choose another slot, please let me know!",
              createdAt: new Date().toISOString(),
              actionState: "INFORMATION",
            },
          ],
        };
      });
    }
  }, [slug, orgCurrency, user?.email]);

  async function sendText(text: string) {
    if (!conversation || !text.trim() || busy) return;
    setBusy(true);
    setBusyStatus("Grounding response with BookPro schedule database…");
    setError(null);

    const convId = conversation.id;
    const baseCount = conversation.messages.length;

    // Optimistically show user message immediately
    const optimisticUserMsg = {
      role: "USER" as const,
      content: text.trim(),
      createdAt: new Date().toISOString(),
    };
    setConversation((prev) => prev ? { ...prev, messages: [...prev.messages, optimisticUserMsg] } : null);

    let needsRecovery = false;
    let initialErrorMessage: string | null = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const response = await fetch(`${apiBase}/ai/conversations/${convId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(slug ? { "x-tenant-slug": slug } : {}),
        },
        body: JSON.stringify({
          message: text.trim(),
          idempotencyKey: crypto.randomUUID(),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const textResponse = await response.text();
      let body: any;
      try {
        body = JSON.parse(textResponse);
      } catch {
        // Non-JSON response (e.g. proxy gateway timeout or connection drop)
        needsRecovery = true;
      }

      if (!response.ok) {
        // If 504 / 502 / 503 gateway or proxy timeout, the backend might still be processing
        if (response.status >= 500) {
          needsRecovery = true;
        } else {
          throw new Error(body?.error?.message || body?.message || body?.detail || "The request could not be processed.");
        }
      } else if (!needsRecovery && body) {
        const result = body as AIMessageResponseDto;
        setConversation(result.conversation);
        setCards(result.cards);
        setUnavailable(result.degraded);
        if (typeof window !== "undefined" && result.conversation?.id) {
          window.localStorage.setItem(storageKey, JSON.stringify({
            conversationId: result.conversation.id,
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
          }));
        }
        setBusy(false);
        return;
      }
    } catch (err: any) {
      initialErrorMessage = err.message;
      needsRecovery = true;
    }

    if (needsRecovery) {
      setBusyStatus("Google Gemini is finalizing your response…");
      // Self-healing recovery: If Gemini free tier or proxy experienced a latency pause,
      // the backend typically finishes executing and persists the assistant response to PostgreSQL.
      // Poll GET /api/v1/ai/conversations/:id up to 10 times (every 2s = 20s) to smoothly recover the finished response.
      let recovered = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          const pollRes = await fetch(`${apiBase}/ai/conversations/${convId}`, {
            headers: { ...(slug ? { "x-tenant-slug": slug } : {}) },
            credentials: "include",
          });
          if (pollRes.ok) {
            const updatedConv: AIConversationDto = await pollRes.json();
            if (updatedConv && updatedConv.messages.length > baseCount) {
              const lastMsg = updatedConv.messages[updatedConv.messages.length - 1];
              if (lastMsg && lastMsg.role === "ASSISTANT") {
                setConversation(updatedConv);
                if (Array.isArray(lastMsg.cards) && lastMsg.cards.length > 0) {
                  setCards(lastMsg.cards);
                }
                if (typeof window !== "undefined") {
                  window.localStorage.setItem(storageKey, JSON.stringify({
                    conversationId: updatedConv.id,
                    createdAt: Date.now(),
                    lastActiveAt: Date.now(),
                  }));
                }
                recovered = true;
                break;
              }
            }
          }
        } catch {
          // continue polling
        }
      }

      if (!recovered) {
        setError(initialErrorMessage || "The server took too long or is reconnecting. Please retry.");
      }
    }

    setBusy(false);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setMessage("");
    await sendText(text);
  }

  async function confirm(card: AIActionCard) {
    if (!conversation || !card.proposalId || !card.confirmationToken || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBase}/ai/conversations/${conversation.id}/proposals/${card.proposalId}/confirm`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(slug ? { "x-tenant-slug": slug } : {}),
          },
          body: JSON.stringify({
            confirmationToken: card.confirmationToken,
            idempotencyKey: `confirm:${card.proposalId}`,
          }),
        }
      );
      const textResponse = await response.text();
      let body: any;
      try {
        body = JSON.parse(textResponse);
      } catch {
        throw new Error(response.ok ? "Invalid server response format." : "The proposal service is temporarily unavailable.");
      }
      if (!response.ok) {
        throw new Error(body?.error?.message || body?.message || body?.detail || "The proposal could not be confirmed.");
      }
      setCards([body.card]);
    } catch (err: any) {
      setError(err.message || "The proposal is stale or could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  const messages = useMemo(() => conversation?.messages || [], [conversation]);

  const suggestions = [
    "What treatments and services do you offer?",
    "When is my next upcoming appointment?",
    "Find available appointment slots for this week",
    "What is your cancellation and refund policy?",
    "Check the status of my waitlist requests",
    "Give me an account overview",
  ];

  return (
    <CustomerPortalShell tenantInfo={organization} pageTitle={`AI Receptionist — ${businessName}`}>
      <div style={{ position: "relative", overflowX: "clip", paddingBottom: "60px" }}>
        <FloatingParticles count={10} />

        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "36px 20px 0", position: "relative", zIndex: 10 }}>
          {/* Header Banner */}
          <header style={{ marginBottom: "28px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                  <GlassBadge variant={unavailable ? "warning" : "info"} size="sm">
                    {unavailable ? "AI DEGRADED" : "GEMINI 3.7 FLASH • TOOL-GROUNDED"}
                  </GlassBadge>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>Backend Integrated</span>
                </div>

                <h1 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", fontWeight: 850, color: "#f8fafc", letterSpacing: "-0.03em", margin: "0 0 6px" }}>
                  AI Receptionist
                </h1>
                <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: 1.5, margin: 0, maxWidth: "620px" }}>
                  Ask questions, discover treatments, or check live verified availability. Actions are securely executed directly via BookPro backend APIs.
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  onClick={() => createConversation(true)}
                  disabled={busy}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 14px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#f8fafc",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: busy ? "not-allowed" : "pointer",
                  }}
                >
                  <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
                  <span>New Conversation</span>
                </button>
              </div>
            </div>
          </header>

          {/* System Alerts */}
          {unavailable && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "14px 18px",
                borderRadius: "10px",
                backgroundColor: "rgba(217, 119, 6, 0.15)",
                border: "1px solid rgba(251, 191, 36, 0.35)",
                color: "#fcd34d",
                fontSize: "13.5px",
                marginBottom: "20px",
              }}
            >
              <AlertTriangle size={18} />
              <span>
                The AI Receptionist is operating in degraded mode. Standard booking remains available.{" "}
                <Link href={bookingHref} style={{ color: "#fff", fontWeight: 800, textDecoration: "underline" }}>
                  Open direct booking flow →
                </Link>
              </span>
            </div>
          )}

          {error && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "14px 18px",
                borderRadius: "10px",
                backgroundColor: "rgba(244, 63, 94, 0.15)",
                border: "1px solid rgba(244, 63, 94, 0.35)",
                color: "#fca5a5",
                fontSize: "13.5px",
                marginBottom: "20px",
              }}
            >
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Main Chat Interface Container */}
          <GlassCard
            variant="panel"
            glow="subtle"
            style={{
              padding: "24px",
              minHeight: "480px",
              display: "flex",
              flexDirection: "column",
              borderRadius: "18px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            {/* Live Visualizer Bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: "16px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                marginBottom: "20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <OrbitRings size={32} />
                <div>
                  <span style={{ fontSize: "13px", fontWeight: 800, color: "#f8fafc", display: "block" }}>
                    {businessName} Reception Node
                  </span>
                  <span style={{ fontSize: "11px", color: "#38bdf8", display: "flex", alignItems: "center", gap: "4px" }}>
                    <PulsingDot color="#38bdf8" size={4} />
                    Active Neural Channel
                  </span>
                </div>
              </div>

              <WaveformBars size={32} />
            </div>

            {/* Suggested Prompts (when no conversation started yet) */}
            {messages.length === 0 && !busy && (
              <div style={{ margin: "auto 0", textAlign: "center", padding: "30px 10px" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
                  <SparklesGlow size={48} />
                </div>
                <h3 style={{ fontSize: "18px", fontWeight: 850, color: "#f8fafc", margin: "0 0 8px" }}>
                  How can I help you today?
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "13.5px", maxWidth: "460px", margin: "0 auto 24px" }}>
                  Ask about services, query open practitioner availability, request a hold, or explore policies.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "10px",
                    maxWidth: "600px",
                    margin: "0 auto",
                  }}
                >
                  {suggestions.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendText(prompt)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        backgroundColor: "rgba(15, 23, 42, 0.85)",
                        border: "1px solid rgba(56, 189, 248, 0.25)",
                        color: "#38bdf8",
                        fontSize: "12.5px",
                        fontWeight: 700,
                        textAlign: "left",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <Sparkles size={13} color="#38bdf8" style={{ flexShrink: 0 }} />
                      <span>{prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Message Stream */}
            <div style={{ display: "grid", gap: "16px", flex: 1, overflowY: "auto" }}>
              {messages.map((item, index) => {
                const isUser = item.role === "USER";
                return (
                  <div
                    key={`${item.createdAt}-${index}`}
                    style={{
                      display: "flex",
                      flexDirection: isUser ? "row-reverse" : "row",
                      gap: "12px",
                      alignItems: "flex-start",
                    }}
                  >
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        backgroundColor: isUser ? "rgba(2, 132, 199, 0.3)" : "rgba(124, 58, 237, 0.3)",
                        border: isUser ? "1px solid #38bdf8" : "1px solid #a855f7",
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                        color: isUser ? "#38bdf8" : "#c084fc",
                      }}
                    >
                      {isUser ? <User size={16} /> : <Bot size={16} />}
                    </div>

                    <div
                      style={{
                        maxWidth: "80%",
                        padding: "14px 18px",
                        borderRadius: "14px",
                        backgroundColor: isUser
                          ? "rgba(2, 132, 199, 0.25)"
                          : "rgba(15, 23, 42, 0.88)",
                        border: isUser
                          ? "1px solid rgba(56, 189, 248, 0.4)"
                          : "1px solid rgba(255, 255, 255, 0.08)",
                        color: "#f8fafc",
                        fontSize: "14px",
                        lineHeight: 1.6,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 800,
                          letterSpacing: "0.06em",
                          color: isUser ? "#7dd3fc" : "#c084fc",
                          marginBottom: "6px",
                          textTransform: "uppercase",
                        }}
                      >
                        {isUser ? "You" : `${businessName} AI Receptionist`}
                      </div>
                      <FormattedChatMessage content={item.content} isUser={isUser} />
                    </div>
                  </div>
                );
              })}

              {/* Busy Thinking Indicator */}
              {busy && (
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      backgroundColor: "rgba(124, 58, 237, 0.3)",
                      border: "1px solid #a855f7",
                      display: "grid",
                      placeItems: "center",
                      color: "#c084fc",
                    }}
                  >
                    <Bot size={16} />
                  </div>
                  <div
                    style={{
                      padding: "12px 18px",
                      borderRadius: "14px",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      color: "#94a3b8",
                      fontSize: "13px",
                    }}
                  >
                    <ClockSpinner size={18} />
                    <span>{busyStatus}</span>
                  </div>
                </div>
              )}

              {/* Action & Proposal Cards */}
              {cards.length > 0 && (
                <div style={{ display: "grid", gap: "12px", marginTop: "12px" }}>
                  {cards.map((card, index) => (
                    <ActionCard
                      key={`${card.toolName}-${index}`}
                      card={card}
                      busy={busy}
                      bookingHref={bookingHref}
                      orgCurrency={orgCurrency}
                      tenantSlug={slug}
                      onConfirm={() => confirm(card)}
                      onPromptClick={(prompt) => void sendText(prompt)}
                    />
                  ))}
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* Input Submission Bar */}
            <form
              onSubmit={send}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "10px",
                marginTop: "20px",
                paddingTop: "16px",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={!conversation || busy || unavailable}
                placeholder="Ask a question or request an appointment (e.g. 'Can I book a haircut tomorrow afternoon?')..."
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: "#f8fafc",
                  fontSize: "14px",
                  outline: "none",
                }}
              />

              <button
                type="submit"
                disabled={!conversation || busy || !message.trim() || unavailable}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "12px 20px",
                  borderRadius: "10px",
                  backgroundColor: accentColor,
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 800,
                  border: "none",
                  cursor: !conversation || busy || !message.trim() || unavailable ? "not-allowed" : "pointer",
                  boxShadow: `0 4px 14px ${accentColor}40`,
                }}
              >
                <span>Send</span>
                <Send size={15} />
              </button>
            </form>
          </GlassCard>

          <p style={{ color: "#64748b", fontSize: "12px", textAlign: "center", marginTop: "16px" }}>
            🔒 End-to-end protected. Never input payment card numbers, passwords, or personal medical details into chat.
          </p>
        </div>
      </div>
    </CustomerPortalShell>
  );
}

function renderInlineContent(text: string): React.ReactNode {
  // Strip leading asterisks, dashes, bullet symbols, or excess spaces
  const clean = text.replace(/^[*\-•\s]+/, "");
  const parts: React.ReactNode[] = [];
  const tokenRegex = /(\[([^\]]+)\]\(([^)]+)\))|((?:https?:\/\/|\/book\/)[^\s<>"')]+)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(clean)) !== null) {
    if (match.index > lastIndex) {
      parts.push(clean.slice(lastIndex, match.index));
    }
    const [_, mdLink, mdLabel, mdUrl, rawUrl, boldText, italicText] = match;

    if (mdLink && mdUrl) {
      const isBooking = mdUrl.startsWith("/book/") || mdUrl.includes("/book/");
      if (isBooking) {
        parts.push(
          <a
            key={`link-${match.index}`}
            href={mdUrl}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              borderRadius: "8px",
              backgroundColor: "#0284c7",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 750,
              textDecoration: "none",
              margin: "4px 2px",
              boxShadow: "0 2px 8px rgba(2, 132, 199, 0.4)",
              cursor: "pointer",
            }}
          >
            <CreditCard size={14} />
            <span>{mdLabel || "Proceed to Checkout"}</span>
            <ArrowRight size={13} />
          </a>
        );
      } else {
        parts.push(
          <a
            key={`link-${match.index}`}
            href={mdUrl}
            target={mdUrl.startsWith("http") ? "_blank" : "_self"}
            rel="noopener noreferrer"
            style={{ color: "#38bdf8", textDecoration: "underline", fontWeight: 650 }}
          >
            {mdLabel}
          </a>
        );
      }
    } else if (rawUrl) {
      const isBooking = rawUrl.startsWith("/book/") || rawUrl.includes("/book/");
      if (isBooking) {
        parts.push(
          <a
            key={`url-${match.index}`}
            href={rawUrl}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              borderRadius: "8px",
              backgroundColor: "#0284c7",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 750,
              textDecoration: "none",
              margin: "4px 2px",
              boxShadow: "0 2px 8px rgba(2, 132, 199, 0.4)",
              cursor: "pointer",
            }}
          >
            <CreditCard size={14} />
            <span>Proceed to Checkout</span>
            <ArrowRight size={13} />
          </a>
        );
      } else {
        parts.push(
          <a
            key={`url-${match.index}`}
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#38bdf8", textDecoration: "underline", fontWeight: 650 }}
          >
            {rawUrl}
          </a>
        );
      }
    } else if (boldText) {
      parts.push(
        <strong key={`b-${match.index}`} style={{ fontWeight: 750, color: "#f8fafc" }}>
          {boldText.slice(2, -2)}
        </strong>
      );
    } else if (italicText) {
      parts.push(
        <span key={`i-${match.index}`} style={{ fontWeight: 600, color: "#e2e8f0" }}>
          {italicText.slice(1, -1)}
        </span>
      );
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < clean.length) {
    parts.push(clean.slice(lastIndex));
  }

  return parts.length > 0 ? parts : clean;
}

function FormattedChatMessage({ content, isUser }: { content: string; isUser: boolean }) {
  if (!content) return null;
  if (isUser) {
    return <div>{content}</div>;
  }

  const rawLines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];

  const flushList = (key: number) => {
    if (currentList.length > 0) {
      elements.push(
        <div key={`list-${key}`} style={{ display: "grid", gap: "8px", margin: "8px 0" }}>
          {currentList}
        </div>
      );
      currentList = [];
    }
  };

  rawLines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList(index);
      return;
    }

    // Detect bullet or numbered items: e.g. "* ...", "- ...", "• ...", "1. ..."
    const bulletMatch = trimmed.match(/^([*\-•]|\d+[.)])\s+(.*)$/);
    if (bulletMatch) {
      const itemText = bulletMatch[2];
      currentList.push(
        <div
          key={`item-${index}`}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            lineHeight: 1.55,
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "#38bdf8",
              marginTop: "8px",
              flexShrink: 0,
              boxShadow: "0 0 6px rgba(56, 189, 248, 0.7)",
            }}
          />
          <div style={{ flex: 1, color: "#f1f5f9" }}>{renderInlineContent(itemText)}</div>
        </div>
      );
    } else {
      flushList(index);
      elements.push(
        <div
          key={`p-${index}`}
          style={{
            margin: elements.length === 0 ? "0" : "8px 0 0",
            lineHeight: 1.6,
            color: "#f1f5f9",
          }}
        >
          {renderInlineContent(trimmed)}
        </div>
      );
    }
  });

  flushList(rawLines.length);

  return <div style={{ display: "grid", gap: "4px" }}>{elements}</div>;
}

function formatPrice(
  amountCents: number | undefined | null,
  currency?: string,
  fallbackCurrency?: string
): string {
  if (amountCents === undefined || amountCents === null || isNaN(Number(amountCents))) return "";
  const code = (currency || fallbackCurrency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amountCents) / 100);
  } catch {
    return `${code} ${(Number(amountCents) / 100).toFixed(2)}`;
  }
}

function ActionCard({
  card,
  busy,
  bookingHref,
  orgCurrency,
  tenantSlug,
  onConfirm,
  onPromptClick,
}: {
  card: AIActionCard;
  busy: boolean;
  bookingHref: string;
  orgCurrency?: string;
  tenantSlug?: string;
  onConfirm: () => void;
  onPromptClick?: (prompt: string) => void;
}) {
  const isConfirmed = card.kind === "CANONICAL_REFETCH" || card.kind === "BOOKING_RECEIPT" || card.kind === "HOLD_RELEASED";
  const isProposal = card.kind === "CONFIRMATION";

  return (
    <GlassCard
      variant="card"
      glow={isConfirmed ? "subtle" : isProposal ? "primary" : "subtle"}
      depth3D
      style={{
        padding: "20px 24px",
        borderColor: isConfirmed
          ? "rgba(52, 211, 153, 0.4)"
          : isProposal
          ? "rgba(56, 189, 248, 0.45)"
          : "rgba(255, 255, 255, 0.12)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        <div>
          <div
            style={{
              fontSize: "10.5px",
              fontWeight: 900,
              letterSpacing: "0.08em",
              color: isConfirmed ? "#34d399" : "#38bdf8",
              textTransform: "uppercase",
              marginBottom: "4px",
            }}
          >
            AUTHORITATIVE BACKEND ACTION • {card.kind.replaceAll("_", " ")}
          </div>
          <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
            {card.title}
          </h3>
        </div>
      </div>

      {card.kind === "APPOINTMENT_LIST" ? (
        <AppointmentListCard data={card.data} orgCurrency={orgCurrency} onPromptClick={onPromptClick} />
      ) : card.kind === "SERVICE_CATALOG" ? (
        <ServiceCatalogCard data={card.data} orgCurrency={orgCurrency} onPromptClick={onPromptClick} />
      ) : card.kind === "AVAILABILITY_SLOTS" ? (
        <AvailabilitySlotsCard data={card.data} orgCurrency={orgCurrency} onPromptClick={onPromptClick} />
      ) : card.kind === "BOOKING_RECEIPT" ? (
        <BookingReceiptCard data={card.data} orgCurrency={orgCurrency} onPromptClick={onPromptClick} />
      ) : card.kind === "HOLD_RELEASED" ? (
        <HoldReleasedCard data={card.data} onPromptClick={onPromptClick} />
      ) : card.kind === "WAITLIST_STATUS" ? (
        <WaitlistStatusCard data={card.data} onPromptClick={onPromptClick} />
      ) : card.kind === "POLICY_SUMMARY" ? (
        <PolicySummaryCard data={card.data} orgCurrency={orgCurrency} />
      ) : card.kind === "ACCOUNT_SUMMARY" ? (
        <AccountSummaryCard data={card.data} onPromptClick={onPromptClick} />
      ) : isProposal ? (
        <ProposalCard card={card} busy={busy} orgCurrency={orgCurrency} tenantSlug={tenantSlug} onConfirm={onConfirm} onPromptClick={onPromptClick} />
      ) : (
        <GenericResultCard data={card.data} />
      )}

      {card.kind === "PAYMENT_HANDOFF" && (
        <div style={{ marginTop: "14px", padding: "12px 16px", borderRadius: "10px", backgroundColor: "rgba(56, 189, 248, 0.12)", border: "1px solid rgba(56, 189, 248, 0.3)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#f8fafc", display: "block" }}>
              Secure Payment Checkout
            </span>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>
              BookPro validates payments directly through Stripe.
            </span>
          </div>
          <Link
            href={bookingHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "#0284c7",
              color: "#fff",
              fontWeight: 800,
              fontSize: "13px",
              textDecoration: "none",
              padding: "8px 16px",
              borderRadius: "8px",
            }}
          >
            <span>Checkout</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </GlassCard>
  );
}

function AppointmentListCard({
  data,
  orgCurrency,
  onPromptClick,
}: {
  data: Record<string, unknown>;
  orgCurrency?: string;
  onPromptClick?: (prompt: string) => void;
}) {
  const appointments = (data?.appointments as any[]) || [];
  if (!appointments.length) {
    return (
      <div style={{ padding: "14px 0", color: "#94a3b8", fontSize: "13.5px", display: "flex", alignItems: "center", gap: "8px" }}>
        <Calendar size={16} color="#64748b" />
        <span>{String(data?.message || "No appointments found for this account.")}</span>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "12px", marginTop: "12px" }}>
      {appointments.map((appt, idx) => {
        const startDate = new Date(appt.startAt);
        const endDate = new Date(appt.endAt);
        const dateStr = startDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
        const timeStr = `${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
        const price = appt.priceCents ? formatPrice(appt.priceCents, appt.currency, orgCurrency) : null;

        const isCancelled = appt.status === "CANCELLED";
        const isConfirmed = appt.status === "CONFIRMED";

        return (
          <div
            key={appt.id || idx}
            style={{
              padding: "16px",
              borderRadius: "12px",
              backgroundColor: "rgba(15, 23, 42, 0.75)",
              border: `1px solid ${isCancelled ? "rgba(244, 63, 94, 0.25)" : "rgba(255, 255, 255, 0.08)"}`,
              display: "grid",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <h4 style={{ fontSize: "15px", fontWeight: 700, color: "#f8fafc", margin: "0 0 4px" }}>
                  {appt.serviceName || appt.service?.name || "Appointment"}
                </h4>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "#94a3b8" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <User size={13} color="#38bdf8" />
                    {appt.staffDisplayName || appt.staff?.name || "Assigned Specialist"}
                  </span>
                  <span>•</span>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <MapPin size={13} color="#94a3b8" />
                    {appt.locationName || appt.location?.name || "Salon Location"}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 800,
                    padding: "3px 8px",
                    borderRadius: "6px",
                    textTransform: "uppercase",
                    backgroundColor: isConfirmed ? "rgba(16, 185, 129, 0.15)" : isCancelled ? "rgba(244, 63, 94, 0.15)" : "rgba(148, 163, 184, 0.15)",
                    color: isConfirmed ? "#34d399" : isCancelled ? "#f87171" : "#94a3b8",
                    border: `1px solid ${isConfirmed ? "rgba(16, 185, 129, 0.3)" : isCancelled ? "rgba(244, 63, 94, 0.3)" : "rgba(148, 163, 184, 0.3)"}`,
                  }}
                >
                  {appt.status}
                </span>
                {price && (
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#f8fafc" }}>
                    {price}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px", color: "#cbd5e1", backgroundColor: "rgba(255, 255, 255, 0.03)", padding: "8px 12px", borderRadius: "8px" }}>
              <Calendar size={14} color="#38bdf8" />
              <span>{dateStr}</span>
              <span>•</span>
              <Clock size={14} color="#38bdf8" />
              <span>{timeStr}</span>
              {appt.durationMin && <span style={{ color: "#64748b" }}>({appt.durationMin}m)</span>}
            </div>

            {!isCancelled && onPromptClick && (
              <div style={{ display: "flex", gap: "8px", marginTop: "4px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => onPromptClick(`I'd like to reschedule my appointment for ${appt.serviceName || appt.service?.name || "service"} on ${dateStr}`)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(56, 189, 248, 0.1)",
                    border: "1px solid rgba(56, 189, 248, 0.25)",
                    color: "#38bdf8",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <RefreshCw size={12} />
                  <span>Reschedule</span>
                </button>
                <button
                  type="button"
                  onClick={() => onPromptClick(`Please cancel my appointment for ${appt.serviceName || appt.service?.name || "service"} on ${dateStr}`)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(244, 63, 94, 0.1)",
                    border: "1px solid rgba(244, 63, 94, 0.25)",
                    color: "#f87171",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <X size={12} />
                  <span>Cancel</span>
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ServiceCatalogCard({
  data,
  orgCurrency,
  onPromptClick,
}: {
  data: Record<string, unknown>;
  orgCurrency?: string;
  onPromptClick?: (prompt: string) => void;
}) {
  const services = (data?.services as any[]) || [];
  if (!services.length) {
    return <div style={{ color: "#94a3b8", fontSize: "13px" }}>No matching services available at this time.</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "10px", marginTop: "12px" }}>
      {services.map((svc) => {
        const price = svc.priceCents ? formatPrice(svc.priceCents, svc.currency, orgCurrency) : null;
        const depositRequired = svc.depositType && svc.depositType !== "NONE";

        return (
          <div
            key={svc.id}
            style={{
              padding: "14px",
              borderRadius: "10px",
              backgroundColor: "rgba(15, 23, 42, 0.75)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "10px",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "4px" }}>
                <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
                  {svc.name}
                </h4>
                {price && (
                  <span style={{ fontSize: "13px", fontWeight: 800, color: "#38bdf8", flexShrink: 0 }}>
                    {price}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "#94a3b8" }}>
                <Clock size={12} />
                <span>{svc.durationMin} min</span>
                {svc.category && (
                  <>
                    <span>•</span>
                    <span>{svc.category}</span>
                  </>
                )}
                {depositRequired && (
                  <span style={{ backgroundColor: "rgba(251, 191, 36, 0.15)", color: "#fbbf24", padding: "1px 5px", borderRadius: "4px", fontSize: "10.5px", fontWeight: 700 }}>
                    Deposit req.
                  </span>
                )}
              </div>
            </div>

            {onPromptClick && (
              <button
                type="button"
                onClick={() => onPromptClick(`Find available appointment slots for ${svc.name}`)}
                style={{
                  padding: "7px 12px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(56, 189, 248, 0.12)",
                  border: "1px solid rgba(56, 189, 248, 0.25)",
                  color: "#38bdf8",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  width: "100%",
                }}
              >
                <span>Check Availability</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AvailabilitySlotsCard({
  data,
  orgCurrency,
  onPromptClick,
}: {
  data: Record<string, unknown>;
  orgCurrency?: string;
  onPromptClick?: (prompt: string) => void;
}) {
  const slots = (data?.slots as any[]) || [];
  if (!slots.length) {
    return (
      <div style={{ padding: "12px 0", color: "#94a3b8", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
        <Clock size={16} color="#64748b" />
        <span>No verified slots currently available for the selected range. Consider joining the waitlist!</span>
      </div>
    );
  }

  const currency = (data?.currency as string) || orgCurrency || "USD";
  const servicePrice = data?.priceCents ? formatPrice(Number(data.priceCents), currency, orgCurrency) : null;
  const depositRequired = Boolean(data?.depositRequired || (data?.depositType && data?.depositType !== "NONE"));

  return (
    <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", fontSize: "12px", color: "#94a3b8" }}>
        <div>
          Showing {slots.length} available {slots.length === 1 ? "slot" : "slots"} (Timezone: {String(data?.presentationTimezone || data?.timezone || "Local")})
          {Boolean(data?.serviceName) && <span style={{ color: "#f8fafc", fontWeight: 700 }}> • {String(data.serviceName)}</span>}
          {Boolean(servicePrice) && <span style={{ color: "#38bdf8", fontWeight: 700 }}> • {servicePrice}</span>}
        </div>
        {depositRequired ? (
          <span style={{ backgroundColor: "rgba(251, 191, 36, 0.15)", color: "#fbbf24", padding: "2px 7px", borderRadius: "5px", fontSize: "11px", fontWeight: 700 }}>
            Deposit Required
          </span>
        ) : (
          <span style={{ backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#34d399", padding: "2px 7px", borderRadius: "5px", fontSize: "11px", fontWeight: 700 }}>
            Zero Deposit
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
        {slots.slice(0, 15).map((slot, idx) => {
          const start = new Date(slot.startTime);
          const end = new Date(slot.endTime);
          const timeDisplay = `${start.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" })} • ${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

          return (
            <div
              key={idx}
              style={{
                padding: "12px",
                borderRadius: "10px",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(56, 189, 248, 0.2)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              <div>
                <div style={{ fontSize: "12.5px", fontWeight: 750, color: "#f8fafc" }}>
                  {timeDisplay}
                </div>
                {slot.staffName && (
                  <div style={{ fontSize: "11.5px", color: "#94a3b8", display: "flex", alignItems: "center", gap: "4px", marginTop: "3px" }}>
                    <User size={12} color="#38bdf8" />
                    <span>{slot.staffName}</span>
                  </div>
                )}
              </div>

              {onPromptClick && (
                <button
                  type="button"
                  onClick={() => {
                    const svcParam = data?.serviceName ? ` for ${data.serviceName}` : "";
                    const staffParam = slot.staffName ? ` with ${slot.staffName}` : "";
                    const dateObj = new Date(slot.startTime);
                    const timeStr = dateObj.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                    const dateStr = dateObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                    onPromptClick(`Please place a booking hold for the ${timeStr} slot on ${dateStr}${staffParam}${svcParam}`);
                  }}
                  style={{
                    padding: "7px 12px",
                    borderRadius: "6px",
                    backgroundColor: "#0284c7",
                    color: "#fff",
                    fontSize: "12px",
                    fontWeight: 750,
                    border: "none",
                    cursor: "pointer",
                    textAlign: "center",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  <span>Select This Slot</span>
                  <ArrowRight size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WaitlistStatusCard({
  data,
  onPromptClick,
}: {
  data: Record<string, unknown>;
  onPromptClick?: (prompt: string) => void;
}) {
  const entries = (data?.waitlistEntries as any[]) || [];
  if (!entries.length) {
    return (
      <div style={{ padding: "12px 0", color: "#94a3b8", fontSize: "13px" }}>
        No active waitlist entries found.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
      {entries.map((entry) => (
        <div
          key={entry.id}
          style={{
            padding: "14px",
            borderRadius: "10px",
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            display: "grid",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
            <div>
              <h4 style={{ fontSize: "14.5px", fontWeight: 700, color: "#f8fafc", margin: "0 0 2px" }}>
                {entry.serviceName}
              </h4>
              <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                Window: {entry.startWindowDate} to {entry.endWindowDate} • Preference: {entry.timePreference}
              </div>
            </div>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 800,
                padding: "2px 7px",
                borderRadius: "5px",
                backgroundColor: entry.status === "ACTIVE" ? "rgba(56, 189, 248, 0.15)" : "rgba(148, 163, 184, 0.15)",
                color: entry.status === "ACTIVE" ? "#38bdf8" : "#94a3b8",
                border: `1px solid ${entry.status === "ACTIVE" ? "rgba(56, 189, 248, 0.3)" : "rgba(148, 163, 184, 0.3)"}`,
              }}
            >
              {entry.status}
            </span>
          </div>

          {entry.activeOffer && (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: "8px",
                backgroundColor: "rgba(251, 191, 36, 0.12)",
                border: "1px solid rgba(251, 191, 36, 0.3)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#fef3c7" }}>
                🎉 <strong>A slot is ready for you!</strong> Offer window: {new Date(entry.activeOffer.startAt).toLocaleString()}.
              </div>
              {onPromptClick && (
                <button
                  type="button"
                  onClick={() => onPromptClick(`I want to accept the waitlist offer for ${entry.serviceName}`)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "6px",
                    backgroundColor: "#f59e0b",
                    color: "#000",
                    fontSize: "11.5px",
                    fontWeight: 800,
                    border: "none",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  Claim Slot
                </button>
              )}
            </div>
          )}

          {onPromptClick && entry.status === "ACTIVE" && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => onPromptClick(`Please withdraw my waitlist request for ${entry.serviceName}`)}
                style={{
                  padding: "5px 10px",
                  borderRadius: "6px",
                  backgroundColor: "transparent",
                  border: "1px solid rgba(244, 63, 94, 0.3)",
                  color: "#fca5a5",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Withdraw Request
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PolicySummaryCard({
  data,
  orgCurrency,
}: {
  data: Record<string, unknown>;
  orgCurrency?: string;
}) {
  const currency = (data?.currency as string) || orgCurrency;
  const feeDisplay = data?.cancelFeeType === "PERCENTAGE"
    ? `${String(data?.cancelFeeValue || "0")}%`
    : formatPrice(Number(data?.cancelFeeValue || 0), currency, orgCurrency);

  return (
    <div style={{ marginTop: "12px", display: "grid", gap: "12px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "10px",
        }}
      >
        <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Cancellation</div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#f8fafc", marginTop: "2px" }}>
            {String(data?.cancelCutoffHours || "24")}h notice
          </div>
          <div style={{ fontSize: "11px", color: "#64748b" }}>
            Fee: {feeDisplay}
          </div>
        </div>

        <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Rescheduling</div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#f8fafc", marginTop: "2px" }}>
            {String(data?.rescheduleCutoffHours || "12")}h notice
          </div>
          <div style={{ fontSize: "11px", color: "#64748b" }}>No penalty within window</div>
        </div>

        <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Booking Hold</div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#f8fafc", marginTop: "2px" }}>
            {String(data?.holdDurationMinutes || "10")} mins
          </div>
          <div style={{ fontSize: "11px", color: "#64748b" }}>Reservation timer</div>
        </div>
      </div>

      {Boolean(data?.summaryText) && (
        <p style={{ margin: 0, fontSize: "12.5px", color: "#cbd5e1", lineHeight: 1.5, backgroundColor: "rgba(255, 255, 255, 0.03)", padding: "10px 12px", borderRadius: "8px" }}>
          {String(data.summaryText)}
        </p>
      )}
    </div>
  );
}

function AccountSummaryCard({
  data,
  onPromptClick,
}: {
  data: Record<string, unknown>;
  onPromptClick?: (prompt: string) => void;
}) {
  return (
    <div style={{ marginTop: "12px", display: "grid", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "rgba(56, 189, 248, 0.15)", border: "1px solid rgba(56, 189, 248, 0.3)", display: "grid", placeItems: "center", color: "#38bdf8" }}>
          <User size={18} />
        </div>
        <div>
          <div style={{ fontSize: "14.5px", fontWeight: 700, color: "#f8fafc" }}>{String(data?.fullName || "Valued Customer")}</div>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>{String(data?.email || "")}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
        <div style={{ padding: "10px", borderRadius: "8px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255, 255, 255, 0.08)", textAlign: "center" }}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#38bdf8" }}>{String(data?.upcomingAppointmentsCount ?? 0)}</div>
          <div style={{ fontSize: "11px", color: "#94a3b8" }}>Appointments</div>
        </div>
        <div style={{ padding: "10px", borderRadius: "8px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255, 255, 255, 0.08)", textAlign: "center" }}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#fbbf24" }}>{String(data?.activeHoldsCount ?? 0)}</div>
          <div style={{ fontSize: "11px", color: "#94a3b8" }}>Active Holds</div>
        </div>
        <div style={{ padding: "10px", borderRadius: "8px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255, 255, 255, 0.08)", textAlign: "center" }}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#a855f7" }}>{String(data?.activeWaitlistCount ?? 0)}</div>
          <div style={{ fontSize: "11px", color: "#94a3b8" }}>Waitlist</div>
        </div>
      </div>

      {onPromptClick && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => onPromptClick("Show my upcoming appointments")}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor: "rgba(56, 189, 248, 0.1)",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              color: "#38bdf8",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            My Appointments
          </button>
          <button
            type="button"
            onClick={() => onPromptClick("Check my waitlist requests")}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor: "rgba(168, 85, 247, 0.1)",
              border: "1px solid rgba(168, 85, 247, 0.25)",
              color: "#c084fc",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            My Waitlist
          </button>
        </div>
      )}
    </div>
  );
}

function HoldCountdownTimer({ expiresAt }: { expiresAt: string | Date }) {
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    const exp = new Date(expiresAt).getTime();
    return Math.max(0, Math.floor((exp - Date.now()) / 1000));
  });

  useEffect(() => {
    const update = () => {
      const exp = new Date(expiresAt).getTime();
      const left = Math.max(0, Math.floor((exp - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isExpired = secondsLeft <= 0;

  if (isExpired) {
    return (
      <div style={{ color: "#f87171", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", fontWeight: 700 }}>
        <AlertTriangle size={14} color="#f87171" />
        <span>Hold expired</span>
      </div>
    );
  }

  return (
    <div style={{ color: "#fbbf24", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", fontWeight: 700 }}>
      <Clock size={13} color="#fbbf24" />
      <span>
        Holding seat: {minutes}:{seconds < 10 ? `0${seconds}` : seconds} remaining
      </span>
    </div>
  );
}

function ProposalCard({
  card,
  busy,
  orgCurrency,
  tenantSlug,
  onConfirm,
  onPromptClick,
}: {
  card: AIActionCard;
  busy: boolean;
  orgCurrency?: string;
  tenantSlug?: string;
  onConfirm: () => void;
  onPromptClick?: (prompt: string) => void;
}) {
  const data = card.data || {};
  const currency = (data.currency as string) || (data.price as any)?.currency || orgCurrency || "USD";
  const expiresAt = (card.expiresAt || (data.expiresAt as string | undefined)) as string | Date | undefined;
  const isHold = card.toolName === "createBookingHold" || card.toolName === "confirmBooking";
  const isCancel = card.toolName === "cancelBooking";
  const isReschedule = card.toolName === "rescheduleBooking";
  const isWaitlist = card.toolName === "leaveWaitlist";

  const payableNowCents = Number(data.payableNowCents ?? (data.price as any)?.payableNowCents ?? 0);
  const totalCents = Number(data.totalCents ?? (data.price as any)?.totalCents ?? (data.service as any)?.priceCents ?? 0);
  const remainingBalanceCents = Number(data.remainingBalanceCents ?? (data.price as any)?.remainingBalanceCents ?? Math.max(0, totalCents - payableNowCents));

  const [cancelReason, setCancelReason] = useState("Schedule conflict");
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!expiresAt) return;
    const check = () => {
      if (new Date(expiresAt as any).getTime() <= Date.now()) {
        setIsExpired(true);
      }
    };
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const checkoutHref = tenantSlug && data.holdId
    ? `/book/${tenantSlug}?holdId=${encodeURIComponent(String(data.holdId))}&fromAi=true`
    : "#";

  return (
    <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
      <div
        style={{
          padding: "16px",
          borderRadius: "12px",
          backgroundColor: "rgba(15, 23, 42, 0.8)",
          border: "1px solid rgba(56, 189, 248, 0.25)",
          display: "grid",
          gap: "10px",
        }}
      >
        {isHold && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <h4 style={{ fontSize: "15px", fontWeight: 800, color: "#f8fafc", margin: "0 0 4px" }}>
                  Reserved Seat Hold: {String((data.service as any)?.name || data.serviceName || "Treatment")}
                </h4>
                <div style={{ fontSize: "12px", color: "#94a3b8", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  {Boolean(data.staff || data.staffName) && (
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <User size={12} color="#38bdf8" />
                      {String((data.staff as any)?.name || data.staffName)}
                    </span>
                  )}
                  {Boolean(data.startAt) && (
                    <>
                      <span>•</span>
                      <span>Scheduled: {new Date(String(data.startAt)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                    </>
                  )}
                  {Boolean(data.endAt) && (
                    <>
                      <span>–</span>
                      <span>{new Date(String(data.endAt)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                    </>
                  )}
                </div>
              </div>

              {expiresAt && <HoldCountdownTimer expiresAt={expiresAt as string | Date} />}
            </div>

            {/* Price & Deposit Breakdown */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "8px",
                marginTop: "12px",
                padding: "10px",
                borderRadius: "8px",
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              <div>
                <div style={{ fontSize: "11px", color: "#94a3b8" }}>Total Price</div>
                <div style={{ fontSize: "14px", fontWeight: 800, color: "#f8fafc" }}>
                  {formatPrice(totalCents, currency, orgCurrency)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "#94a3b8" }}>Payable Now (Deposit)</div>
                <div style={{ fontSize: "14px", fontWeight: 800, color: payableNowCents > 0 ? "#38bdf8" : "#34d399" }}>
                  {payableNowCents > 0 ? formatPrice(payableNowCents, currency, orgCurrency) : "No Deposit Required"}
                </div>
              </div>
              {remainingBalanceCents > 0 && (
                <div>
                  <div style={{ fontSize: "11px", color: "#94a3b8" }}>Due at Venue</div>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "#fbbf24" }}>
                    {formatPrice(remainingBalanceCents, currency, orgCurrency)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {isReschedule && (
          <div>
            <h4 style={{ fontSize: "15px", fontWeight: 800, color: "#f8fafc", margin: "0 0 4px" }}>
              Reschedule Appointment
            </h4>
            <div style={{ color: "#94a3b8", fontSize: "12.5px", marginTop: "4px" }}>
              From: {new Date(String(data.oldStartAt)).toLocaleString()}
              <br />
              To: <strong style={{ color: "#38bdf8" }}>{new Date(String(data.newStartAt)).toLocaleString()}</strong>
            </div>
          </div>
        )}

        {isCancel && (
          <div>
            <h4 style={{ fontSize: "15px", fontWeight: 800, color: "#f8fafc", margin: "0 0 4px" }}>
              Cancel Appointment {String(data.referenceCode || "")}
            </h4>
            <div style={{ color: "#94a3b8", fontSize: "12.5px", marginTop: "6px", display: "grid", gap: "6px" }}>
              <div>
                Policy Cutoff: <strong>{String(data.cancelCutoffHours || "24")} hours notice</strong>
                {Boolean(data.isShortNoticeBooking) && <span style={{ color: "#fbbf24" }}> (Short-notice lead time applied)</span>}
              </div>
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                <span>Cancellation Fee: <strong style={{ color: Number(data.feeCents || 0) > 0 ? "#f87171" : "#34d399" }}>{formatPrice(Number(data.feeCents || 0), currency, orgCurrency)}</strong></span>
                <span>Refundable: <strong style={{ color: "#38bdf8" }}>{formatPrice(Number(data.refundableCents || 0), currency, orgCurrency)}</strong></span>
              </div>
            </div>

            <div style={{ marginTop: "10px" }}>
              <label style={{ display: "block", fontSize: "11.5px", color: "#94a3b8", marginBottom: "4px" }}>
                Select Cancellation Reason:
              </label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: "#f8fafc",
                  fontSize: "12.5px",
                }}
              >
                <option value="Schedule conflict">Schedule conflict</option>
                <option value="Illness / Personal emergency">Illness / Personal emergency</option>
                <option value="Booked wrong time or service">Booked wrong time or service</option>
                <option value="Change of plans">Change of plans</option>
              </select>
            </div>
          </div>
        )}

        {isWaitlist && (
          <div>
            <h4 style={{ fontSize: "15px", fontWeight: 800, color: "#f8fafc", margin: "0 0 4px" }}>
              Withdraw Waitlist Request
            </h4>
            <div style={{ color: "#94a3b8", fontSize: "12.5px" }}>
              Service: <strong>{String(data.serviceName || "Treatment")}</strong>
            </div>
          </div>
        )}
      </div>

      {/* Button Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        {isHold && onPromptClick ? (
          <button
            type="button"
            onClick={() => onPromptClick("Please cancel my temporary seat hold and release the seat")}
            disabled={busy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "9px 14px",
              borderRadius: "8px",
              backgroundColor: "rgba(244, 63, 94, 0.1)",
              border: "1px solid rgba(244, 63, 94, 0.3)",
              color: "#f87171",
              fontSize: "12.5px",
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            <X size={14} />
            <span>Cancel Hold & Release Seat</span>
          </button>
        ) : <div />}

        <div style={{ display: "flex", gap: "10px" }}>
          {isHold && payableNowCents > 0 ? (
            <Link
              href={checkoutHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "10px 18px",
                borderRadius: "8px",
                backgroundColor: "#0284c7",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 800,
                textDecoration: "none",
                boxShadow: "0 4px 14px rgba(2, 132, 199, 0.4)",
              }}
            >
              <CreditCard size={15} />
              <span>Proceed to Checkout ({formatPrice(payableNowCents, currency, orgCurrency)})</span>
              <ArrowRight size={14} />
            </Link>
          ) : (
            <button
              onClick={onConfirm}
              disabled={busy || isExpired}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "9px 18px",
                borderRadius: "8px",
                backgroundColor: isCancel ? "#ef4444" : "#10b981",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 800,
                border: "none",
                cursor: busy || isExpired ? "not-allowed" : "pointer",
                boxShadow: `0 4px 14px ${isCancel ? "rgba(239, 68, 68, 0.4)" : "rgba(16, 185, 129, 0.4)"}`,
              }}
            >
              <CheckCircle2 size={15} />
              <span>{isCancel ? "Confirm Cancellation" : isHold ? "Confirm Reservation (Zero Deposit)" : "Confirm Action"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BookingReceiptCard({
  data,
  orgCurrency,
  onPromptClick,
}: {
  data: Record<string, unknown>;
  orgCurrency?: string;
  onPromptClick?: (prompt: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const currency = (data?.currency as string) || orgCurrency || "USD";
  const refCode = String(data?.referenceCode || "");
  const apptId = String(data?.appointmentId || "");
  const total = Number(data?.totalCents ?? data?.priceCents ?? 0);
  const paid = Number(data?.paidOnlineCents ?? data?.paidCents ?? 0);
  const balance = Number(data?.remainingBalanceCents ?? Math.max(0, total - paid));

  const startDate = data?.startAt ? new Date(String(data.startAt)) : null;
  const endDate = data?.endAt ? new Date(String(data.endAt)) : null;
  const dateStr = startDate ? startDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "";
  const timeStr = startDate && endDate
    ? `${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : "";

  const handleCopy = () => {
    if (refCode) {
      navigator.clipboard.writeText(refCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadCalendar = () => {
    if (apptId) {
      const url = String(data?.calendarDownloadUrl || data?.calendarIcsUrl || `/api/v1/appointments/public/${apptId}/calendar.ics`);
      window.open(url, "_blank");
    }
  };

  const paymentStatus = String(data?.paymentStatus || "CONFIRMED");
  const isPaid = paymentStatus === "PAID";
  const isNotRequired = paymentStatus === "NOT_REQUIRED";
  const isPartiallyPaid = paymentStatus === "PARTIALLY_PAID";

  return (
    <div style={{ marginTop: "12px", display: "grid", gap: "12px" }}>
      {/* Confirmation Banner */}
      <div
        style={{
          padding: "16px",
          borderRadius: "12px",
          backgroundColor: "rgba(16, 185, 129, 0.12)",
          border: "1px solid rgba(16, 185, 129, 0.35)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              backgroundColor: "rgba(16, 185, 129, 0.2)",
              border: "1px solid rgba(52, 211, 153, 0.4)",
              display: "grid",
              placeItems: "center",
              color: "#34d399",
            }}
          >
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 850, color: "#f8fafc" }}>
              Reservation Confirmed!
            </div>
            <div style={{ fontSize: "12px", color: "#a7f3d0" }}>
              {String(data?.message || "Your appointment has been successfully scheduled and confirmed.")}
            </div>
          </div>
        </div>

        {refCode && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: "14px",
                fontWeight: 800,
                color: "#34d399",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                padding: "6px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(52, 211, 153, 0.3)",
                letterSpacing: "0.05em",
              }}
            >
              {refCode}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              title="Copy Reference Code"
              style={{
                padding: "6px 10px",
                borderRadius: "8px",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: copied ? "#34d399" : "#f8fafc",
                fontSize: "12px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontWeight: 700,
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Appointment Specifics Grid */}
      <div
        style={{
          padding: "16px",
          borderRadius: "12px",
          backgroundColor: "rgba(15, 23, 42, 0.75)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          display: "grid",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <h4 style={{ fontSize: "16px", fontWeight: 800, color: "#f8fafc", margin: "0 0 4px" }}>
              {String(data?.serviceName || "Scheduled Service")}
            </h4>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12.5px", color: "#94a3b8" }}>
              {Boolean(data?.staffDisplayName || data?.staffName) && (
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <User size={13} color="#38bdf8" />
                  {String(data.staffDisplayName || data.staffName)}
                </span>
              )}
              {Boolean(data?.locationName) && (
                <>
                  <span>•</span>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <MapPin size={13} color="#94a3b8" />
                    {String(data.locationName)}
                  </span>
                </>
              )}
            </div>
          </div>

          <span
            style={{
              fontSize: "11px",
              fontWeight: 800,
              padding: "4px 9px",
              borderRadius: "6px",
              textTransform: "uppercase",
              backgroundColor: isPaid || isNotRequired ? "rgba(16, 185, 129, 0.15)" : "rgba(251, 191, 36, 0.15)",
              color: isPaid || isNotRequired ? "#34d399" : "#fbbf24",
              border: `1px solid ${isPaid || isNotRequired ? "rgba(16, 185, 129, 0.3)" : "rgba(251, 191, 36, 0.3)"}`,
            }}
          >
            {isPaid ? "PAID IN FULL" : isNotRequired ? "CONFIRMED • NO DEPOSIT" : isPartiallyPaid ? "DEPOSIT PAID" : paymentStatus}
          </span>
        </div>

        {dateStr && (
          <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12.5px", color: "#cbd5e1", backgroundColor: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: "8px" }}>
            <Calendar size={14} color="#38bdf8" />
            <span style={{ fontWeight: 600 }}>{dateStr}</span>
            <span>•</span>
            <Clock size={14} color="#38bdf8" />
            <span>{timeStr}</span>
          </div>
        )}

        {/* Pricing & Deposit Accounting Table */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "8px",
            paddingTop: "8px",
            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          <div style={{ padding: "8px 10px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.02)" }}>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>Total Price</div>
            <div style={{ fontSize: "14px", fontWeight: 800, color: "#f8fafc", marginTop: "2px" }}>
              {formatPrice(total, currency, orgCurrency)}
            </div>
          </div>
          <div style={{ padding: "8px 10px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.02)" }}>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>Paid Online</div>
            <div style={{ fontSize: "14px", fontWeight: 800, color: "#34d399", marginTop: "2px" }}>
              {formatPrice(paid, currency, orgCurrency)}
            </div>
          </div>
          <div style={{ padding: "8px 10px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.02)" }}>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>Due at Venue</div>
            <div style={{ fontSize: "14px", fontWeight: 800, color: balance > 0 ? "#fbbf24" : "#94a3b8", marginTop: "2px" }}>
              {formatPrice(balance, currency, orgCurrency)}
            </div>
          </div>
        </div>

        {/* Email confirmation & Calendar actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginTop: "4px" }}>
          {Boolean(data?.customerEmail) ? (
            <div style={{ fontSize: "12px", color: "#94a3b8", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={13} color="#34d399" />
              <span>Confirmation sent to <strong>{String(data.customerEmail)}</strong></span>
            </div>
          ) : (
            <div style={{ fontSize: "12px", color: "#94a3b8", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={13} color="#34d399" />
              <span>Confirmation recorded in your customer profile</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleDownloadCalendar}
            style={{
              padding: "7px 14px",
              borderRadius: "8px",
              backgroundColor: "rgba(56, 189, 248, 0.12)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              color: "#38bdf8",
              fontSize: "12.5px",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Download size={14} />
            <span>Add to Calendar (.ics)</span>
          </button>
        </div>
      </div>

      {/* Quick Follow-up Prompts */}
      {onPromptClick && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => onPromptClick("Show my upcoming appointments")}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#f8fafc",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            View My Appointments
          </button>
          <button
            type="button"
            onClick={() => onPromptClick("What other services do you offer?")}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#f8fafc",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Book Another Service
          </button>
        </div>
      )}
    </div>
  );
}

function HoldReleasedCard({
  data,
  onPromptClick,
}: {
  data: Record<string, unknown>;
  onPromptClick?: (prompt: string) => void;
}) {
  return (
    <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
      <div
        style={{
          padding: "14px 18px",
          borderRadius: "10px",
          backgroundColor: "rgba(15, 23, 42, 0.8)",
          border: "1px solid rgba(244, 63, 94, 0.3)",
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            backgroundColor: "rgba(244, 63, 94, 0.15)",
            display: "grid",
            placeItems: "center",
            color: "#f87171",
            flexShrink: 0,
            marginTop: "2px",
          }}
        >
          <X size={16} />
        </div>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#f8fafc" }}>
            Seat Hold Released
          </div>
          <p style={{ fontSize: "12.5px", color: "#94a3b8", margin: "4px 0 0", lineHeight: 1.5 }}>
            {String(data?.message || "Your temporary seat hold was released back to the public schedule. No charges or penalties were incurred.")}
          </p>
          {Boolean(data?.reason) && (
            <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "4px" }}>
              Reason: {String(data.reason)}
            </div>
          )}
        </div>
      </div>

      {onPromptClick && (
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={() => onPromptClick("Find available appointment slots for tomorrow")}
            style={{
              padding: "7px 14px",
              borderRadius: "6px",
              backgroundColor: "rgba(56, 189, 248, 0.12)",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              color: "#38bdf8",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Clock size={13} />
            <span>Search Other Available Slots</span>
          </button>
        </div>
      )}
    </div>
  );
}

function GenericResultCard({ data }: { data: Record<string, unknown> }) {
  if (!data || Object.keys(data).length === 0) return null;

  return (
    <div
      style={{
        marginTop: "12px",
        backgroundColor: "rgba(15, 23, 42, 0.7)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "10px",
        padding: "14px",
        display: "grid",
        gap: "8px",
      }}
    >
      {Object.entries(data).map(([key, value]) => {
        if (typeof value === "object" && value !== null) {
          if (Array.isArray(value)) {
            return (
              <div key={key} style={{ fontSize: "12.5px" }}>
                <span style={{ color: "#94a3b8", fontWeight: 600, textTransform: "capitalize" }}>
                  {key.replace(/([A-Z])/g, " $1")}:
                </span>{" "}
                <span style={{ color: "#f8fafc" }}>({value.length} items)</span>
              </div>
            );
          }
          return null;
        }
        return (
          <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", gap: "12px" }}>
            <span style={{ color: "#94a3b8", fontWeight: 600, textTransform: "capitalize" }}>
              {key.replace(/([A-Z])/g, " $1")}:
            </span>
            <span style={{ color: "#f8fafc", fontWeight: 500, textAlign: "right", wordBreak: "break-all" }}>
              {String(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
