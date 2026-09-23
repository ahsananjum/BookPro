"use client";

import React from "react";
import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";

export default function TermsOfServicePage() {
  const lastUpdated = "September 24, 2026";

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#070b12",
        color: "#e5edf7",
        padding: "0 0 80px 0",
      }}
    >
      {/* Top Header */}
      <header
        style={{
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          backgroundColor: "rgba(11, 17, 27, 0.9)",
          backdropFilter: "blur(16px)",
          position: "sticky",
          top: 0,
          zIndex: 30,
          padding: "16px 24px",
        }}
      >
        <div
          style={{
            maxWidth: "960px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              color: "#94a3b8",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
              transition: "color 0.15s ease",
            }}
          >
            <ChevronLeft size={16} />
            <span>Return to BookPro</span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: "#38bdf8",
                boxShadow: "0 0 10px #38bdf8",
              }}
            />
            <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>Master Subscription Agreement</span>
          </div>
        </div>
      </header>

      {/* Main Document Body */}
      <main
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          padding: "48px 24px 0",
        }}
      >
        <div style={{ marginBottom: "40px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              borderRadius: "999px",
              backgroundColor: "rgba(56, 189, 248, 0.1)",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              color: "#38bdf8",
              fontSize: "12px",
              fontWeight: 700,
              marginBottom: "16px",
            }}
          >
            <ShieldCheck size={14} />
            <span>TERMS OF SERVICE & USAGE POLICY</span>
          </div>
          <h1
            style={{
              fontSize: "clamp(2rem, 5vw, 3.2rem)",
              fontWeight: 850,
              letterSpacing: "-0.035em",
              color: "#ffffff",
              lineHeight: 1.1,
              marginBottom: "12px",
            }}
          >
            Terms of Service
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>
            Last updated: {lastUpdated} · Governs all usage of BookPro software, APIs, customer booking portals, and associated services.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gap: "32px",
            fontSize: "15px",
            lineHeight: 1.7,
            color: "#cbd5e1",
          }}
        >
          {/* Section 1 */}
          <section
            style={{
              padding: "28px",
              borderRadius: "14px",
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <h2 style={{ fontSize: "1.25rem", color: "#f8fafc", fontWeight: 750, marginBottom: "12px" }}>
              1. Acceptance of Terms & Services
            </h2>
            <p>
              By accessing, browsing, or utilizing the BookPro platform (including our web application, customer booking interfaces, and developer APIs), you enter into a binding agreement with BookPro Inc. (&quot;BookPro&quot;, &quot;we&quot;, &quot;us&quot;). If you are registering an organization on behalf of an entity, you certify that you possess the authoritative legal power to bind that organization to these terms.
            </p>
          </section>

          {/* Section 2 */}
          <section
            style={{
              padding: "28px",
              borderRadius: "14px",
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <h2 style={{ fontSize: "1.25rem", color: "#f8fafc", fontWeight: 750, marginBottom: "12px" }}>
              2. Multi-Tenant Workspaces & Account Security
            </h2>
            <p style={{ marginBottom: "12px" }}>
              Each registered organization operates an isolated tenant workspace. Organizations are responsible for:
            </p>
            <ul style={{ paddingLeft: "20px", display: "grid", gap: "8px" }}>
              <li>Maintaining the confidentiality of administrative credentials and session tokens.</li>
              <li>Assigning appropriate Role-Based Access Control (RBAC) levels (e.g. Owner, Admin, Manager, Staff, Customer).</li>
              <li>Ensuring all staff roster data and operational schedules entered into the platform are accurate and compliant with local labor regulations.</li>
              <li>Promptly notifying BookPro upon discovering any unauthorized account breach or credential compromise.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section
            style={{
              padding: "28px",
              borderRadius: "14px",
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <h2 style={{ fontSize: "1.25rem", color: "#f8fafc", fontWeight: 750, marginBottom: "12px" }}>
              3. Deterministic Booking Engine & Atomic Hold Reservations
            </h2>
            <p style={{ marginBottom: "12px" }}>
              The BookPro scheduling engine operates on an atomic reservation model designed to eliminate double-booking:
            </p>
            <ul style={{ paddingLeft: "20px", display: "grid", gap: "8px" }}>
              <li>
                <strong>Hold Token Expiry:</strong> When a customer selects an available slot, BookPro locks all requisite resources (staff provider, physical apparatus, and appointment room) with a strict 10-minute hold lock. If payment or confirmation is not finalized within this window, the hold expires and resources are released back to the global pool.
              </li>
              <li>
                <strong>Automated Waitlist Cascading:</strong> In the event of an appointment cancellation, BookPro automatically offers the released window to the next qualified client in the waitlist queue with an authoritative response deadline.
              </li>
              <li>
                <strong>Rescheduling & Cancellation Policies:</strong> Each organization establishes individual cancellation notice windows. Cancellations initiated outside permitted windows may incur forfeiture of deposits as defined in the organization&apos;s custom service policy.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section
            style={{
              padding: "28px",
              borderRadius: "14px",
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <h2 style={{ fontSize: "1.25rem", color: "#f8fafc", fontWeight: 750, marginBottom: "12px" }}>
              4. Payment Processing, Currencies & Stripe Connect
            </h2>
            <p style={{ marginBottom: "12px" }}>
              BookPro integrates directly with Stripe Connect to enable automated payment capture, deposits, and multi-currency conversions:
            </p>
            <ul style={{ paddingLeft: "20px", display: "grid", gap: "8px" }}>
              <li>Organizations designate their reporting currency and connect an authorized Stripe merchant account.</li>
              <li>Foreign exchange rates are calculated dynamically from verified feeds for customer convenience.</li>
              <li>BookPro does not hold merchant funds; all payouts and dispute resolutions are governed by Stripe Connected Account agreements.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section
            style={{
              padding: "28px",
              borderRadius: "14px",
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <h2 style={{ fontSize: "1.25rem", color: "#f8fafc", fontWeight: 750, marginBottom: "12px" }}>
              5. AI Receptionist & Tool Sandboxing
            </h2>
            <p>
              BookPro offers an integrated Gemini AI Receptionist feature. The AI operates strictly under tool-bounded Zod contracts and lacks authority to bypass business rules, override pricing, or alter appointments without database validation. BookPro makes no warranty regarding unstructured natural language responses and organizations retain final supervisory responsibility over their automated customer interactions.
            </p>
          </section>

          {/* Section 6 */}
          <section
            style={{
              padding: "28px",
              borderRadius: "14px",
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <h2 style={{ fontSize: "1.25rem", color: "#f8fafc", fontWeight: 750, marginBottom: "12px" }}>
              6. Service Level Commitment & Limitation of Liability
            </h2>
            <p style={{ marginBottom: "12px" }}>
              BookPro targets a 99.9% uptime service level agreement for our core scheduling API and booking lambdas. Except where prohibited by law, BookPro shall not be held liable for indirect, incidental, or consequential damages resulting from internet outages, third-party payment gateway disruptions, or customer no-shows.
            </p>
          </section>

          {/* Section 7 */}
          <section
            style={{
              padding: "28px",
              borderRadius: "14px",
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <h2 style={{ fontSize: "1.25rem", color: "#f8fafc", fontWeight: 750, marginBottom: "12px" }}>
              7. Legal Inquiries & Governance
            </h2>
            <p style={{ marginBottom: "12px" }}>
              For legal inquiries, terms clarification, or enterprise SLA agreements, please contact:
            </p>
            <div
              style={{
                display: "inline-block",
                padding: "12px 18px",
                borderRadius: "8px",
                backgroundColor: "rgba(2, 132, 199, 0.12)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                color: "#7dd3fc",
                fontWeight: 600,
                fontSize: "14px",
              }}
            >
              Legal Inquiries: <a href="mailto:legal@bookpro.app" style={{ color: "#38bdf8", textDecoration: "underline" }}>legal@bookpro.app</a>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
