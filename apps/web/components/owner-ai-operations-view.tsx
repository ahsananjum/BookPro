/* Hallmark · macrostructure: Executive AI Operations Co-Pilot · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 */
"use client";

import React, { FormEvent, useEffect, useState, useCallback, useRef } from "react";
import { AIActionCard, AIConversationDto, AIMessageResponseDto } from "@bookpro/contracts";
import { ProtectedRoute } from "./protected-route";
import { useAuth } from "../lib/auth-context";
import { apiFetch } from "../lib/api-client";
import { GlassCard } from "./glass-card";
import { motion, AnimatePresence } from "framer-motion";
import {
  SpotlightCard,
  AnimatedGroup,
  MotionAlert,
  CollapsibleDisclosure,
} from "./motion-primitives";
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
  Check,
  CreditCard,
} from "./icons";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

export function OwnerAIOperationsView() {
  const { user } = useAuth();
  const slug = user?.organizationSlug || "";
  const [organization, setOrganization] = useState<any>(null);

  useEffect(() => {
    if (!slug) return;
    apiFetch(`/organization/by-slug/${encodeURIComponent(slug)}`).then((res) => {
      if (res.success && res.data) setOrganization(res.data);
    });
  }, [slug]);

  const businessName = organization?.brandName || organization?.name || user?.organizationName || "BookPro Studio";
  const orgCurrency = organization?.currency || "USD";

  const storageKey = `bookpro:ai_owner_session:${user?.organizationId || "org"}`;
  const SESSION_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours

  const [conversation, setConversation] = useState<AIConversationDto | null>(null);
  const [cards, setCards] = useState<AIActionCard[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyStatus, setBusyStatus] = useState("Executing authoritative business operations…");
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
        body: JSON.stringify({ channel: "TEXT", scope: "OWNER" }),
      });
      const textResponse = await response.text();
      let body: any;
      try {
        body = JSON.parse(textResponse);
      } catch {
        throw new Error(response.ok ? "Invalid server response format." : "AI service reconnecting. Please retry.");
      }
      if (!response.ok) {
        throw new Error(body?.error?.message || body?.message || "Could not initialize Owner Operations session.");
      }
      setConversation(body);
      setCards([]);
      if (typeof window !== "undefined" && body?.id) {
        window.localStorage.setItem(storageKey, JSON.stringify({
          conversationId: body.id,
          createdAt: Date.now(),
        }));
      }
    } catch (err: any) {
      setUnavailable(true);
      setError(err.message || "Owner AI operations service is currently unavailable.");
    } finally {
      setBusy(false);
    }
  }, [slug, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawSession = window.localStorage.getItem(storageKey);
    if (rawSession) {
      try {
        const parsed = JSON.parse(rawSession);
        const age = Date.now() - (parsed.createdAt || 0);
        if (parsed.conversationId && age < SESSION_TTL_MS) {
          setBusy(true);
          fetch(`${apiBase}/ai/conversations/${encodeURIComponent(parsed.conversationId)}`, {
            headers: { ...(slug ? { "x-tenant-slug": slug } : {}) },
            credentials: "include",
          })
            .then(async (res) => {
              if (!res.ok) throw new Error("Session expired");
              return res.json();
            })
            .then((convData: AIConversationDto) => {
              setConversation(convData);
              const lastMsgWithCards = [...(convData.messages || [])]
                .reverse()
                .find((m: any) => m.role === "ASSISTANT" && Array.isArray(m.cards) && m.cards.length > 0);
              if (lastMsgWithCards?.cards) setCards(lastMsgWithCards.cards);
            })
            .catch(() => {
              void createConversation();
            })
            .finally(() => setBusy(false));
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

  const sendMessage = async (textToSend?: string) => {
    const rawText = textToSend ?? message;
    const text = rawText.trim();
    if (!text || busy || !conversation?.id) return;

    setMessage("");
    setBusy(true);
    setError(null);
    setBusyStatus("Querying live database & executing business operations…");

    const requestId = `req_owner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMessage = {
      role: "USER" as const,
      content: text,
      createdAt: new Date().toISOString(),
    };

    setConversation((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: [...(prev.messages || []), optimisticMessage],
      };
    });

    try {
      const response = await fetch(`${apiBase}/ai/conversations/${encodeURIComponent(conversation.id)}/messages`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(slug ? { "x-tenant-slug": slug } : {}),
        },
        body: JSON.stringify({ message: text, idempotencyKey: requestId }),
      });

      const textResponse = await response.text();
      let body: AIMessageResponseDto;
      try {
        body = JSON.parse(textResponse);
      } catch {
        throw new Error(response.ok ? "Invalid server response format." : "AI operations co-pilot failed to respond.");
      }

      if (!response.ok) {
        throw new Error((body as any)?.error?.message || (body as any)?.message || "Failed to process message.");
      }

      setConversation(body.conversation);
      if (body.cards && body.cards.length > 0) {
        setCards(body.cards);
      }
    } catch (err: any) {
      setError(err.message || "Failed to send message to Owner AI co-pilot.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmProposal = async (proposalId: string, token: string) => {
    if (!conversation?.id || busy) return;
    setBusy(true);
    setError(null);
    setBusyStatus("Authorizing and committing confirmed database mutation…");

    try {
      const requestId = `confirm_owner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const response = await fetch(`${apiBase}/ai/conversations/${encodeURIComponent(conversation.id)}/confirm`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(slug ? { "x-tenant-slug": slug } : {}),
        },
        body: JSON.stringify({
          confirmationToken: token,
          idempotencyKey: requestId,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error?.message || body?.message || "Confirmation failed.");
      }

      // Append confirmation result card and assistant message
      if (body.card) {
        setCards((prev) => [body.card, ...prev.filter((c) => c.kind !== "CONFIRMATION")]);
      }
      void sendMessage("Refresh current status after confirmed action execution.");
    } catch (err: any) {
      setError(err.message || "Could not execute confirmed proposal.");
    } finally {
      setBusy(false);
    }
  };

  const PROMPT_CATEGORIES = [
    {
      category: "Executive & Revenue",
      prompts: [
        "Show today's business performance & revenue",
        "Audit staff commissions & accrued payouts",
        "Review marketing audience telemetry and opt-in rate",
      ],
    },
    {
      category: "Schedule & Staff",
      prompts: [
        "Show today's appointment agenda across all staff",
        "Inspect staff roster and working visibility",
        "Detect schedule gaps and revenue opportunities",
      ],
    },
    {
      category: "CRM & Policies",
      prompts: [
        "Show active waitlist priority queue",
        "Search customer directory for recent clients",
        "Show business cancellation and notice policies",
      ],
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)", maxWidth: "1600px", margin: "0 auto", padding: "16px 24px", gap: "16px" }}>
      {/* Executive Command Header */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "14px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "rgba(56, 189, 248, 0.15)", color: "#38bdf8" }}>
              <Bot size={20} />
            </span>
            <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
              AI Operations Command Center
            </h1>
            <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "6px", backgroundColor: "rgba(52, 211, 153, 0.15)", color: "#34d399", border: "1px solid rgba(52, 211, 153, 0.3)" }}>
              🟢 Live Schedule Engine
            </span>
          </div>
          <p style={{ fontSize: "12px", color: "#94a3b8", margin: "4px 0 0 42px" }}>
            {businessName} • Connected to PostgreSQL models, ScheduleGuard concurrency, CRM, and optimizer
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => createConversation(true)}
            disabled={busy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#cbd5e1",
              fontSize: "12px",
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
            New Operations Session
          </motion.button>
        </div>
      </div>

      {/* Prompt Directives Horizontal Strip */}
      <div style={{ marginBottom: "16px", overflowX: "auto", paddingBottom: "4px" }}>
        <div style={{ display: "flex", gap: "8px", width: "max-content" }}>
          {PROMPT_CATEGORIES.flatMap((c) => c.prompts).map((p, idx) => (
            <motion.button
              key={idx}
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => sendMessage(p)}
              disabled={busy}
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "6px 14px",
                borderRadius: "20px",
                backgroundColor: "rgba(56, 189, 248, 0.08)",
                border: "1px solid rgba(56, 189, 248, 0.22)",
                color: "#93c5fd",
                cursor: busy ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                transition: "background-color 0.15s ease, border-color 0.15s ease",
              }}
            >
              <Sparkles size={12} color="#38bdf8" />
              <span>{p}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Main Integrated Operations Deck */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "rgba(15, 23, 42, 0.75)",
          borderRadius: "16px",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
          overflow: "hidden",
        }}
      >
        {/* Messages and Inline Action Cards Stream */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px 28px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          {conversation?.messages && conversation.messages.length > 0 ? (
            conversation.messages.map((m, idx) => {
              const isUser = m.role === "USER";
              const isLastAssistant = !isUser && idx === conversation.messages.length - 1;
              const messageCards = (m as any).cards || (isLastAssistant ? cards : []);

              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    alignItems: isUser ? "flex-end" : "flex-start",
                    maxWidth: "100%",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      flexDirection: isUser ? "row-reverse" : "row",
                      alignItems: "flex-start",
                      maxWidth: isUser ? "80%" : "100%",
                      width: isUser ? "auto" : "100%",
                    }}
                  >
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "10px",
                        backgroundColor: isUser ? "#2563eb" : "rgba(56, 189, 248, 0.15)",
                        color: isUser ? "#ffffff" : "#38bdf8",
                        border: isUser ? "none" : "1px solid rgba(56, 189, 248, 0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {isUser ? <User size={16} /> : <Bot size={18} />}
                    </div>

                    <div
                      style={{
                        padding: isUser ? "12px 18px" : "16px 22px",
                        borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                        backgroundColor: isUser ? "#1d4ed8" : "rgba(30, 41, 59, 0.65)",
                        border: isUser ? "none" : "1px solid rgba(255, 255, 255, 0.08)",
                        color: "#f8fafc",
                        fontSize: "14px",
                        lineHeight: 1.6,
                        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
                        width: isUser ? "auto" : "100%",
                      }}
                    >
                      {isUser ? (
                        <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                      ) : (
                        <FormattedAssistantText content={m.content} />
                      )}
                    </div>
                  </div>

                  {/* Render Action Cards inline under Assistant messages */}
                  {!isUser && messageCards && messageCards.length > 0 && (
                    <AnimatedGroup
                      stagger={0.05}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px",
                        width: "100%",
                        paddingLeft: "44px",
                        marginTop: "4px",
                      }}
                    >
                      {messageCards.map((card: AIActionCard, cIdx: number) => (
                        <OwnerActionCardItem
                          key={cIdx}
                          card={card}
                          busy={busy}
                          orgCurrency={orgCurrency}
                          onConfirmProposal={handleConfirmProposal}
                          onSendPrompt={(p) => sendMessage(p)}
                        />
                      ))}
                    </AnimatedGroup>
                  )}
                </motion.div>
              );
            })
          ) : (
            <div style={{ margin: "auto", textAlign: "center", color: "#64748b", padding: "60px 20px" }}>
              <Bot size={44} color="#38bdf8" style={{ margin: "0 auto 16px auto", opacity: 0.8 }} />
              <h3 style={{ fontSize: "17px", fontWeight: 800, color: "#cbd5e1", margin: "0 0 8px 0" }}>
                AI Executive Operations Co-Pilot Active
              </h3>
              <p style={{ fontSize: "13px", maxWidth: "480px", margin: "0 auto", lineHeight: "1.5" }}>
                Execute authoritative operational workflows, monitor the autonomous schedule engine, inspect daily agendas, audit staff commissions, and manage client CRM dossiers.
              </p>
            </div>
          )}

          <MotionAlert isVisible={Boolean(busy)} type="info">
            <div style={{ display: "flex", gap: "10px", alignItems: "center", padding: "10px 16px", borderRadius: "10px", backgroundColor: "rgba(56, 189, 248, 0.12)", border: "1px solid rgba(56, 189, 248, 0.25)", width: "fit-content", marginLeft: "44px" }}>
              <RefreshCw size={15} className="animate-spin" color="#38bdf8" />
              <span style={{ fontSize: "13px", color: "#38bdf8", fontWeight: 600 }}>
                {busyStatus}
              </span>
            </div>
          </MotionAlert>

          <MotionAlert isVisible={Boolean(error)} type="error">
            <div style={{ padding: "12px 16px", borderRadius: "10px", backgroundColor: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#f87171", fontSize: "13px", display: "flex", alignItems: "center", gap: "10px", marginLeft: "44px" }}>
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          </MotionAlert>

          <div ref={chatBottomRef} />
        </div>

        {/* Command Deck Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
          style={{
            padding: "16px 24px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            gap: "12px",
            backgroundColor: "rgba(2, 6, 23, 0.7)",
          }}
        >
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Direct the operations engine (e.g. 'Show today\'s appointment agenda', 'Audit waitlist queue', 'Scan schedule gaps')…"
            disabled={busy}
            style={{
              flex: 1,
              padding: "12px 18px",
              borderRadius: "10px",
              backgroundColor: "rgba(15, 23, 42, 0.9)",
              border: "1px solid rgba(255, 255, 255, 0.14)",
              color: "#f8fafc",
              fontSize: "13.5px",
              outline: "none",
            }}
          />
          <motion.button
            type="submit"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={busy || !message.trim()}
            style={{
              padding: "12px 22px",
              borderRadius: "10px",
              backgroundColor: "#0284c7",
              border: "none",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "13.5px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: busy || !message.trim() ? "not-allowed" : "pointer",
              opacity: busy || !message.trim() ? 0.5 : 1,
              boxShadow: "0 4px 14px rgba(2, 132, 199, 0.4)",
            }}
          >
            <Send size={16} />
            Execute
          </motion.button>
        </form>
      </div>
    </div>
  );
}

function OwnerActionCardItem({
  card,
  busy,
  orgCurrency,
  onConfirmProposal,
  onSendPrompt,
}: {
  card: AIActionCard;
  busy: boolean;
  orgCurrency: string;
  onConfirmProposal: (proposalId: string, token: string) => void;
  onSendPrompt: (prompt: string) => void;
}) {
  const isProposal = card.kind === "CONFIRMATION";
  const isRefetch = card.kind === "CANONICAL_REFETCH";

  return (
    <SpotlightCard
      spotlightColor={isProposal ? "rgba(56, 189, 248, 0.16)" : isRefetch ? "rgba(52, 211, 153, 0.16)" : "rgba(168, 85, 247, 0.14)"}
      style={{
        padding: "18px 22px",
        borderRadius: "14px",
        backgroundColor: isProposal
          ? "rgba(14, 165, 233, 0.08)"
          : isRefetch
          ? "rgba(16, 185, 129, 0.08)"
          : "rgba(15, 23, 42, 0.8)",
        border: isProposal
          ? "1px solid rgba(56, 189, 248, 0.4)"
          : isRefetch
          ? "1px solid rgba(52, 211, 153, 0.4)"
          : "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: isProposal ? "#38bdf8" : isRefetch ? "#34d399" : "#a855f7",
            }}
          >
            {card.kind.replaceAll("_", " ")}
          </span>
          <h4 style={{ fontSize: "15px", fontWeight: 800, color: "#f8fafc", margin: "2px 0 0 0" }}>
            {card.title}
          </h4>
        </div>
      </div>

      {card.kind === "BUSINESS_OVERVIEW" && (
        <BusinessOverviewCardView data={card.data} orgCurrency={orgCurrency} onSendPrompt={onSendPrompt} />
      )}
      {card.kind === "STAFF_AGENDA" && (
        <StaffAgendaCardView data={card.data} orgCurrency={orgCurrency} onSendPrompt={onSendPrompt} />
      )}
      {card.kind === "STAFF_ROSTER" && (
        <StaffRosterCardView data={card.data} onSendPrompt={onSendPrompt} />
      )}
      {card.kind === "CUSTOMER_CRM_LIST" && (
        <CustomerCrmCardView data={card.data} orgCurrency={orgCurrency} onSendPrompt={onSendPrompt} />
      )}
      {card.kind === "CUSTOMER_PROFILE" && (
        <CustomerProfileCardView data={card.data} orgCurrency={orgCurrency} onSendPrompt={onSendPrompt} />
      )}
      {card.kind === "WAITLIST_QUEUE" && (
        <WaitlistQueueCardView data={card.data} onSendPrompt={onSendPrompt} />
      )}
      {card.kind === "OPTIMIZER_INSIGHTS" && (
        <OptimizerInsightsCardView data={card.data} orgCurrency={orgCurrency} onSendPrompt={onSendPrompt} />
      )}
      {card.kind === "COMMISSIONS_REPORT" && (
        <CommissionsReportCardView data={card.data} orgCurrency={orgCurrency} />
      )}
      {card.kind === "BUSINESS_POLICIES" && (
        <BusinessPoliciesCardView data={card.data} />
      )}
      {card.kind === "MARKETING_OVERVIEW" && (
        <MarketingTelemetryCardView data={card.data} />
      )}
      {isProposal && (
        <OwnerProposalCardView card={card} busy={busy} onConfirm={onConfirmProposal} />
      )}
      {!["BUSINESS_OVERVIEW", "STAFF_AGENDA", "STAFF_ROSTER", "CUSTOMER_CRM_LIST", "CUSTOMER_PROFILE", "WAITLIST_QUEUE", "OPTIMIZER_INSIGHTS", "COMMISSIONS_REPORT", "BUSINESS_POLICIES", "MARKETING_OVERVIEW", "CONFIRMATION"].includes(card.kind) && (
        <div style={{ fontSize: "12px", color: "#cbd5e1" }}>
          <pre style={{ margin: 0, padding: "10px", borderRadius: "8px", backgroundColor: "rgba(0, 0, 0, 0.4)", overflowX: "auto" }}>
            {JSON.stringify(card.data, null, 2)}
          </pre>
        </div>
      )}
    </SpotlightCard>
  );
}

// ----------------------------------------------------
// 1. BUSINESS OVERVIEW CARD
// ----------------------------------------------------
function BusinessOverviewCardView({ data, orgCurrency, onSendPrompt }: { data: any; orgCurrency: string; onSendPrompt: (p: string) => void }) {
  const kpis = data?.kpis || {};
  const alerts = data?.healthIssues || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
        <div style={{ padding: "10px 12px", borderRadius: "8px", backgroundColor: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ fontSize: "11px", color: "#94a3b8" }}>Today's Revenue</div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#38bdf8" }}>
            {orgCurrency} {((kpis.todayRevenueCents || 0) / 100).toFixed(2)}
          </div>
        </div>
        <div style={{ padding: "10px 12px", borderRadius: "8px", backgroundColor: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ fontSize: "11px", color: "#94a3b8" }}>Today's Bookings</div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#34d399" }}>
            {kpis.todayAppointmentsCount || 0}
          </div>
        </div>
        <div style={{ padding: "10px 12px", borderRadius: "8px", backgroundColor: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ fontSize: "11px", color: "#94a3b8" }}>Occupancy Rate</div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#f59e0b" }}>
            {kpis.utilizationPercentage || 0}%
          </div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div style={{ padding: "8px 12px", borderRadius: "8px", backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.25)" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#f87171", marginBottom: "4px" }}>
            ⚠️ Operational Alerts ({alerts.length})
          </div>
          {alerts.map((al: any, i: number) => (
            <div key={i} style={{ fontSize: "11.5px", color: "#cbd5e1" }}>
              • {al.title || al.message}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={() => onSendPrompt("Show today's appointment agenda across all staff")}
          style={{ fontSize: "11px", padding: "5px 10px", borderRadius: "6px", backgroundColor: "rgba(56, 189, 248, 0.12)", border: "1px solid rgba(56, 189, 248, 0.25)", color: "#38bdf8", cursor: "pointer" }}
        >
          📅 Inspect Today's Agenda
        </button>
        <button
          onClick={() => onSendPrompt("Detect schedule gaps and revenue opportunities")}
          style={{ fontSize: "11px", padding: "5px 10px", borderRadius: "6px", backgroundColor: "rgba(168, 85, 247, 0.12)", border: "1px solid rgba(168, 85, 247, 0.25)", color: "#c084fc", cursor: "pointer" }}
        >
          ⚡ Scan Schedule Gaps
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 2. STAFF AGENDA CARD
// ----------------------------------------------------
function StaffAgendaCardView({
  data,
  orgCurrency,
  onSendPrompt,
}: {
  data: any;
  orgCurrency: string;
  onSendPrompt: (p: string) => void;
}) {
  const items: any[] = data?.appointments || [];
  const [activeTab, setActiveTab] = useState<string>("ALL");

  const filteredItems = items.filter((a) => {
    if (activeTab === "ALL") return true;
    return a.status === activeTab;
  });

  const filterDate = data?.filterDate || "Today";
  const upcomingCount = data?.upcomingCount || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Header Info */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "8px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#38bdf8", padding: "3px 8px", borderRadius: "6px", backgroundColor: "rgba(56, 189, 248, 0.12)", border: "1px solid rgba(56, 189, 248, 0.25)" }}>
            📅 {filterDate}
          </span>
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>
            Total: <strong>{items.length}</strong> appointments
          </span>
        </div>

        <div style={{ display: "flex", gap: "6px" }}>
          {filterDate !== "All Time" ? (
            <button
              onClick={() => onSendPrompt("Show appointments agenda across all time")}
              style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.06)", border: "1px solid rgba(255, 255, 255, 0.1)", color: "#cbd5e1", cursor: "pointer" }}
            >
              View All Time
            </button>
          ) : (
            <button
              onClick={() => onSendPrompt("Show today's appointment agenda across all staff")}
              style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "rgba(56, 189, 248, 0.15)", border: "1px solid rgba(56, 189, 248, 0.3)", color: "#38bdf8", cursor: "pointer" }}
            >
              View Today Only
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      {items.length > 0 && (
        <div style={{ display: "flex", gap: "6px", overflowX: "auto" }}>
          {["ALL", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED"].map((status) => {
            const count = status === "ALL" ? items.length : items.filter((a) => a.status === status).length;
            if (count === 0 && status !== "ALL") return null;
            const isActive = activeTab === status;
            return (
              <button
                key={status}
                onClick={() => setActiveTab(status)}
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: "6px",
                  backgroundColor: isActive ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 255, 255, 0.04)",
                  border: isActive ? "1px solid rgba(56, 189, 248, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)",
                  color: isActive ? "#38bdf8" : "#94a3b8",
                  cursor: "pointer",
                }}
              >
                {status.replace("_", " ")} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Appointment Items List */}
      {filteredItems.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "360px", overflowY: "auto" }}>
          {filteredItems.map((a: any) => (
            <div
              key={a.id}
              style={{
                padding: "12px 14px",
                borderRadius: "10px",
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.07)",
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div style={{ flex: "1 1 240px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#f8fafc" }}>
                    {a.serviceName || "Appointment"}
                  </span>
                  {a.priceCents > 0 && (
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#34d399", padding: "1px 6px", borderRadius: "4px", backgroundColor: "rgba(52, 211, 153, 0.12)" }}>
                      {a.currency || orgCurrency} {(a.priceCents / 100).toFixed(2)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "3px" }}>
                  👤 <strong>{a.customerName}</strong> • ✂️ {a.staffName || "Unassigned"} • 📍 {a.locationName || "Main"}
                </div>
                <div style={{ fontSize: "11.5px", color: "#cbd5e1", marginTop: "2px" }}>
                  ⏰ {new Date(a.startAt).toLocaleDateString([], { month: "short", day: "numeric" })}{" "}
                  {new Date(a.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {a.endAt && ` – ${new Date(a.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                <div style={{ display: "flex", gap: "4px" }}>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: "4px",
                      backgroundColor:
                        a.status === "CONFIRMED"
                          ? "rgba(56, 189, 248, 0.15)"
                          : a.status === "CHECKED_IN"
                          ? "rgba(168, 85, 247, 0.15)"
                          : a.status === "COMPLETED"
                          ? "rgba(52, 211, 153, 0.15)"
                          : "rgba(239, 68, 68, 0.15)",
                      color:
                        a.status === "CONFIRMED"
                          ? "#38bdf8"
                          : a.status === "CHECKED_IN"
                          ? "#c084fc"
                          : a.status === "COMPLETED"
                          ? "#34d399"
                          : "#f87171",
                    }}
                  >
                    {a.status}
                  </span>
                  {a.paymentStatus && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        backgroundColor: a.paymentStatus === "PAID" ? "rgba(52, 211, 153, 0.12)" : "rgba(245, 158, 11, 0.12)",
                        color: a.paymentStatus === "PAID" ? "#34d399" : "#fbbf24",
                      }}
                    >
                      {a.paymentStatus}
                    </span>
                  )}
                </div>

                {/* Operations Quick Action Buttons */}
                <div style={{ display: "flex", gap: "6px" }}>
                  {a.status === "CONFIRMED" && (
                    <button
                      onClick={() => onSendPrompt(`Update appointment ${a.id} status to CHECKED_IN`)}
                      style={{ fontSize: "10.5px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", backgroundColor: "rgba(52, 211, 153, 0.15)", border: "1px solid rgba(52, 211, 153, 0.3)", color: "#34d399", cursor: "pointer" }}
                    >
                      Check In
                    </button>
                  )}
                  {a.status === "CHECKED_IN" && (
                    <button
                      onClick={() => onSendPrompt(`Update appointment ${a.id} status to COMPLETED`)}
                      style={{ fontSize: "10.5px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", backgroundColor: "rgba(52, 211, 153, 0.2)", border: "1px solid rgba(52, 211, 153, 0.4)", color: "#34d399", cursor: "pointer" }}
                    >
                      Complete
                    </button>
                  )}
                  {["CONFIRMED", "CHECKED_IN"].includes(a.status) && (
                    <>
                      <button
                        onClick={() => onSendPrompt(`Reschedule appointment ${a.id}`)}
                        style={{ fontSize: "10.5px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", backgroundColor: "rgba(56, 189, 248, 0.12)", border: "1px solid rgba(56, 189, 248, 0.25)", color: "#38bdf8", cursor: "pointer" }}
                      >
                        Reschedule
                      </button>
                      <button
                        onClick={() => onSendPrompt(`Cancel appointment ${a.id} with reason: Owner operational request`)}
                        style={{ fontSize: "10.5px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", backgroundColor: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.25)", color: "#f87171", cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "16px", borderRadius: "8px", backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.05)", textAlign: "center" }}>
          <div style={{ fontSize: "13px", color: "#94a3b8" }}>
            No appointments found for {filterDate}{activeTab !== "ALL" ? ` with status ${activeTab}` : ""}.
          </div>
          {upcomingCount > 0 && (
            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "#38bdf8", fontWeight: 600 }}>
                ⚡ {upcomingCount} confirmed appointment{upcomingCount > 1 ? "s" : ""} scheduled in the next 7 days.
              </span>
              <button
                onClick={() => onSendPrompt("Show appointments agenda across all time")}
                style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "6px", backgroundColor: "rgba(56, 189, 248, 0.15)", border: "1px solid rgba(56, 189, 248, 0.3)", color: "#38bdf8", cursor: "pointer" }}
              >
                Inspect All Appointments
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 3. STAFF ROSTER CARD
// ----------------------------------------------------
function StaffRosterCardView({ data, onSendPrompt }: { data: any; onSendPrompt: (p: string) => void }) {
  const staff = data?.staff || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ fontSize: "12px", color: "#94a3b8" }}>Active Staff Roster ({staff.length})</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
        {staff.map((s: any) => (
          <div
            key={s.id}
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#f8fafc" }}>{s.displayName}</div>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>{s.title || "Specialist"}</div>
            <div style={{ marginTop: "6px", display: "flex", gap: "6px" }}>
              <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", backgroundColor: s.isActive ? "rgba(52, 211, 153, 0.15)" : "rgba(239, 68, 68, 0.15)", color: s.isActive ? "#34d399" : "#f87171" }}>
                {s.isActive ? "Active" : "Inactive"}
              </span>
              <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", backgroundColor: s.bookingVisible ? "rgba(56, 189, 248, 0.15)" : "rgba(148, 163, 184, 0.15)", color: s.bookingVisible ? "#38bdf8" : "#94a3b8" }}>
                {s.bookingVisible ? "Booking Visible" : "Hidden"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 4. CUSTOMER CRM LIST CARD
// ----------------------------------------------------
function CustomerCrmCardView({ data, orgCurrency, onSendPrompt }: { data: any; orgCurrency: string; onSendPrompt: (p: string) => void }) {
  const customers = data?.customers || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ fontSize: "12px", color: "#94a3b8" }}>Matching Customers ({customers.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "250px", overflowY: "auto" }}>
        {customers.map((c: any) => (
          <div
            key={c.id}
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#f8fafc" }}>{c.fullName}</div>
              <div style={{ fontSize: "11px", color: "#94a3b8" }}>{c.email} • {c.phone || "No phone"}</div>
            </div>
            <button
              onClick={() => onSendPrompt(`Inspect complete customer 360 profile for ${c.id}`)}
              style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "rgba(56, 189, 248, 0.15)", border: "1px solid rgba(56, 189, 248, 0.3)", color: "#38bdf8", cursor: "pointer" }}
            >
              View 360
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 5. CUSTOMER 360 PROFILE CARD
// ----------------------------------------------------
function CustomerProfileCardView({ data, orgCurrency, onSendPrompt }: { data: any; orgCurrency: string; onSendPrompt: (p: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#f8fafc" }}>{data.fullName}</div>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>{data.email} • {data.phone || "No phone"}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "11px", color: "#94a3b8" }}>Total Spent</div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#34d399" }}>
            {orgCurrency} {((data.totalSpentCents || 0) / 100).toFixed(2)}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
        <div style={{ padding: "8px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)", textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: "#94a3b8" }}>Completed</div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#f8fafc" }}>{data.completedAppointmentsCount || 0}</div>
        </div>
        <div style={{ padding: "8px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)", textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: "#94a3b8" }}>Cancelled</div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#f8fafc" }}>{data.cancelledCount || 0}</div>
        </div>
        <div style={{ padding: "8px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)", textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: "#94a3b8" }}>No Shows</div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#f8fafc" }}>{data.noShowCount || 0}</div>
        </div>
      </div>

      {data.operationalNotes && (
        <div style={{ padding: "8px 10px", borderRadius: "6px", backgroundColor: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.2)", fontSize: "11.5px", color: "#fde68a" }}>
          📌 Staff Note: {data.operationalNotes}
        </div>
      )}

      <button
        onClick={() => onSendPrompt(`Add internal note for customer ${data.id}: `)}
        style={{ fontSize: "11px", padding: "6px 10px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.06)", border: "1px solid rgba(255, 255, 255, 0.12)", color: "#cbd5e1", cursor: "pointer", width: "fit-content" }}
      >
        + Add Internal Note
      </button>
    </div>
  );
}

// ----------------------------------------------------
// 6. WAITLIST QUEUE CARD
// ----------------------------------------------------
function WaitlistQueueCardView({ data, onSendPrompt }: { data: any; onSendPrompt: (p: string) => void }) {
  const queue = data?.queue || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ fontSize: "12px", color: "#94a3b8" }}>Waitlist Requests ({queue.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "250px", overflowY: "auto" }}>
        {queue.map((e: any) => (
          <div
            key={e.id}
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#f8fafc" }}>
                {e.customerName} • {e.serviceName}
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                Window: {e.startWindowDate} to {e.endWindowDate} ({e.timePreference})
              </div>
            </div>
            <button
              onClick={() => onSendPrompt(`Issue waitlist offer for entry ${e.id}`)}
              style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "rgba(52, 211, 153, 0.15)", border: "1px solid rgba(52, 211, 153, 0.3)", color: "#34d399", cursor: "pointer" }}
            >
              Dispatch Offer
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 7. OPTIMIZER INSIGHTS CARD
// ----------------------------------------------------
function OptimizerInsightsCardView({ data, orgCurrency, onSendPrompt }: { data: any; orgCurrency: string; onSendPrompt: (p: string) => void }) {
  const recovery = data?.recoveredRevenue || {};
  const gaps = data?.gaps || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ padding: "8px 10px", borderRadius: "6px", backgroundColor: "rgba(52, 211, 153, 0.08)", border: "1px solid rgba(52, 211, 153, 0.25)", fontSize: "11.5px", color: "#6ee7b7" }}>
        🤖 Automated Schedule Engine operates in the background. Slots opening up via cancellation are automatically matched to waitlist entries with 0-latency.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <div style={{ padding: "8px 10px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ fontSize: "10px", color: "#94a3b8" }}>Total Recovered Revenue</div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#34d399" }}>
            {orgCurrency} {((recovery.totalRecoveredRevenueCents || 0) / 100).toFixed(2)}
          </div>
        </div>
        <div style={{ padding: "8px 10px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ fontSize: "10px", color: "#94a3b8" }}>Recovered Bookings</div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#38bdf8" }}>
            {recovery.recoveredBookingsCount || 0}
          </div>
        </div>
      </div>
      {gaps.length > 0 && (
        <div style={{ fontSize: "12px", color: "#cbd5e1" }}>
          Identified Schedule Gaps: {gaps.length} available openings
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 8. COMMISSIONS REPORT CARD
// ----------------------------------------------------
function CommissionsReportCardView({ data, orgCurrency }: { data: any; orgCurrency: string }) {
  const summary = data?.summary || {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
        <div style={{ padding: "8px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)", textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: "#94a3b8" }}>Total Accrued</div>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#38bdf8" }}>
            {orgCurrency} {((summary.totalAccruedCents || 0) / 100).toFixed(2)}
          </div>
        </div>
        <div style={{ padding: "8px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)", textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: "#94a3b8" }}>Approved</div>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#34d399" }}>
            {orgCurrency} {((summary.totalApprovedCents || 0) / 100).toFixed(2)}
          </div>
        </div>
        <div style={{ padding: "8px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)", textAlign: "center" }}>
          <div style={{ fontSize: "10px", color: "#94a3b8" }}>Paid Out</div>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#f59e0b" }}>
            {orgCurrency} {((summary.totalPaidCents || 0) / 100).toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 9. BUSINESS POLICIES CARD
// ----------------------------------------------------
function BusinessPoliciesCardView({ data }: { data: any }) {
  const policies = data?.policies || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ fontSize: "12px", color: "#94a3b8" }}>Active Governance Configurations ({policies.length})</div>
      {policies.map((p: any) => (
        <div key={p.id} style={{ padding: "8px 10px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)", fontSize: "11.5px", color: "#cbd5e1" }}>
          • Notice window: {p.minNoticeHours}h | Cancellation cutoff: {p.cancelCutoffHours}h | Reschedule cutoff: {p.rescheduleCutoffHours}h | Fee: {p.cancelFeeType} ({p.cancelFeeValue})
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------
// 10. MARKETING TELEMETRY CARD
// ----------------------------------------------------
function MarketingTelemetryCardView({ data }: { data: any }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
      <div style={{ padding: "8px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)", textAlign: "center" }}>
        <div style={{ fontSize: "10px", color: "#94a3b8" }}>Subscribers</div>
        <div style={{ fontSize: "15px", fontWeight: 800, color: "#38bdf8" }}>{data.totalSubscribers || 0}</div>
      </div>
      <div style={{ padding: "8px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)", textAlign: "center" }}>
        <div style={{ fontSize: "10px", color: "#94a3b8" }}>Opt-In Rate</div>
        <div style={{ fontSize: "15px", fontWeight: 800, color: "#34d399" }}>{data.optInRatePct || 0}%</div>
      </div>
      <div style={{ padding: "8px", borderRadius: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)", textAlign: "center" }}>
        <div style={{ fontSize: "10px", color: "#94a3b8" }}>Active Coupons</div>
        <div style={{ fontSize: "15px", fontWeight: 800, color: "#f59e0b" }}>{data.activeCouponsCount || 0}</div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 11. CONFIRMATION PROPOSAL CARD
// ----------------------------------------------------
function OwnerProposalCardView({ card, busy, onConfirm }: { card: AIActionCard; busy: boolean; onConfirm: (pid: string, tok: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
      <div style={{ padding: "10px 12px", borderRadius: "8px", backgroundColor: "rgba(2, 6, 23, 0.6)", border: "1px solid rgba(56, 189, 248, 0.25)" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#38bdf8", marginBottom: "4px" }}>
          Authoritative Action Review
        </div>
        <pre style={{ margin: 0, fontSize: "11.5px", color: "#e2e8f0", whiteSpace: "pre-wrap" }}>
          {JSON.stringify(card.data, null, 2)}
        </pre>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: "#94a3b8" }}>
          ⏰ Proposal expires in 10 minutes
        </span>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            if (card.proposalId && card.confirmationToken) {
              onConfirm(card.proposalId, card.confirmationToken);
            }
          }}
          disabled={busy}
          style={{
            padding: "8px 18px",
            borderRadius: "8px",
            backgroundColor: "#0284c7",
            border: "none",
            color: "#ffffff",
            fontSize: "12.5px",
            fontWeight: 750,
            cursor: busy ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 2px 10px rgba(2, 132, 199, 0.3)",
          }}
        >
          <Check size={14} />
          <span>Confirm & Execute Action</span>
        </motion.button>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// ASSISTANT TEXT FORMATTER
// ----------------------------------------------------
function FormattedAssistantText({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split("\n");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} style={{ height: "4px" }} />;
        }

        // Markdown headings
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={idx} style={{ fontSize: "14px", fontWeight: 700, color: "#38bdf8", margin: "6px 0 2px 0" }}>
              {renderFormattedInline(trimmed.replace(/^###\s+/, ""))}
            </h4>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={idx} style={{ fontSize: "15px", fontWeight: 800, color: "#f1f5f9", margin: "8px 0 4px 0" }}>
              {renderFormattedInline(trimmed.replace(/^##\s+/, ""))}
            </h3>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h2 key={idx} style={{ fontSize: "16px", fontWeight: 800, color: "#ffffff", margin: "10px 0 4px 0" }}>
              {renderFormattedInline(trimmed.replace(/^#\s+/, ""))}
            </h2>
          );
        }

        // Bullet items
        const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ") || /^\d+\.\s/.test(trimmed);
        const bulletText = isBullet ? trimmed.replace(/^[-*]\s+|\d+\.\s+/, "") : trimmed;

        // Key-value metric line (e.g. "**Today's Revenue:** 0 PKR" or "Confirmed Bookings: 4")
        const kvMatch = bulletText.match(/^(\*\*?[^*:]+\*\*?|[^:]+):\s*(.+)$/);
        if (kvMatch && !bulletText.includes("http://") && !bulletText.includes("https://")) {
          const rawKey = kvMatch[1].replace(/\*\*/g, "").trim();
          const rawVal = kvMatch[2].trim();
          return (
            <div
              key={idx}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "3px 10px",
                borderRadius: "6px",
                backgroundColor: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                fontSize: "13px",
                width: "fit-content",
                maxWidth: "100%",
              }}
            >
              <span style={{ color: "#94a3b8", fontWeight: 600 }}>{rawKey}:</span>
              <span style={{ color: "#f8fafc", fontWeight: 700 }}>
                {renderFormattedInline(rawVal)}
              </span>
            </div>
          );
        }

        if (isBullet) {
          return (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                fontSize: "13.5px",
                lineHeight: 1.5,
                color: "#e2e8f0",
                paddingLeft: "4px",
              }}
            >
              <span style={{ color: "#38bdf8", marginTop: "4px", fontSize: "10px" }}>●</span>
              <div>{renderFormattedInline(bulletText)}</div>
            </div>
          );
        }

        return (
          <div key={idx} style={{ fontSize: "13.5px", lineHeight: 1.5, color: "#e2e8f0" }}>
            {renderFormattedInline(trimmed)}
          </div>
        );
      })}
    </div>
  );
}

function renderFormattedInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} style={{ color: "#f8fafc", fontWeight: 700 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

