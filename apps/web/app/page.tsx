/* Hallmark · macrostructure: Architectural Showcase · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 * Motion Primitives: SpotlightCard, AnimatedGroup, TransitionPanel, CollapsibleDisclosure
 */
"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Building2,
  UsersRound,
  Calendar,
  Lock,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  DollarSign,
  ChevronDown,
  Clock,
  Bot,
  Check,
  Activity,
  CheckCircle,
} from "lucide-react";
import { Globe, User, ArrowRight, ArrowLeft, Zap, Shield } from "../components/icons";
import {
  CalendarPulse,
  ClockSpinner,
  ShieldLock,
  WaveformBars,
  StackedCards,
  PulsingDot,
  FloatingParticles,
} from "../components/animated-svgs";
import { GlassCard, GlassBadge } from "../components/glass-card";
import { SchedulingEngineCanvas } from "../components/scheduling-engine-canvas";
import { motion, AnimatePresence } from "framer-motion";
import {
  SpotlightCard,
  AnimatedGroup,
  TransitionPanel,
  CollapsibleDisclosure,
} from "../components/motion-primitives";

export default function PublicHomePage() {
  const [activeTab, setActiveTab] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const TABS = [
    { id: "roster", name: "Multi-Branch Roster", icon: Building2 },
    { id: "holds", name: "Atomic Hold Locks", icon: Lock },
    { id: "ai", name: "Grounded Gemini AI", icon: Bot },
    { id: "forex", name: "Forex Multi-Currency", icon: Globe },
  ];

  const FAQ_ITEMS = [
    {
      q: "How does BookPro prevent double-booking across staff, rooms, and apparatus?",
      a: "BookPro executes a deterministic multi-resource capacity matrix. When a customer or provider initiates checkout, an atomic hold is recorded in PostgreSQL with an authoritative 10-minute expiry. All availability calculators evaluate staff shifts, custom buffer padding, room allocations, and hold reservations concurrently, ensuring zero collisions even during high-traffic booking rushes.",
    },
    {
      q: "How does the tool-bounded AI Receptionist prevent hallucinations?",
      a: "The Gemini AI engine is strictly sandboxed to Zod-validated tool contracts (e.g. checkAvailability, createHold, lookupAppointment). It possesses zero direct SQL write access. If a requested provider is off-shift or a room lacks required equipment, the underlying engine rejects the operation at the contract boundary, making hallucinations impossible.",
    },
    {
      q: "Can multi-branch organizations isolate data across branches and timezones?",
      a: "Yes. Every branch retains independent operating schedules, holiday exceptions, physical room assets, and regional timezones. Bookings are presented to clients in their local browser time while all database records and SSE event streams remain synchronized in strict UTC.",
    },
    {
      q: "How are multi-currency rates and Stripe settlements managed?",
      a: "Tenants designate their authoritative reporting currency (e.g. USD, EUR, PKR, GBP, AED, CAD). BookPro consumes automated live exchange feeds to convert slot values dynamically. Stripe Connect directs captured payments into the merchant's bank account with authoritative conversion audit logs.",
    },
  ];

  const handleTabChange = (newIdx: number) => {
    setDirection(newIdx > activeTab ? 1 : -1);
    setActiveTab(newIdx);
  };

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        overflowX: "clip",
        backgroundColor: "#070b12",
        color: "#f8fafc",
      }}
    >
      {/* Ambient background particles */}
      <FloatingParticles count={24} />

      {/* Commercial Top Navigation */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          backgroundColor: "rgba(7, 11, 18, 0.88)",
          padding: "16px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            textDecoration: "none",
            color: "#f8fafc",
            fontWeight: 800,
            fontSize: "20px",
            letterSpacing: "-0.03em",
          }}
        >
          <motion.span
            whileHover={{ scale: 1.08, rotate: 3 }}
            whileTap={{ scale: 0.95 }}
            style={{
              display: "grid",
              width: "36px",
              height: "36px",
              placeItems: "center",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #0284c7, #7c3aed)",
              boxShadow: "0 4px 16px rgba(2, 132, 199, 0.4)",
              color: "#fff",
              fontWeight: 900,
            }}
          >
            B
          </motion.span>
          <span>
            Book<span style={{ color: "#38bdf8" }}>Pro</span>
          </span>
        </Link>

        <nav
          aria-label="Commercial navigation"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
          }}
        >
          <a
            href="#architecture"
            style={{
              color: "#94a3b8",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
              transition: "color 0.2s",
            }}
          >
            Architecture
          </a>
          <a
            href="#capabilities"
            style={{
              color: "#94a3b8",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
              transition: "color 0.2s",
            }}
          >
            Capabilities
          </a>
          <a
            href="#portals"
            style={{
              color: "#94a3b8",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
              transition: "color 0.2s",
            }}
          >
            Portals
          </a>
          <Link
            href="/organizations"
            style={{
              color: "#94a3b8",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
              transition: "color 0.2s",
            }}
          >
            Directory
          </Link>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/register/customer"
              style={{
                color: "#c084fc",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                transition: "color 0.2s",
              }}
            >
              <span>Customer Sign Up</span>
              <ArrowRight size={14} />
            </Link>
          </motion.div>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/login"
              style={{
                color: "#e2e8f0",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: 600,
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                backgroundColor: "rgba(15, 23, 42, 0.6)",
                transition: "all 0.2s",
                display: "inline-block",
              }}
            >
              Sign in
            </Link>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.04, boxShadow: "0 6px 20px rgba(2, 132, 199, 0.45)" }}
            whileTap={{ scale: 0.96 }}
          >
            <Link
              href="/register"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "linear-gradient(135deg, #0284c7, #2563eb)",
                color: "#fff",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: 700,
                padding: "8px 18px",
                borderRadius: "8px",
                boxShadow: "0 4px 16px rgba(2, 132, 199, 0.35)",
              }}
            >
              Create workspace <ArrowRight size={15} />
            </Link>
          </motion.div>
        </nav>
      </motion.header>

      {/* Main Commercial Content */}
      <main
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "50px 24px 100px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Eyebrow & Commercial Hero Headline */}
        <section style={{ textAlign: "center", marginBottom: "48px" }}>
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              borderRadius: "9999px",
              backgroundColor: "rgba(14, 165, 233, 0.1)",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              color: "#38bdf8",
              fontSize: "13px",
              fontWeight: 700,
              letterSpacing: "0.04em",
              marginBottom: "24px",
            }}
          >
            <PulsingDot color="#38bdf8" size={6} />
            <span>ENTERPRISE MULTI-TENANT SCHEDULING PLATFORM</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
            style={{
              fontSize: "clamp(2.5rem, 6vw, 4.4rem)",
              fontWeight: 800,
              lineHeight: 1.06,
              letterSpacing: "-0.04em",
              maxWidth: "1020px",
              margin: "0 auto 20px",
              background: "linear-gradient(180deg, #ffffff 30%, #94a3b8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Deterministic scheduling, resource locking & AI customer care.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
            style={{
              color: "#94a3b8",
              fontSize: "clamp(1.05rem, 2vw, 1.25rem)",
              lineHeight: 1.65,
              maxWidth: "800px",
              margin: "0 auto 32px",
            }}
          >
            The intelligent infrastructure layer uniting real-time availability, physical resource locking, staff rosters, multi-location workflows, live Forex payments, and an autonomous AI receptionist.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: "14px",
            }}
          >
            <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="/register"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "14px 28px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #0284c7, #2563eb)",
                  color: "#ffffff",
                  fontSize: "15px",
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 10px 30px rgba(2, 132, 199, 0.4)",
                }}
              >
                <span>Create Business Workspace</span>
                <ArrowRight size={16} />
              </Link>
            </motion.div>

            <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="/register/customer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "14px 24px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(124, 58, 237, 0.15)",
                  border: "1px solid rgba(168, 85, 247, 0.35)",
                  color: "#c084fc",
                  fontSize: "15px",
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 8px 24px rgba(124, 58, 237, 0.2)",
                }}
              >
                <User size={16} />
                <span>Register Customer Account</span>
                <ArrowRight size={15} />
              </Link>
            </motion.div>

            <motion.div whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}>
              <a
                href="#capabilities"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "14px 22px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(15, 23, 42, 0.7)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: "#e2e8f0",
                  fontSize: "15px",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                <Zap size={16} color="#38bdf8" />
                <span>Explore Capabilities</span>
              </a>
            </motion.div>
          </motion.div>

          {/* Real-time Enterprise Metrics Ribbon with AnimatedGroup */}
          <AnimatedGroup
            stagger={0.06}
            style={{
              display: "flex",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: "14px",
              marginTop: "44px",
            }}
          >
            {[
              { label: "Hold Locking Integrity", val: "100% Collision-Free", color: "#38bdf8" },
              { label: "Clock Drift Tolerance", val: "0ms Strict UTC", color: "#34d399" },
              { label: "Live Forex Settlement", val: "9 Global Pairs", color: "#c084fc" },
              { label: "Grounded Gemini AI", val: "100% Tool-Bounded", color: "#fbbf24" },
            ].map((stat, idx) => (
              <div
                key={idx}
                style={{
                  padding: "10px 18px",
                  borderRadius: "12px",
                  backgroundColor: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  boxShadow: "0 4px 14px rgba(0, 0, 0, 0.3)",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: stat.color,
                    boxShadow: `0 0 10px ${stat.color}`,
                  }}
                />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#f8fafc" }}>
                    {stat.val}
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>{stat.label}</div>
                </div>
              </div>
            ))}
          </AnimatedGroup>
        </section>

        {/* SECTION 1: RAILWAY-INSPIRED INTERACTIVE SYSTEM TOPOLOGY CANVAS */}
        <section id="architecture" style={{ scrollMarginTop: "90px", marginBottom: "88px" }}>
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.1em",
                color: "#38bdf8",
                textTransform: "uppercase",
                fontFamily: "var(--portal-font-mono, monospace)",
              }}
            >
              ARCHITECTURE & TRANSACTION MESH
            </span>
            <h2
              style={{
                fontSize: "26px",
                fontWeight: 800,
                color: "#f8fafc",
                margin: "6px 0 0",
                letterSpacing: "-0.02em",
              }}
            >
              Deterministic scheduling on a live visual canvas
            </h2>
          </div>

          <SchedulingEngineCanvas />
        </section>

        {/* NEW SECTION: INTERACTIVE CAPABILITIES DEEP-DIVE (TransitionPanel) */}
        <section id="capabilities" style={{ scrollMarginTop: "90px", marginBottom: "88px" }}>
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.1em",
                color: "#c084fc",
                textTransform: "uppercase",
                fontFamily: "var(--portal-font-mono, monospace)",
              }}
            >
              OPERATIONAL CAPABILITIES DEEP-DIVE
            </span>
            <h2
              style={{
                fontSize: "28px",
                fontWeight: 800,
                color: "#f8fafc",
                margin: "6px 0 0",
                letterSpacing: "-0.02em",
              }}
            >
              Interactive core engine walkthrough
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "14px", marginTop: "6px" }}>
              Explore how BookPro orchestrates shifts, concurrent capacity, artificial intelligence, and global cash flows.
            </p>
          </div>

          {/* Tab Selector Buttons with Animated Layout Pill */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "24px",
            }}
          >
            {TABS.map((tab, idx) => {
              const IconComp = tab.icon;
              const isSelected = activeTab === idx;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(idx)}
                  style={{
                    position: "relative",
                    padding: "10px 20px",
                    borderRadius: "12px",
                    border: isSelected
                      ? "1px solid rgba(56, 189, 248, 0.4)"
                      : "1px solid rgba(255, 255, 255, 0.08)",
                    backgroundColor: isSelected
                      ? "rgba(14, 165, 233, 0.15)"
                      : "rgba(15, 23, 42, 0.6)",
                    color: isSelected ? "#38bdf8" : "#94a3b8",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    transition: "all 150ms ease",
                  }}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="landing-active-tab-indicator"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "12px",
                        backgroundColor: "rgba(56, 189, 248, 0.12)",
                        border: "1px solid rgba(56, 189, 248, 0.4)",
                        pointerEvents: "none",
                      }}
                    />
                  )}
                  <IconComp size={16} />
                  <span style={{ position: "relative", zIndex: 1 }}>{tab.name}</span>
                </button>
              );
            })}
          </div>

          {/* Interactive TransitionPanel Switcher */}
          <SpotlightCard
            spotlightColor="rgba(56, 189, 248, 0.1)"
            style={{
              borderRadius: "20px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              background: "rgba(15, 23, 42, 0.7)",
              padding: "36px",
            }}
          >
            <TransitionPanel activeIndex={activeTab} direction={direction}>
              {/* TAB 0: MULTI-BRANCH ROSTER */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "28px", alignItems: "center" }}>
                <div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#38bdf8", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
                    <Building2 size={15} /> Location & Room Constraint Matrix
                  </div>
                  <h3 style={{ fontSize: "24px", fontWeight: 800, color: "#f8fafc", margin: "0 0 12px", letterSpacing: "-0.02em" }}>
                    Hierarchical Branch & Apparatus Allocation
                  </h3>
                  <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.65", marginBottom: "20px" }}>
                    Each appointment checks physical rooms, specialist shift boundaries, and post-service sanitation buffers. A booking can never be confirmed unless the qualified provider, designated room, and apparatus are all simultaneously unencumbered.
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "10px" }}>
                    {["Dynamic multi-branch operating hours in regional timezones", "Per-service turnaround buffers (+15m cleanup, +30m preparation)", "Equipment locking (treatment chairs, laser bays, MRI scanners)"].map((point, i) => (
                      <li key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#cbd5e1" }}>
                        <CheckCircle size={15} color="#38bdf8" /> {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <div style={{ background: "rgba(7, 11, 18, 0.8)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "14px", padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", paddingBottom: "12px", marginBottom: "14px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8" }}>LIVE BRANCH SIMULATION</span>
                    <span style={{ fontSize: "11px", color: "#34d399", background: "rgba(52, 211, 153, 0.12)", padding: "2px 8px", borderRadius: "9999px", fontWeight: 600 }}>Active • 08:00 - 18:00 EST</span>
                  </div>
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div style={{ padding: "12px", borderRadius: "10px", background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>Primary Facility</div>
                      <div style={{ fontSize: "14px", fontWeight: "700", color: "#f8fafc" }}>Downtown Medical Center (Suite 4B)</div>
                    </div>
                    <div style={{ padding: "12px", borderRadius: "10px", background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>Designated Specialist</div>
                      <div style={{ fontSize: "14px", fontWeight: "700", color: "#38bdf8" }}>Dr. Sarah Lin (Cardiology Specialist)</div>
                    </div>
                    <div style={{ padding: "12px", borderRadius: "10px", background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>Physical Resource Locked</div>
                      <div style={{ fontSize: "14px", fontWeight: "700", color: "#c084fc" }}>Echo Ultrasound Apparatus #2 • Locked for 45m</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* TAB 1: ATOMIC HOLD LOCKS */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "28px", alignItems: "center" }}>
                <div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#34d399", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
                    <Lock size={15} /> Two-Phase Checkout Reservation
                  </div>
                  <h3 style={{ fontSize: "24px", fontWeight: 800, color: "#f8fafc", margin: "0 0 12px", letterSpacing: "-0.02em" }}>
                    Zero Double-Booking Guarantee
                  </h3>
                  <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.65", marginBottom: "20px" }}>
                    Selecting a slot reserves it immediately via an atomic hold lock with a 10-minute countdown. Other clients viewing the schedule see the slot instantly grayed out, preventing concurrent collisions before payment confirmation.
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "10px" }}>
                    {["Immutable hold record stored in PostgreSQL with hard UTC TTL", "Automatic garbage-collection release if checkout is abandoned", "Strict collision-free guarantee under high concurrent traffic"].map((point, i) => (
                      <li key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#cbd5e1" }}>
                        <CheckCircle size={15} color="#34d399" /> {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <div style={{ background: "rgba(7, 11, 18, 0.8)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "14px", padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", paddingBottom: "12px", marginBottom: "14px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8" }}>ACTIVE HOLD RECORD</span>
                    <span style={{ fontSize: "11px", color: "#fbbf24", background: "rgba(245, 158, 11, 0.12)", padding: "2px 8px", borderRadius: "9999px", fontWeight: 700 }}>HOLD-984210</span>
                  </div>
                  <div style={{ textAlign: "center", padding: "16px", background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "12px", marginBottom: "12px" }}>
                    <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>Checkout Lock Expiration</div>
                    <div style={{ fontSize: "32px", fontWeight: "900", color: "#34d399", letterSpacing: "-0.02em", marginTop: "4px" }}>07:42</div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>Slot held server-side across all browser tabs</div>
                  </div>
                  <div style={{ fontSize: "12px", color: "#94a3b8", display: "flex", justifyContent: "space-between" }}>
                    <span>Concurrent attempt #2:</span>
                    <strong style={{ color: "#fb7185" }}>Rejected (409 Conflict: Hold Active)</strong>
                  </div>
                </div>
              </div>

              {/* TAB 2: GROUNDED GEMINI AI */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "28px", alignItems: "center" }}>
                <div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#c084fc", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
                    <Bot size={15} /> Tool-Bounded Conversational Care
                  </div>
                  <h3 style={{ fontSize: "24px", fontWeight: 800, color: "#f8fafc", margin: "0 0 12px", letterSpacing: "-0.02em" }}>
                    Autonomous AI Scheduling Concierge
                  </h3>
                  <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.65", marginBottom: "20px" }}>
                    Trained with strict Zod tool parameters. The assistant answers inquiries, recommends ideal specialist slots, books appointments, and triggers priority waitlists with complete role isolation.
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "10px" }}>
                    {["Zero hallucination: only executes registered backend tools", "Automatic hold generation directly from chat conversation", "Voice and text conversational multi-turn capability"].map((point, i) => (
                      <li key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#cbd5e1" }}>
                        <CheckCircle size={15} color="#c084fc" /> {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <div style={{ background: "rgba(7, 11, 18, 0.8)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "14px", padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", paddingBottom: "10px", marginBottom: "12px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8" }}>GEMINI AGENT SESSION</span>
                    <span style={{ fontSize: "10px", color: "#c084fc", background: "rgba(192, 132, 252, 0.12)", padding: "2px 8px", borderRadius: "9999px", fontWeight: 600 }}>Tool-Bounded</span>
                  </div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <div style={{ alignSelf: "flex-end", background: "rgba(255, 255, 255, 0.06)", padding: "8px 12px", borderRadius: "10px 10px 2px 10px", fontSize: "12px", color: "#f8fafc", maxWidth: "85%" }}>
                      "Do you have a cardiac consultation open Thursday afternoon?"
                    </div>
                    <div style={{ alignSelf: "flex-start", background: "rgba(124, 58, 237, 0.18)", border: "1px solid rgba(168, 85, 247, 0.3)", padding: "8px 12px", borderRadius: "10px 10px 10px 2px", fontSize: "12px", color: "#e2e8f0", maxWidth: "90%" }}>
                      <div style={{ fontSize: "10px", color: "#c084fc", fontWeight: 700, marginBottom: "3px" }}>TOOL: getAvailableSlots()</div>
                      Dr. Sarah Lin is open this Thursday at 2:30 PM in Suite 4B. Shall I place a 10-minute hold for you?
                    </div>
                  </div>
                </div>
              </div>

              {/* TAB 3: FOREX MULTI-CURRENCY */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "28px", alignItems: "center" }}>
                <div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#fbbf24", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
                    <Globe size={15} color="#fbbf24" /> Live Currency Conversion
                  </div>
                  <h3 style={{ fontSize: "24px", fontWeight: 800, color: "#f8fafc", margin: "0 0 12px", letterSpacing: "-0.02em" }}>
                    Multi-Tenant Financial Clearing
                  </h3>
                  <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.65", marginBottom: "20px" }}>
                    Support clients worldwide with automated European Central Bank exchange conversions across 9 currency pairs (PKR, USD, EUR, GBP, AED, SAR, CAD, AUD, INR) with direct Stripe clearing.
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "10px" }}>
                    {["Authoritative organization base currency (USD, EUR, GBP, etc.)", "Real-time client checkout conversions with zero currency loss", "Authoritative settlement logs with live bank exchange sync"].map((point, i) => (
                      <li key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#cbd5e1" }}>
                        <CheckCircle size={15} color="#fbbf24" /> {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <div style={{ background: "rgba(7, 11, 18, 0.8)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "14px", padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", paddingBottom: "10px", marginBottom: "14px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8" }}>FOREX SETTLEMENT ENGINE</span>
                    <span style={{ fontSize: "11px", color: "#34d399", background: "rgba(52, 211, 153, 0.12)", padding: "2px 8px", borderRadius: "9999px", fontWeight: 600 }}>ECB Feed Live</span>
                  </div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px", fontSize: "12px" }}>
                      <span style={{ color: "#94a3b8" }}>Base Currency:</span>
                      <strong style={{ color: "#f8fafc" }}>EUR (€) 120.00</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px", fontSize: "12px" }}>
                      <span style={{ color: "#94a3b8" }}>Converted Client Total:</span>
                      <strong style={{ color: "#38bdf8" }}>USD ($) 130.20</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px", fontSize: "12px" }}>
                      <span style={{ color: "#94a3b8" }}>Stripe Settlement:</span>
                      <strong style={{ color: "#34d399" }}>Direct Bank Transfer</strong>
                    </div>
                  </div>
                </div>
              </div>
            </TransitionPanel>
          </SpotlightCard>
        </section>

        {/* SECTION 2: PRIMARY COMMERCIAL PORTAL ACCESS (3-WAY DISPATCH) */}
        <section
          id="portals"
          aria-label="BookPro Entry Options"
          style={{
            scrollMarginTop: "90px",
            marginBottom: "88px",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.1em",
                color: "#818cf8",
                textTransform: "uppercase",
                fontFamily: "var(--portal-font-mono, monospace)",
              }}
            >
              ACCESS & REGISTRATION DISPATCH
            </span>
            <h2
              style={{
                fontSize: "28px",
                fontWeight: 800,
                color: "#f8fafc",
                margin: "6px 0 0",
                letterSpacing: "-0.02em",
              }}
            >
              Choose your entry path
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "14px", marginTop: "6px" }}>
              Dedicated registration paths for business operators and clients, with unified single sign-on.
            </p>
          </div>

          <AnimatedGroup
            stagger={0.08}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
              gap: "24px",
            }}
          >
            {/* CARD 1: CREATE BUSINESS WORKSPACE */}
            <Link href="/register" style={{ textDecoration: "none" }}>
              <SpotlightCard
                spotlightColor="rgba(56, 189, 248, 0.16)"
                style={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  padding: "32px",
                  borderRadius: "18px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  background: "rgba(15, 23, 42, 0.75)",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "20px",
                    }}
                  >
                    <div
                      style={{
                        width: "60px",
                        height: "60px",
                        borderRadius: "16px",
                        background:
                          "linear-gradient(135deg, rgba(2, 132, 199, 0.2), rgba(99, 102, 241, 0.15))",
                        border: "1px solid rgba(56, 189, 248, 0.4)",
                        display: "grid",
                        placeItems: "center",
                        boxShadow: "0 8px 24px rgba(2, 132, 199, 0.3)",
                      }}
                    >
                      <StackedCards size={38} />
                    </div>
                    <GlassBadge variant="info">Organization</GlassBadge>
                  </div>

                  <h3
                    style={{
                      fontSize: "22px",
                      fontWeight: 800,
                      color: "#f8fafc",
                      marginBottom: "10px",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    1. Business Workspace
                  </h3>

                  <p
                    style={{
                      color: "#94a3b8",
                      fontSize: "14px",
                      lineHeight: 1.6,
                      marginBottom: "20px",
                    }}
                  >
                    For studio owners, clinics, salons & enterprises configuring their public booking engine:
                  </p>

                  <ul
                    style={{
                      listStyle: "none",
                      padding: 0,
                      margin: "0 0 24px 0",
                      display: "grid",
                      gap: "9px",
                    }}
                  >
                    {[
                      "Custom booking URL, branding & primary timezone",
                      "Multi-location branches with operating hours",
                      "Staff rosters, buffer padding & shift management",
                      "Physical resource constraints (rooms, chairs, bays)",
                      "Stripe Connect direct payments & ECB live Forex",
                    ].map((item, idx) => (
                      <li
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          color: "#cbd5e1",
                          fontSize: "13px",
                        }}
                      >
                        <CheckCircle2
                          size={15}
                          color="#38bdf8"
                          style={{ flexShrink: 0, marginTop: "2px" }}
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: "18px",
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "14.5px" }}>
                    Start Onboarding Wizard →
                  </span>
                  <span
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      backgroundColor: "rgba(2, 132, 199, 0.2)",
                      border: "1px solid rgba(56, 189, 248, 0.4)",
                      display: "grid",
                      placeItems: "center",
                      color: "#38bdf8",
                    }}
                  >
                    <ArrowRight size={16} />
                  </span>
                </div>
              </SpotlightCard>
            </Link>

            {/* CARD 2: REGISTER CUSTOMER ACCOUNT */}
            <Link href="/register/customer" style={{ textDecoration: "none" }}>
              <SpotlightCard
                spotlightColor="rgba(192, 132, 252, 0.16)"
                style={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  padding: "32px",
                  borderRadius: "18px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  background: "rgba(15, 23, 42, 0.75)",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "20px",
                    }}
                  >
                    <div
                      style={{
                        width: "60px",
                        height: "60px",
                        borderRadius: "16px",
                        background:
                          "linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(236, 72, 153, 0.15))",
                        border: "1px solid rgba(192, 132, 252, 0.4)",
                        display: "grid",
                        placeItems: "center",
                        boxShadow: "0 8px 24px rgba(168, 85, 247, 0.3)",
                      }}
                    >
                      <User size={34} color="#c084fc" />
                    </div>
                    <GlassBadge variant="purple">Customer Account</GlassBadge>
                  </div>

                  <h3
                    style={{
                      fontSize: "22px",
                      fontWeight: 800,
                      color: "#f8fafc",
                      marginBottom: "10px",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    2. Customer Account
                  </h3>

                  <p
                    style={{
                      color: "#94a3b8",
                      fontSize: "14px",
                      lineHeight: 1.6,
                      marginBottom: "20px",
                    }}
                  >
                    For clients booking appointments, managing schedules, and securing priority waitlists:
                  </p>

                  <ul
                    style={{
                      listStyle: "none",
                      padding: 0,
                      margin: "0 0 24px 0",
                      display: "grid",
                      gap: "9px",
                    }}
                  >
                    {[
                      "Single universal customer profile across all businesses",
                      "1-Click Automated Rescheduling across qualified staff",
                      "Priority Reschedule Waitlist triage for busy days",
                      "Verified appointments, SMS/email codes & check-in QR",
                      "24/7 autonomous scheduling via AI Receptionist",
                    ].map((item, idx) => (
                      <li
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          color: "#cbd5e1",
                          fontSize: "13px",
                        }}
                      >
                        <CheckCircle2
                          size={15}
                          color="#c084fc"
                          style={{ flexShrink: 0, marginTop: "2px" }}
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: "18px",
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <span style={{ color: "#c084fc", fontWeight: 700, fontSize: "14.5px" }}>
                    Create Customer Account →
                  </span>
                  <span
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      backgroundColor: "rgba(168, 85, 247, 0.2)",
                      border: "1px solid rgba(192, 132, 252, 0.4)",
                      display: "grid",
                      placeItems: "center",
                      color: "#c084fc",
                    }}
                  >
                    <ArrowRight size={16} />
                  </span>
                </div>
              </SpotlightCard>
            </Link>

            {/* CARD 3: SIGN IN TO PORTAL */}
            <Link href="/login" style={{ textDecoration: "none" }}>
              <SpotlightCard
                spotlightColor="rgba(52, 211, 153, 0.16)"
                style={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  padding: "32px",
                  borderRadius: "18px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  background: "rgba(15, 23, 42, 0.75)",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "20px",
                    }}
                  >
                    <div
                      style={{
                        width: "60px",
                        height: "60px",
                        borderRadius: "16px",
                        background:
                          "linear-gradient(135deg, rgba(52, 211, 153, 0.2), rgba(16, 185, 129, 0.15))",
                        border: "1px solid rgba(52, 211, 153, 0.4)",
                        display: "grid",
                        placeItems: "center",
                        boxShadow: "0 8px 24px rgba(52, 211, 153, 0.25)",
                      }}
                    >
                      <ShieldLock size={38} />
                    </div>
                    <GlassBadge variant="default">Unified SSO</GlassBadge>
                  </div>

                  <h3
                    style={{
                      fontSize: "22px",
                      fontWeight: 800,
                      color: "#f8fafc",
                      marginBottom: "10px",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    3. Sign In to Portal
                  </h3>

                  <p
                    style={{
                      color: "#94a3b8",
                      fontSize: "14px",
                      lineHeight: 1.6,
                      marginBottom: "20px",
                    }}
                  >
                    Role-detected single sign-on with tenant isolation and post-authentication dispatch:
                  </p>

                  <ul
                    style={{
                      listStyle: "none",
                      padding: 0,
                      margin: "0 0 24px 0",
                      display: "grid",
                      gap: "9px",
                    }}
                  >
                    {[
                      "Owners & Admins: Executive command center & live metrics",
                      "Branch Managers: Location calendar & room allocation",
                      "Staff Specialists: Shift view, agenda & attendance",
                      "Customers: Active bookings, waitlist & reschedule",
                      "Multi-organization switcher for cross-tenant accounts",
                    ].map((item, idx) => (
                      <li
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          color: "#cbd5e1",
                          fontSize: "13px",
                        }}
                      >
                        <CheckCircle2
                          size={15}
                          color="#34d399"
                          style={{ flexShrink: 0, marginTop: "2px" }}
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: "18px",
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <span style={{ color: "#34d399", fontWeight: 700, fontSize: "14.5px" }}>
                    Access Workspace →
                  </span>
                  <span
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      backgroundColor: "rgba(52, 211, 153, 0.2)",
                      border: "1px solid rgba(52, 211, 153, 0.4)",
                      display: "grid",
                      placeItems: "center",
                      color: "#34d399",
                    }}
                  >
                    <ArrowRight size={16} />
                  </span>
                </div>
              </SpotlightCard>
            </Link>
          </AnimatedGroup>
        </section>

        {/* SECTION 3: 6-PILLAR ENTERPRISE HIGHLIGHTS */}
        <section aria-label="BookPro Technical Highlights" style={{ marginBottom: "88px" }}>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.1em",
                color: "#34d399",
                textTransform: "uppercase",
                fontFamily: "var(--portal-font-mono, monospace)",
              }}
            >
              ENGINEERED FOR RIGOR
            </span>
            <h2
              style={{
                fontSize: "28px",
                fontWeight: 800,
                color: "#f8fafc",
                letterSpacing: "-0.02em",
                margin: "6px 0 0",
              }}
            >
              Enterprise-grade scheduling fundamentals
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "14px", marginTop: "8px" }}>
              Every slot, hold, payment stream, and AI action is computed server-side with zero guesswork.
            </p>
          </div>

          <AnimatedGroup
            stagger={0.05}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "20px",
            }}
          >
            <SpotlightCard
              spotlightColor="rgba(56, 189, 248, 0.12)"
              style={{
                padding: "24px",
                borderRadius: "16px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(15, 23, 42, 0.65)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" }}>
                <ClockSpinner size={32} />
                <h4 style={{ fontSize: "17px", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
                  Authoritative Availability
                </h4>
              </div>
              <p style={{ color: "#94a3b8", fontSize: "13.5px", lineHeight: 1.6, margin: 0 }}>
                Never depends on client-side clocks. Dynamically computes staff shifts, leaves, buffer padding, and physical capacity in strict UTC.
              </p>
            </SpotlightCard>

            <SpotlightCard
              spotlightColor="rgba(52, 211, 153, 0.12)"
              style={{
                padding: "24px",
                borderRadius: "16px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(15, 23, 42, 0.65)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" }}>
                <CalendarPulse size={32} />
                <h4 style={{ fontSize: "17px", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
                  Atomic Hold Engine
                </h4>
              </div>
              <p style={{ color: "#94a3b8", fontSize: "13.5px", lineHeight: 1.6, margin: 0 }}>
                Prevents concurrent collisions by establishing authoritative hold buckets that lock capacity during customer checkout.
              </p>
            </SpotlightCard>

            <SpotlightCard
              spotlightColor="rgba(192, 132, 252, 0.12)"
              style={{
                padding: "24px",
                borderRadius: "16px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(15, 23, 42, 0.65)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" }}>
                <WaveformBars size={32} />
                <h4 style={{ fontSize: "17px", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
                  Tool-Bounded Gemini AI
                </h4>
              </div>
              <p style={{ color: "#94a3b8", fontSize: "13.5px", lineHeight: 1.6, margin: 0 }}>
                Conversational intelligence grounded in strict tool contracts. Bidirectional isolation ensures zero cross-role privilege escalation.
              </p>
            </SpotlightCard>

            <SpotlightCard
              spotlightColor="rgba(245, 158, 11, 0.12)"
              style={{
                padding: "24px",
                borderRadius: "16px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(15, 23, 42, 0.65)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" }}>
                <Globe size={26} color="#fbbf24" />
                <h4 style={{ fontSize: "17px", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
                  Live Forex Multi-Currency
                </h4>
              </div>
              <p style={{ color: "#94a3b8", fontSize: "13.5px", lineHeight: 1.6, margin: 0 }}>
                Converts booking values and financial analytics into the organization's chosen currency at live ECB rates across 9 currency pairs.
              </p>
            </SpotlightCard>

            <SpotlightCard
              spotlightColor="rgba(56, 189, 248, 0.12)"
              style={{
                padding: "24px",
                borderRadius: "16px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(15, 23, 42, 0.65)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" }}>
                <Building2 size={26} color="#38bdf8" />
                <h4 style={{ fontSize: "17px", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
                  Physical Resource Locking
                </h4>
              </div>
              <p style={{ color: "#94a3b8", fontSize: "13.5px", lineHeight: 1.6, margin: 0 }}>
                Guarantees rooms, chairs, and treatment apparatus are never double-booked alongside specialist staff schedules.
              </p>
            </SpotlightCard>

            <SpotlightCard
              spotlightColor="rgba(251, 113, 133, 0.12)"
              style={{
                padding: "24px",
                borderRadius: "16px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(15, 23, 42, 0.65)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" }}>
                <RefreshCw size={26} color="#fb7185" />
                <h4 style={{ fontSize: "17px", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
                  Autonomous Waitlist Backfill
                </h4>
              </div>
              <p style={{ color: "#94a3b8", fontSize: "13.5px", lineHeight: 1.6, margin: 0 }}>
                Automatically detects cancelled or rescheduled openings and assigns them to priority waitlist clients in real time.
              </p>
            </SpotlightCard>
          </AnimatedGroup>
        </section>

        {/* SECTION 4: ARCHITECTURAL FAQ ACCORDION (CollapsibleDisclosure) */}
        <section aria-label="Frequently Asked Questions" style={{ marginBottom: "80px", maxWidth: "860px", margin: "0 auto 88px" }}>
          <div style={{ textAlign: "center", marginBottom: "36px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.1em",
                color: "#38bdf8",
                textTransform: "uppercase",
                fontFamily: "var(--portal-font-mono, monospace)",
              }}
            >
              SYSTEM ARCHITECTURE FAQ
            </span>
            <h2
              style={{
                fontSize: "26px",
                fontWeight: 800,
                color: "#f8fafc",
                letterSpacing: "-0.02em",
                margin: "6px 0 0",
              }}
            >
              Answers for engineering & operations leaders
            </h2>
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  style={{
                    borderRadius: "14px",
                    border: isOpen
                      ? "1px solid rgba(56, 189, 248, 0.35)"
                      : "1px solid rgba(255, 255, 255, 0.08)",
                    backgroundColor: isOpen
                      ? "rgba(15, 23, 42, 0.85)"
                      : "rgba(15, 23, 42, 0.45)",
                    overflow: "hidden",
                    transition: "all 200ms ease",
                  }}
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    style={{
                      width: "100%",
                      padding: "18px 20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "14px",
                      background: "none",
                      border: "none",
                      color: isOpen ? "#f8fafc" : "#cbd5e1",
                      fontSize: "15px",
                      fontWeight: 700,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <span>{item.q}</span>
                    <motion.span
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ color: isOpen ? "#38bdf8" : "#64748b", flexShrink: 0 }}
                    >
                      <ChevronDown size={18} />
                    </motion.span>
                  </button>

                  <CollapsibleDisclosure isOpen={isOpen}>
                    <div
                      style={{
                        padding: "0 20px 20px",
                        color: "#94a3b8",
                        fontSize: "14px",
                        lineHeight: 1.65,
                      }}
                    >
                      {item.a}
                    </div>
                  </CollapsibleDisclosure>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Commercial Enterprise Footer */}
      <footer
        style={{
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          backgroundColor: "rgba(10, 15, 26, 0.95)",
          padding: "40px 32px",
          color: "#64748b",
          fontSize: "13px",
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                display: "grid",
                width: "24px",
                height: "24px",
                placeItems: "center",
                borderRadius: "6px",
                background: "linear-gradient(135deg, #0284c7, #7c3aed)",
                color: "#fff",
                fontSize: "12px",
                fontWeight: 900,
              }}
            >
              B
            </span>
            <span style={{ color: "#94a3b8", fontWeight: 600 }}>
              © {new Date().getFullYear()} BookPro Inc. Deterministic Enterprise Scheduling.
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap" }}>
            <a href="#architecture" style={{ color: "#94a3b8", textDecoration: "none", fontWeight: 500 }}>
              Architecture
            </a>
            <a href="#capabilities" style={{ color: "#94a3b8", textDecoration: "none", fontWeight: 500 }}>
              Capabilities
            </a>
            <Link href="/organizations" style={{ color: "#94a3b8", textDecoration: "none", fontWeight: 500 }}>
              Directory
            </Link>
            <Link href="/register/customer" style={{ color: "#c084fc", textDecoration: "none", fontWeight: 600 }}>
              Customer Registration
            </Link>
            <Link href="/register" style={{ color: "#38bdf8", textDecoration: "none", fontWeight: 700 }}>
              Create Organization
            </Link>
            <Link href="/login" style={{ color: "#94a3b8", textDecoration: "none", fontWeight: 500 }}>
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
