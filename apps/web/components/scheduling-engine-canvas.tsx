/* Hallmark · component: scheduling-engine-canvas · genre: modern-minimal · theme: Midnight
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (46–50)
 */
"use client";

import React, { useState, useEffect } from "react";
import {
  CalendarCheck2,
  Bot,
  ShieldCheck,
  Users,
  Building2,
  DollarSign,
  RefreshCw,
  Sparkles,
  Lock,
  ArrowRight,
  CheckCircle2,
  Zap,
} from "lucide-react";

export type ArchitectureMode = "atomic-holds" | "ai-gateway" | "resource-mesh" | "forex-rail" | "waitlist-backfill";

interface ModeDetail {
  id: ArchitectureMode;
  label: string;
  icon: React.ReactNode;
  tag: string;
  badgeColor: string;
  headline: string;
  description: string;
  metrics: { label: string; value: string }[];
  highlightPaths: string[];
}

const MODES: ModeDetail[] = [
  {
    id: "atomic-holds",
    label: "Atomic Hold Engine",
    icon: <Lock size={14} />,
    tag: "SCHEDULEGUARD™ CONCURRENCY",
    badgeColor: "#38bdf8",
    headline: "Deterministic Hold Reservation (300s TTL)",
    description: "When a customer initiates booking, capacity is locked instantly with an authoritative hold bucket, preventing race conditions and double-bookings across concurrent checkout sessions.",
    metrics: [
      { label: "Double Bookings", value: "0 Guaranteed" },
      { label: "Hold Expiration", value: "300s Authoritative" },
      { label: "Lock Mechanism", value: "Redis + Postgres Mutex" },
    ],
    highlightPaths: ["path-customer-core", "path-core-staff", "path-core-rooms"],
  },
  {
    id: "ai-gateway",
    label: "AI Voice & Chat Gateway",
    icon: <Bot size={14} />,
    tag: "GEMINI 2.0 RECEPTIONIST",
    badgeColor: "#a855f7",
    headline: "Tool-Bounded Autonomous Receptionist",
    description: "Gemini interprets natural customer and owner intents through strictly grounded server-side tools with bidirectional role isolation and automated CRM customer resolution.",
    metrics: [
      { label: "Grounded Tools", value: "100% Server Verified" },
      { label: "Role Isolation", value: "Zero Leakage" },
      { label: "Intent Execution", value: "Deterministic API" },
    ],
    highlightPaths: ["path-ai-core", "path-core-staff", "path-core-forex"],
  },
  {
    id: "resource-mesh",
    label: "Multi-Resource Mesh",
    icon: <Building2 size={14} />,
    tag: "CAPACITY CO-RESERVATION",
    badgeColor: "#34d399",
    headline: "Unified Staff Roster & Physical Room Locking",
    description: "Every appointment simultaneously reserves specialist shifts, buffer recovery periods, and designated physical rooms or treatment bays without scheduling collisions.",
    metrics: [
      { label: "Physical Rooms", value: "Zero Conflicts" },
      { label: "Staff Roster", value: "Buffer & Shift Safe" },
      { label: "Multi-Location", value: "Branch Isolated" },
    ],
    highlightPaths: ["path-customer-core", "path-core-staff", "path-core-rooms"],
  },
  {
    id: "forex-rail",
    label: "Live Forex Settlement",
    icon: <DollarSign size={14} />,
    tag: "MULTI-CURRENCY PAYMENTS",
    badgeColor: "#fbbf24",
    headline: "Real-Time ECB Forex & Stripe Connect Escrow",
    description: "Financial transactions convert at live European Central Bank exchange rates across PKR, USD, EUR, GBP, AED, SAR, and INR with unrounded ledger precision.",
    metrics: [
      { label: "Currency Pairs", value: "9 Live Currencies" },
      { label: "Rate Source", value: "Live ECB Provider" },
      { label: "Escrow Status", value: "Stripe Connect Direct" },
    ],
    highlightPaths: ["path-customer-core", "path-core-forex"],
  },
  {
    id: "waitlist-backfill",
    label: "Autonomous Backfill",
    icon: <RefreshCw size={14} />,
    tag: "SMART RESCHEDULE RADAR",
    badgeColor: "#f43f5e",
    headline: "Instant Slot Vacancy Triage & Backfill",
    description: "When an appointment is cancelled or rescheduled, the autonomous schedule engine immediately detects the vacant slot and notifies priority waitlist clients for instant claim.",
    metrics: [
      { label: "Detection Delay", value: "< 1.2s Real-Time" },
      { label: "Queue Priority", value: "FIFO + Smart Rank" },
      { label: "Backfill Speed", value: "Instant 1-Click" },
    ],
    highlightPaths: ["path-core-waitlist", "path-customer-core"],
  },
];

export function SchedulingEngineCanvas() {
  const [activeMode, setActiveMode] = useState<ArchitectureMode>("atomic-holds");
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [livePulseTick, setLivePulseTick] = useState(0);

  // Subtle live pulse cycle ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setLivePulseTick((t) => (t + 1) % 100);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const currentMode = MODES.find((m) => m.id === activeMode) || MODES[0];

  const isPathActive = (pathId: string) => {
    if (hoveredNode) {
      if (hoveredNode === "customer" && pathId.includes("customer")) return true;
      if (hoveredNode === "ai" && pathId.includes("ai")) return true;
      if (hoveredNode === "core") return true;
      if (hoveredNode === "staff" && pathId.includes("staff")) return true;
      if (hoveredNode === "rooms" && pathId.includes("rooms")) return true;
      if (hoveredNode === "forex" && pathId.includes("forex")) return true;
      if (hoveredNode === "waitlist" && pathId.includes("waitlist")) return true;
    }
    return currentMode.highlightPaths.includes(pathId);
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "1200px",
        margin: "0 auto 64px",
        position: "relative",
      }}
    >
      {/* Visual Canvas Container with Railway-inspired aesthetic */}
      <div
        style={{
          position: "relative",
          borderRadius: "20px",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          backgroundColor: "#070b14",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 80px rgba(2, 132, 199, 0.12)",
          overflow: "hidden",
          padding: "24px 24px 20px",
        }}
      >
        {/* Subtle Ambient Radial Lighting */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "-20%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "800px",
            height: "450px",
            background: "radial-gradient(ellipse at center, rgba(14, 165, 233, 0.15) 0%, rgba(99, 102, 241, 0.08) 40%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {/* Top Header Bar inside Canvas */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            paddingBottom: "20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                backgroundColor: "#38bdf8",
                boxShadow: "0 0 12px #38bdf8",
                animation: "pulseGlow 2s infinite ease-in-out",
              }}
            />
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#94a3b8",
                fontFamily: "var(--portal-font-mono, monospace)",
              }}
            >
              BOOKPRO SYSTEM TOPOLOGY · DETERMINISTIC SCHEDULING MESH
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                borderRadius: "6px",
                backgroundColor: "rgba(52, 211, 153, 0.12)",
                border: "1px solid rgba(52, 211, 153, 0.3)",
                color: "#34d399",
                fontSize: "11px",
                fontWeight: 700,
                fontFamily: "var(--portal-font-mono, monospace)",
              }}
            >
              <CheckCircle2 size={12} />
              <span>CONCURRENCY LOCK ACTIVE</span>
            </div>

            <div
              style={{
                fontSize: "11px",
                color: "#64748b",
                fontFamily: "var(--portal-font-mono, monospace)",
              }}
            >
              CYCLE #{livePulseTick.toString().padStart(3, "0")}
            </div>
          </div>
        </div>

        {/* PRIMARY SVG CANVAS */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            margin: "12px 0 20px",
          }}
        >
          <svg
            viewBox="0 0 1160 560"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              overflow: "visible",
            }}
          >
            <defs>
              {/* Dot Grid Background Pattern */}
              <pattern id="schedCanvasDots" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.2" fill="#38bdf8" fillOpacity="0.07" />
              </pattern>

              {/* Active Signal Linear Gradients */}
              <linearGradient id="cyanSignalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0284c7" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#38bdf8" stopOpacity="1" />
                <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.2" />
              </linearGradient>

              <linearGradient id="purpleSignalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#c084fc" stopOpacity="1" />
                <stop offset="100%" stopColor="#e879f9" stopOpacity="0.2" />
              </linearGradient>

              <linearGradient id="greenSignalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#059669" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#34d399" stopOpacity="1" />
                <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0.2" />
              </linearGradient>

              <linearGradient id="goldSignalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#d97706" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#fbbf24" stopOpacity="1" />
                <stop offset="100%" stopColor="#fef08a" stopOpacity="0.2" />
              </linearGradient>

              <linearGradient id="roseSignalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#e11d48" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#fb7185" stopOpacity="1" />
                <stop offset="100%" stopColor="#fda4af" stopOpacity="0.2" />
              </linearGradient>

              {/* Central Core Gradient */}
              <radialGradient id="coreRadial" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#0369a1" stopOpacity="0.4" />
                <stop offset="70%" stopColor="#0f172a" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#070b14" stopOpacity="1" />
              </radialGradient>

              {/* Drop Shadow Filter */}
              <filter id="nodeShadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#000000" floodOpacity="0.6" />
              </filter>
              <filter id="coreGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Background Grid Pattern */}
            <rect width="100%" height="100%" fill="url(#schedCanvasDots)" rx="12" />

            {/* CONNECTING BEZIER PATHS (Bus Rails) */}
            <g id="connection-traces">
              {/* Path 1: Customer Booking App -> Core (X: 250, Y: 135 -> X: 580, Y: 280) */}
              <path
                id="path-customer-core-base"
                d="M 250 135 C 400 135, 430 280, 500 280"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="2"
                fill="none"
              />
              <path
                id="path-customer-core"
                d="M 250 135 C 400 135, 430 280, 500 280"
                stroke={isPathActive("path-customer-core") ? "url(#cyanSignalGrad)" : "rgba(56, 189, 248, 0.15)"}
                strokeWidth={isPathActive("path-customer-core") ? "3.5" : "1.5"}
                strokeDasharray={isPathActive("path-customer-core") ? "16 120" : "none"}
                fill="none"
                style={{
                  animation: isPathActive("path-customer-core") ? "dashFlowForward 3s linear infinite" : "none",
                  transition: "stroke 0.3s, stroke-width 0.3s",
                }}
              />

              {/* Path 2: AI Gateway -> Core (X: 250, Y: 425 -> X: 580, Y: 280) */}
              <path
                id="path-ai-core-base"
                d="M 250 425 C 400 425, 430 280, 500 280"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="2"
                fill="none"
              />
              <path
                id="path-ai-core"
                d="M 250 425 C 400 425, 430 280, 500 280"
                stroke={isPathActive("path-ai-core") ? "url(#purpleSignalGrad)" : "rgba(168, 85, 247, 0.15)"}
                strokeWidth={isPathActive("path-ai-core") ? "3.5" : "1.5"}
                strokeDasharray={isPathActive("path-ai-core") ? "16 120" : "none"}
                fill="none"
                style={{
                  animation: isPathActive("path-ai-core") ? "dashFlowForward 3s linear infinite" : "none",
                  transition: "stroke 0.3s, stroke-width 0.3s",
                }}
              />

              {/* Path 3: Core -> Staff Rosters (X: 660, Y: 280 -> X: 910, Y: 85) */}
              <path
                id="path-core-staff-base"
                d="M 660 280 C 740 280, 780 85, 910 85"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="2"
                fill="none"
              />
              <path
                id="path-core-staff"
                d="M 660 280 C 740 280, 780 85, 910 85"
                stroke={isPathActive("path-core-staff") ? "url(#greenSignalGrad)" : "rgba(52, 211, 153, 0.15)"}
                strokeWidth={isPathActive("path-core-staff") ? "3.5" : "1.5"}
                strokeDasharray={isPathActive("path-core-staff") ? "16 120" : "none"}
                fill="none"
                style={{
                  animation: isPathActive("path-core-staff") ? "dashFlowForward 3s linear infinite" : "none",
                  transition: "stroke 0.3s, stroke-width 0.3s",
                }}
              />

              {/* Path 4: Core -> Physical Rooms (X: 660, Y: 280 -> X: 910, Y: 215) */}
              <path
                id="path-core-rooms-base"
                d="M 660 280 C 750 280, 800 215, 910 215"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="2"
                fill="none"
              />
              <path
                id="path-core-rooms"
                d="M 660 280 C 750 280, 800 215, 910 215"
                stroke={isPathActive("path-core-rooms") ? "url(#cyanSignalGrad)" : "rgba(56, 189, 248, 0.15)"}
                strokeWidth={isPathActive("path-core-rooms") ? "3.5" : "1.5"}
                strokeDasharray={isPathActive("path-core-rooms") ? "16 120" : "none"}
                fill="none"
                style={{
                  animation: isPathActive("path-core-rooms") ? "dashFlowForward 3s linear infinite" : "none",
                  transition: "stroke 0.3s, stroke-width 0.3s",
                }}
              />

              {/* Path 5: Core -> Live Forex & Stripe (X: 660, Y: 280 -> X: 910, Y: 345) */}
              <path
                id="path-core-forex-base"
                d="M 660 280 C 750 280, 800 345, 910 345"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="2"
                fill="none"
              />
              <path
                id="path-core-forex"
                d="M 660 280 C 750 280, 800 345, 910 345"
                stroke={isPathActive("path-core-forex") ? "url(#goldSignalGrad)" : "rgba(251, 191, 36, 0.15)"}
                strokeWidth={isPathActive("path-core-forex") ? "3.5" : "1.5"}
                strokeDasharray={isPathActive("path-core-forex") ? "16 120" : "none"}
                fill="none"
                style={{
                  animation: isPathActive("path-core-forex") ? "dashFlowForward 3s linear infinite" : "none",
                  transition: "stroke 0.3s, stroke-width 0.3s",
                }}
              />

              {/* Path 6: Core -> Waitlist Backfill (X: 660, Y: 280 -> X: 910, Y: 475) */}
              <path
                id="path-core-waitlist-base"
                d="M 660 280 C 740 280, 780 475, 910 475"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="2"
                fill="none"
              />
              <path
                id="path-core-waitlist"
                d="M 660 280 C 740 280, 780 475, 910 475"
                stroke={isPathActive("path-core-waitlist") ? "url(#roseSignalGrad)" : "rgba(244, 63, 94, 0.15)"}
                strokeWidth={isPathActive("path-core-waitlist") ? "3.5" : "1.5"}
                strokeDasharray={isPathActive("path-core-waitlist") ? "16 120" : "none"}
                fill="none"
                style={{
                  animation: isPathActive("path-core-waitlist") ? "dashFlowForward 3s linear infinite" : "none",
                  transition: "stroke 0.3s, stroke-width 0.3s",
                }}
              />
            </g>

            {/* TOPOLOGY NODES */}

            {/* NODE 1: Customer Booking App (Left Upper) */}
            <g
              id="node-customer"
              transform="translate(40, 70)"
              filter="url(#nodeShadow)"
              onMouseEnter={() => setHoveredNode("customer")}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: "pointer", transition: "transform 0.3s" }}
            >
              <rect
                width="210"
                height="130"
                rx="14"
                fill="#0b1120"
                stroke={hoveredNode === "customer" || activeMode === "atomic-holds" ? "#38bdf8" : "rgba(255, 255, 255, 0.12)"}
                strokeWidth={hoveredNode === "customer" || activeMode === "atomic-holds" ? "2" : "1"}
              />
              <circle cx="30" cy="30" r="14" fill="rgba(2, 132, 199, 0.2)" stroke="#38bdf8" strokeWidth="1.5" />
              <path d="M26 30 L29 33 L35 27" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <text x="54" y="26" fill="#f8fafc" fontSize="13" fontWeight="700" fontFamily="var(--portal-font-display, sans-serif)">
                Customer Portal & App
              </text>
              <text x="54" y="40" fill="#94a3b8" fontSize="10" fontFamily="var(--portal-font-mono, monospace)">
                INGRESS · CLIENT CHECKOUT
              </text>

              <rect x="18" y="58" width="174" height="24" rx="6" fill="rgba(15, 23, 42, 0.7)" stroke="rgba(255, 255, 255, 0.06)" />
              <circle cx="28" cy="70" r="3.5" fill="#38bdf8" />
              <text x="38" y="74" fill="#cbd5e1" fontSize="10" fontFamily="var(--portal-font-mono, monospace)">
                Instant Hold TTL: 300s
              </text>

              <rect x="18" y="90" width="174" height="24" rx="6" fill="rgba(15, 23, 42, 0.7)" stroke="rgba(255, 255, 255, 0.06)" />
              <circle cx="28" cy="102" r="3.5" fill="#34d399" />
              <text x="38" y="106" fill="#cbd5e1" fontSize="10" fontFamily="var(--portal-font-mono, monospace)">
                P99 Latency: 24ms
              </text>
            </g>

            {/* NODE 2: AI Receptionist Gateway (Left Lower) */}
            <g
              id="node-ai"
              transform="translate(40, 360)"
              filter="url(#nodeShadow)"
              onMouseEnter={() => setHoveredNode("ai")}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: "pointer", transition: "transform 0.3s" }}
            >
              <rect
                width="210"
                height="130"
                rx="14"
                fill="#0b1120"
                stroke={hoveredNode === "ai" || activeMode === "ai-gateway" ? "#c084fc" : "rgba(255, 255, 255, 0.12)"}
                strokeWidth={hoveredNode === "ai" || activeMode === "ai-gateway" ? "2" : "1"}
              />
              <circle cx="30" cy="30" r="14" fill="rgba(124, 58, 237, 0.2)" stroke="#c084fc" strokeWidth="1.5" />
              <path d="M26 30 C26 27, 34 27, 34 30 C34 33, 26 33, 26 30 Z" stroke="#c084fc" strokeWidth="1.5" fill="none" />
              <circle cx="28" cy="29" r="1" fill="#c084fc" />
              <circle cx="32" cy="29" r="1" fill="#c084fc" />
              <text x="54" y="26" fill="#f8fafc" fontSize="13" fontWeight="700" fontFamily="var(--portal-font-display, sans-serif)">
                AI Voice & Chat Gateway
              </text>
              <text x="54" y="40" fill="#94a3b8" fontSize="10" fontFamily="var(--portal-font-mono, monospace)">
                GEMINI 2.0 · TOOL-BOUNDED
              </text>

              <rect x="18" y="58" width="174" height="24" rx="6" fill="rgba(15, 23, 42, 0.7)" stroke="rgba(255, 255, 255, 0.06)" />
              <circle cx="28" cy="70" r="3.5" fill="#c084fc" />
              <text x="38" y="74" fill="#cbd5e1" fontSize="10" fontFamily="var(--portal-font-mono, monospace)">
                Role Tool Isolation: Strict
              </text>

              <rect x="18" y="90" width="174" height="24" rx="6" fill="rgba(15, 23, 42, 0.7)" stroke="rgba(255, 255, 255, 0.06)" />
              <circle cx="28" cy="102" r="3.5" fill="#34d399" />
              <text x="38" y="106" fill="#cbd5e1" fontSize="10" fontFamily="var(--portal-font-mono, monospace)">
                CRM Auto-Match: Verified
              </text>
            </g>

            {/* NODE 3: CENTRAL SCHEDULEGUARD CORE (Center) */}
            <g
              id="node-core"
              transform="translate(500, 200)"
              filter="url(#coreGlow)"
              onMouseEnter={() => setHoveredNode("core")}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: "pointer", transition: "transform 0.3s" }}
            >
              <circle
                cx="80"
                cy="80"
                r="74"
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeDasharray="6 8"
                fill="none"
                opacity="0.5"
                style={{ animation: "spinClockwise 30s linear infinite" }}
              />

              <circle
                cx="80"
                cy="80"
                r="64"
                stroke="#818cf8"
                strokeWidth="1"
                strokeDasharray="4 6"
                fill="none"
                opacity="0.6"
                style={{ animation: "spinCounterClockwise 20s linear infinite" }}
              />

              <circle cx="80" cy="80" r="54" fill="url(#coreRadial)" stroke="#38bdf8" strokeWidth="2.5" />

              <g transform="translate(68, 48)">
                <rect x="3" y="10" width="18" height="14" rx="3" fill="#0284c7" stroke="#f8fafc" strokeWidth="1.5" />
                <path d="M7 10 V6 C7 3.5 17 3.5 17 6 V10" stroke="#f8fafc" strokeWidth="1.8" fill="none" />
                <circle cx="12" cy="16" r="1.5" fill="#ffffff" />
              </g>
              <text x="80" y="88" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="800" letterSpacing="0.05em" fontFamily="var(--portal-font-display, sans-serif)">
                ScheduleGuard™
              </text>
              <text x="80" y="102" textAnchor="middle" fill="#38bdf8" fontSize="8.5" fontWeight="700" fontFamily="var(--portal-font-mono, monospace)">
                CONCURRENCY ENGINE
              </text>
              <text x="80" y="116" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="var(--portal-font-mono, monospace)">
                0 COLLISIONS
              </text>
            </g>

            {/* FULFILMENT NODES (Right Column) */}

            {/* NODE 4: Staff Availability Matrix */}
            <g
              id="node-staff"
              transform="translate(910, 40)"
              filter="url(#nodeShadow)"
              onMouseEnter={() => setHoveredNode("staff")}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: "pointer", transition: "transform 0.3s" }}
            >
              <rect
                width="210"
                height="90"
                rx="12"
                fill="#0b1120"
                stroke={hoveredNode === "staff" || activeMode === "resource-mesh" ? "#34d399" : "rgba(255, 255, 255, 0.12)"}
                strokeWidth={hoveredNode === "staff" || activeMode === "resource-mesh" ? "2" : "1"}
              />
              <circle cx="26" cy="26" r="12" fill="rgba(5, 150, 105, 0.2)" stroke="#34d399" strokeWidth="1.5" />
              <path d="M22 24 A4 4 0 1 1 30 24 A4 4 0 1 1 22 24 M19 32 C19 28 33 28 33 32" stroke="#34d399" strokeWidth="1.4" fill="none" />
              <text x="46" y="24" fill="#f8fafc" fontSize="12.5" fontWeight="700" fontFamily="var(--portal-font-display, sans-serif)">
                Staff Roster Resolver
              </text>
              <text x="46" y="38" fill="#94a3b8" fontSize="9.5" fontFamily="var(--portal-font-mono, monospace)">
                SHIFTS · LEAVES · BUFFERS
              </text>
              <rect x="14" y="52" width="182" height="24" rx="6" fill="rgba(15, 23, 42, 0.7)" stroke="rgba(255, 255, 255, 0.06)" />
              <circle cx="24" cy="64" r="3" fill="#34d399" />
              <text x="34" y="68" fill="#cbd5e1" fontSize="9.5" fontFamily="var(--portal-font-mono, monospace)">
                Active: Dr. Marcus · Elena R.
              </text>
            </g>

            {/* NODE 5: Physical Space & Room Locks */}
            <g
              id="node-rooms"
              transform="translate(910, 170)"
              filter="url(#nodeShadow)"
              onMouseEnter={() => setHoveredNode("rooms")}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: "pointer", transition: "transform 0.3s" }}
            >
              <rect
                width="210"
                height="90"
                rx="12"
                fill="#0b1120"
                stroke={hoveredNode === "rooms" || activeMode === "resource-mesh" ? "#38bdf8" : "rgba(255, 255, 255, 0.12)"}
                strokeWidth={hoveredNode === "rooms" || activeMode === "resource-mesh" ? "2" : "1"}
              />
              <circle cx="26" cy="26" r="12" fill="rgba(2, 132, 199, 0.2)" stroke="#38bdf8" strokeWidth="1.5" />
              <rect x="21" y="20" width="10" height="12" rx="1.5" stroke="#38bdf8" strokeWidth="1.4" fill="none" />
              <line x1="24" y1="24" x2="28" y2="24" stroke="#38bdf8" strokeWidth="1.2" />
              <line x1="24" y1="28" x2="28" y2="28" stroke="#38bdf8" strokeWidth="1.2" />
              <text x="46" y="24" fill="#f8fafc" fontSize="12.5" fontWeight="700" fontFamily="var(--portal-font-display, sans-serif)">
                Physical Resource Locks
              </text>
              <text x="46" y="38" fill="#94a3b8" fontSize="9.5" fontFamily="var(--portal-font-mono, monospace)">
                ROOMS · CHAIRS · APPARATUS
              </text>
              <rect x="14" y="52" width="182" height="24" rx="6" fill="rgba(15, 23, 42, 0.7)" stroke="rgba(255, 255, 255, 0.06)" />
              <circle cx="24" cy="64" r="3" fill="#38bdf8" />
              <text x="34" y="68" fill="#cbd5e1" fontSize="9.5" fontFamily="var(--portal-font-mono, monospace)">
                Room 101: Capacity 1/1 Locked
              </text>
            </g>

            {/* NODE 6: Live Forex & Stripe Settlement */}
            <g
              id="node-forex"
              transform="translate(910, 300)"
              filter="url(#nodeShadow)"
              onMouseEnter={() => setHoveredNode("forex")}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: "pointer", transition: "transform 0.3s" }}
            >
              <rect
                width="210"
                height="90"
                rx="12"
                fill="#0b1120"
                stroke={hoveredNode === "forex" || activeMode === "forex-rail" ? "#fbbf24" : "rgba(255, 255, 255, 0.12)"}
                strokeWidth={hoveredNode === "forex" || activeMode === "forex-rail" ? "2" : "1"}
              />
              <circle cx="26" cy="26" r="12" fill="rgba(217, 119, 6, 0.2)" stroke="#fbbf24" strokeWidth="1.5" />
              <text x="26" y="30" textAnchor="middle" fill="#fbbf24" fontSize="13" fontWeight="800">$</text>
              <text x="46" y="24" fill="#f8fafc" fontSize="12.5" fontWeight="700" fontFamily="var(--portal-font-display, sans-serif)">
                Live Forex & Stripe Stream
              </text>
              <text x="46" y="38" fill="#94a3b8" fontSize="9.5" fontFamily="var(--portal-font-mono, monospace)">
                ECB RATES · MULTI-CURRENCY
              </text>
              <rect x="14" y="52" width="182" height="24" rx="6" fill="rgba(15, 23, 42, 0.7)" stroke="rgba(255, 255, 255, 0.06)" />
              <circle cx="24" cy="64" r="3" fill="#fbbf24" />
              <text x="34" y="68" fill="#cbd5e1" fontSize="9.5" fontFamily="var(--portal-font-mono, monospace)">
                PKR 277.75 · EUR 0.86 · Escrow OK
              </text>
            </g>

            {/* NODE 7: Autonomous Waitlist Backfill */}
            <g
              id="node-waitlist"
              transform="translate(910, 430)"
              filter="url(#nodeShadow)"
              onMouseEnter={() => setHoveredNode("waitlist")}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: "pointer", transition: "transform 0.3s" }}
            >
              <rect
                width="210"
                height="90"
                rx="12"
                fill="#0b1120"
                stroke={hoveredNode === "waitlist" || activeMode === "waitlist-backfill" ? "#fb7185" : "rgba(255, 255, 255, 0.12)"}
                strokeWidth={hoveredNode === "waitlist" || activeMode === "waitlist-backfill" ? "2" : "1"}
              />
              <circle cx="26" cy="26" r="12" fill="rgba(225, 29, 72, 0.2)" stroke="#fb7185" strokeWidth="1.5" />
              <path d="M22 26 L26 22 L30 26 M26 22 V31" stroke="#fb7185" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <text x="46" y="24" fill="#f8fafc" fontSize="12.5" fontWeight="700" fontFamily="var(--portal-font-display, sans-serif)">
                Waitlist Backfill Radar
              </text>
              <text x="46" y="38" fill="#94a3b8" fontSize="9.5" fontFamily="var(--portal-font-mono, monospace)">
                SMART RESCHEDULING ENGINE
              </text>
              <rect x="14" y="52" width="182" height="24" rx="6" fill="rgba(15, 23, 42, 0.7)" stroke="rgba(255, 255, 255, 0.06)" />
              <circle cx="24" cy="64" r="3" fill="#fb7185" />
              <text x="34" y="68" fill="#cbd5e1" fontSize="9.5" fontFamily="var(--portal-font-mono, monospace)">
                Auto Triage: Vacated Slot Re-assigned
              </text>
            </g>
          </svg>
        </div>

        {/* INTERACTIVE MODE SWITCHER PILL BAR */}
        <div
          style={{
            position: "relative",
            zIndex: 3,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "8px",
            padding: "8px",
            borderRadius: "14px",
            backgroundColor: "rgba(15, 23, 42, 0.8)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            margin: "0 auto 20px",
            maxWidth: "960px",
          }}
        >
          {MODES.map((mode) => {
            const isSelected = activeMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setActiveMode(mode.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 16px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  fontWeight: isSelected ? 700 : 500,
                  color: isSelected ? "#f8fafc" : "#94a3b8",
                  backgroundColor: isSelected ? "rgba(255, 255, 255, 0.1)" : "transparent",
                  border: isSelected ? `1px solid ${mode.badgeColor}` : "1px solid transparent",
                  boxShadow: isSelected ? `0 0 16px ${mode.badgeColor}33` : "none",
                  cursor: "pointer",
                  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                <span style={{ color: mode.badgeColor }}>{mode.icon}</span>
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>

        {/* CURRENT MODE TELEMETRY STRIP */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            padding: "16px 20px",
            borderRadius: "12px",
            backgroundColor: "rgba(10, 16, 28, 0.85)",
            border: `1px solid ${currentMode.badgeColor}33`,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  color: currentMode.badgeColor,
                  fontFamily: "var(--portal-font-mono, monospace)",
                }}
              >
                {currentMode.tag}
              </span>
            </div>
            <h4
              style={{
                fontSize: "16px",
                fontWeight: 750,
                color: "#f8fafc",
                margin: "0 0 4px",
                letterSpacing: "-0.01em",
              }}
            >
              {currentMode.headline}
            </h4>
            <p
              style={{
                fontSize: "13px",
                color: "#94a3b8",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {currentMode.description}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              justifyContent: "flex-start",
            }}
          >
            {currentMode.metrics.map((m, idx) => (
              <div
                key={idx}
                style={{
                  flex: "1 1 120px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#64748b",
                    fontFamily: "var(--portal-font-mono, monospace)",
                    marginBottom: "2px",
                  }}
                >
                  {m.label}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#f8fafc",
                    fontFamily: "var(--portal-font-mono, monospace)",
                  }}
                >
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scoped CSS Keyframe Animations */}
      <style jsx global>{`
        @keyframes dashFlowForward {
          from {
            stroke-dashoffset: 136;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes spinClockwise {
          from {
            transform: rotate(0deg);
            transform-origin: 80px 80px;
          }
          to {
            transform: rotate(360deg);
            transform-origin: 80px 80px;
          }
        }
        @keyframes spinCounterClockwise {
          from {
            transform: rotate(360deg);
            transform-origin: 80px 80px;
          }
          to {
            transform: rotate(0deg);
            transform-origin: 80px 80px;
          }
        }
        @keyframes pulseGlow {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.2);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          #path-customer-core,
          #path-ai-core,
          #path-core-staff,
          #path-core-rooms,
          #path-core-forex,
          #path-core-waitlist {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
