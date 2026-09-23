"use client";

import React from "react";
import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";

export default function PrivacyPolicyPage() {
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
                backgroundColor: "#34d399",
                boxShadow: "0 0 10px #34d399",
              }}
            />
            <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>GDPR & CCPA Compliant</span>
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
            <span>LEGAL & DATA GOVERNANCE DISCLOSURE</span>
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
            Privacy Policy
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>
            Last updated: {lastUpdated} · Effective immediately for all BookPro organizations, providers, and clients.
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
              1. Information We Collect
            </h2>
            <p style={{ marginBottom: "12px" }}>
              BookPro operates an enterprise scheduling and appointment management infrastructure. In providing our service to multi-tenant business organizations and their end customers, we process the following categories of information:
            </p>
            <ul style={{ paddingLeft: "20px", display: "grid", gap: "8px" }}>
              <li>
                <strong>Organization & Staff Data:</strong> Business entity name, tenant slug, authorized staff names, email addresses, phone contacts, service specialties, work schedules, and physical room resource allocations.
              </li>
              <li>
                <strong>Customer Booking Data:</strong> Customer name, email address, phone number, booked service IDs, requested appointment windows, timezone, and custom intake form responses.
              </li>
              <li>
                <strong>Payment & Transactional Metadata:</strong> Authoritative transaction identifiers, currency codes, hold token references, and settlement timestamps. Sensitive credit card credentials are processed directly by Stripe Connect and are never stored on BookPro servers.
              </li>
              <li>
                <strong>Calendar Integration Tokens:</strong> Encrypted Google OAuth refresh and access tokens utilized exclusively to synchronize booked appointments with external calendar schedules.
              </li>
            </ul>
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
              2. How We Utilize Your Data
            </h2>
            <p style={{ marginBottom: "12px" }}>
              Data collected by the BookPro platform is utilized strictly for the following operational objectives:
            </p>
            <ul style={{ paddingLeft: "20px", display: "grid", gap: "8px" }}>
              <li>Executing deterministic, conflict-free appointment booking with atomic resource hold locks.</li>
              <li>Delivering transactional Brevo notification emails (confirmations, reschedules, cancellations, verification PINs, and waitlist slot alerts).</li>
              <li>Synchronizing staff schedules bi-directionally with linked Google Calendar endpoints.</li>
              <li>Processing customer payments and merchant deposits via authorized Stripe Connect accounts.</li>
              <li>Powering our sandboxed Gemini AI Receptionist strictly under Zod tool contracts without open-ended training on personal data.</li>
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
              3. Data Storage & Security Standards
            </h2>
            <p style={{ marginBottom: "12px" }}>
              All database records reside in isolated PostgreSQL instances hosted via Supabase in the AWS <code>ap-south-1</code> region. We implement multi-layered safeguards including:
            </p>
            <ul style={{ paddingLeft: "20px", display: "grid", gap: "8px" }}>
              <li>Full encryption at rest using AES-256 and encryption in transit via TLS 1.3.</li>
              <li>Strict tenant isolation enforced through foreign-key tenant scoping on every data query.</li>
              <li>Stateless JWT authentication with HTTP-only, secure, SameSite cookies.</li>
              <li>Automated outbox transactional sweeps with strict idempotency key tracking to eliminate duplicated data dispatch.</li>
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
              4. Third-Party Service Providers
            </h2>
            <p style={{ marginBottom: "12px" }}>
              We partner with industry-leading sub-processors under rigorous data protection agreements:
            </p>
            <ul style={{ paddingLeft: "20px", display: "grid", gap: "8px" }}>
              <li><strong>Vercel:</strong> Global serverless application hosting and CDN edge routing.</li>
              <li><strong>Stripe:</strong> PCI-DSS Level 1 certified payment processing and Connect seller payouts.</li>
              <li><strong>Brevo (Sendinblue):</strong> Transactional email delivery infrastructure.</li>
              <li><strong>Google Cloud:</strong> OAuth identity provider and Google Calendar API integration.</li>
              <li><strong>Supabase / AWS:</strong> Authoritative PostgreSQL relational database storage.</li>
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
              5. Your Rights (GDPR & CCPA)
            </h2>
            <p style={{ marginBottom: "12px" }}>
              Regardless of your geographic location, BookPro extends full data autonomy to all users:
            </p>
            <ul style={{ paddingLeft: "20px", display: "grid", gap: "8px" }}>
              <li><strong>Right of Access:</strong> Request a comprehensive export of all personal data linked to your account.</li>
              <li><strong>Right to Rectification:</strong> Update or correct your profile, appointments, and contact preferences anytime via the Customer Portal.</li>
              <li><strong>Right to Erasure (&quot;Right to be Forgotten&quot;):</strong> Request permanent deletion of your customer records and booking history, subject to legal accounting retention requirements.</li>
              <li><strong>Consent Withdrawal:</strong> Revoke Google Calendar integration or email marketing permissions at any time from your settings panel.</li>
            </ul>
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
              6. Contact & Data Protection Officer
            </h2>
            <p style={{ marginBottom: "12px" }}>
              For privacy inquiries, data subject access requests, or compliance auditing, please contact our dedicated Data Protection team:
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
              Email: <a href="mailto:privacy@bookpro.app" style={{ color: "#38bdf8", textDecoration: "underline" }}>privacy@bookpro.app</a>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
