/* Hallmark · macrostructure: Business Settings & Policies Hub · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 */
"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Building,
  Globe,
  Palette,
  ShieldCheck,
  Clock,
  AlertCircle,
  CheckCircle2,
  Upload,
  Lock,
  Layers,
} from "../../../components/icons";
import { PageHeader } from "../../../components/shell/app-shell";
import { GlassCard, GlassBadge } from "../../../components/glass-card";
import { apiFetch } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { useReferenceData } from "../../onboarding/_hooks/use-reference-data";

interface OrganizationProfile {
  id: string;
  name: string;
  slug: string;
  brandName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  industry?: string | null;
  country: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  timezone: string;
  currency: string;
  bookingEnabled: boolean;
  paymentIntent?: string | null;
}

interface PolicySettings {
  minNoticeHours: number;
  maxNoticeDays: number;
  cancelCutoffHours: number;
  cancelFeeType: "NONE" | "PERCENTAGE" | "FIXED_AMOUNT";
  cancelFeeValue: number;
  rescheduleCutoffHours: number;
  holdDurationMinutes: number;
}

type TabType = "general" | "regional" | "branding" | "policy" | "audit";

interface AuditLog {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  payload?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export default function BusinessSettingsPage() {
  const { user, refetchUser } = useAuth();
  const { timezones, currencies, countries, industries, loading: loadingRef } = useReferenceData();

  const [activeTab, setActiveTab] = useState<TabType>("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Profile Form State
  const [profile, setProfile] = useState<OrganizationProfile>({
    id: "",
    name: "",
    slug: "",
    brandName: "",
    logoUrl: "",
    primaryColor: "#0284c7",
    industry: "",
    country: "US",
    phone: "",
    email: "",
    website: "",
    timezone: "UTC",
    currency: "USD",
    bookingEnabled: true,
  });

  // Policy Form State
  const [policy, setPolicy] = useState<PolicySettings>({
    minNoticeHours: 24,
    maxNoticeDays: 60,
    cancelCutoffHours: 24,
    cancelFeeType: "NONE",
    cancelFeeValue: 0,
    rescheduleCutoffHours: 12,
    holdDurationMinutes: 10,
  });

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActorFilter, setAuditActorFilter] = useState("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Fetch Authoritative Database Entities
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgRes, policyRes] = await Promise.all([
        apiFetch<OrganizationProfile>("/organization/current"),
        apiFetch<PolicySettings[]>("/policies"),
      ]);

      if (orgRes.success && orgRes.data) {
        setProfile({
          id: orgRes.data.id,
          name: orgRes.data.name || "",
          slug: orgRes.data.slug || "",
          brandName: orgRes.data.brandName || orgRes.data.name || "",
          logoUrl: orgRes.data.logoUrl || "",
          primaryColor: orgRes.data.primaryColor || "#0284c7",
          industry: orgRes.data.industry || "",
          country: orgRes.data.country || "US",
          phone: orgRes.data.phone || "",
          email: orgRes.data.email || "",
          website: orgRes.data.website || "",
          timezone: orgRes.data.timezone || "UTC",
          currency: orgRes.data.currency || "USD",
          bookingEnabled: orgRes.data.bookingEnabled !== false,
          paymentIntent: orgRes.data.paymentIntent,
        });
      }

      if (policyRes.success && policyRes.data && policyRes.data.length > 0) {
        const pol = policyRes.data[0];
        setPolicy({
          minNoticeHours: pol.minNoticeHours ?? 24,
          maxNoticeDays: pol.maxNoticeDays ?? 60,
          cancelCutoffHours: pol.cancelCutoffHours ?? 24,
          cancelFeeType: (pol.cancelFeeType as any) || "NONE",
          cancelFeeValue: pol.cancelFeeValue ?? 0,
          rescheduleCutoffHours: pol.rescheduleCutoffHours ?? 12,
          holdDurationMinutes: pol.holdDurationMinutes ?? 10,
        });
      }
    } catch (err: any) {
      setError(err.message || "Failed to load organization settings.");
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    if (!user?.organizationId) return;
    setLoadingAudit(true);
    try {
      const query = new URLSearchParams({ limit: "100" });
      if (auditActorFilter) query.set("actorType", auditActorFilter);

      const res = await apiFetch<{ logs: AuditLog[]; total: number }>(
        `/organizations/${user.organizationId}/audit-logs?${query.toString()}`
      );
      if (res.success && res.data) {
        setAuditLogs(res.data.logs || []);
        setAuditTotal(res.data.total || 0);
      }
    } catch {
      // Non-critical audit fetch
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === "audit") {
      loadAuditLogs();
    }
  }, [activeTab, auditActorFilter, user?.organizationId]);

  const handleProfileChange = (field: keyof OrganizationProfile, value: any) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handlePolicyChange = (field: keyof PolicySettings, value: any) => {
    setPolicy((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const orgPayload = {
        name: profile.name.trim(),
        brandName: profile.brandName?.trim() || profile.name.trim(),
        logoUrl: profile.logoUrl?.trim() || undefined,
        primaryColor: profile.primaryColor || "#0284c7",
        industry: profile.industry || undefined,
        country: profile.country,
        phone: profile.phone?.trim() || undefined,
        email: profile.email?.trim() || undefined,
        website: profile.website?.trim() || undefined,
        timezone: profile.timezone,
        currency: profile.currency,
        bookingEnabled: profile.bookingEnabled,
      };

      const policyPayload = {
        minNoticeHours: Number(policy.minNoticeHours),
        maxNoticeDays: Number(policy.maxNoticeDays),
        cancelCutoffHours: Number(policy.cancelCutoffHours),
        cancelFeeType: policy.cancelFeeType,
        cancelFeeValue: policy.cancelFeeType !== "NONE" ? Number(policy.cancelFeeValue) : 0,
        rescheduleCutoffHours: Number(policy.rescheduleCutoffHours),
        holdDurationMinutes: Number(policy.holdDurationMinutes),
      };

      const [orgSave, polSave] = await Promise.all([
        apiFetch("/organization/current", { method: "PUT", body: JSON.stringify(orgPayload) }),
        apiFetch("/policies", { method: "PUT", body: JSON.stringify(policyPayload) }),
      ]);

      if (!orgSave.success) {
        throw new Error(orgSave.error?.message || "Failed to update business profile.");
      }
      if (!polSave.success) {
        throw new Error(polSave.error?.message || "Failed to update booking policies.");
      }

      setSuccessMessage("Settings and policies updated successfully.");
      setTimeout(() => setSuccessMessage(null), 4000);
      if (refetchUser) refetchUser();
      await loadData();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred while saving.");
    } finally {
      setSaving(false);
    }
  };

  const filteredAuditLogs = useMemo(() => {
    const term = auditSearch.trim().toLowerCase();
    if (!term) return auditLogs;
    return auditLogs.filter((log) =>
      [log.action, log.actorType, log.resourceType, log.resourceId].some((v) =>
        v.toLowerCase().includes(term)
      )
    );
  }, [auditLogs, auditSearch]);

  const tabs: Array<{ id: TabType; label: string; icon: any }> = [
    { id: "general", label: "Business Profile", icon: Building },
    { id: "regional", label: "Regional & Currency", icon: Globe },
    { id: "branding", label: "Branding & Theme", icon: Palette },
    { id: "policy", label: "Booking & Cancellation", icon: Layers },
    { id: "audit", label: "Audit & Security", icon: ShieldCheck },
  ];

  return (
    <div>
      <PageHeader
        title="Business Settings & Policies"
        description="Authoritative controls for organization profile, localized currencies, custom branding, and online booking cancellation rules."
      />

      {/* Notifications */}
      {error && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "rgba(225, 29, 72, 0.15)",
            border: "1px solid rgba(225, 29, 72, 0.4)",
            borderRadius: "10px",
            color: "#fb7185",
            marginBottom: "20px",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
          role="alert"
        >
          <AlertCircle size={18} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: "transparent", border: "none", color: "#fb7185", cursor: "pointer", fontSize: "16px" }}
          >
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "rgba(16, 185, 129, 0.15)",
            border: "1px solid rgba(16, 185, 129, 0.4)",
            borderRadius: "10px",
            color: "#34d399",
            marginBottom: "20px",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          overflowX: "auto",
          paddingBottom: "12px",
          marginBottom: "24px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                borderRadius: "8px",
                border: active ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.08)",
                backgroundColor: active ? "rgba(2, 132, 199, 0.2)" : "rgba(15, 23, 42, 0.6)",
                color: active ? "#38bdf8" : "#94a3b8",
                fontWeight: 700,
                fontSize: "13.5px",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ color: "#94a3b8", padding: "48px 0", textAlign: "center" }}>
          Loading organization configuration…
        </div>
      ) : activeTab === "audit" ? (
        /* Audit Log Section */
        <div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "14px",
              marginBottom: "20px",
              padding: "12px 16px",
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              borderRadius: "12px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <input
              type="text"
              placeholder="Search audit records by action, actor, or resource ID…"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              style={{
                flex: "1 1 260px",
                padding: "9px 14px",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                color: "#fff",
                fontSize: "13px",
                outline: "none",
              }}
            />

            <select
              value={auditActorFilter}
              onChange={(e) => setAuditActorFilter(e.target.value)}
              style={{
                padding: "9px 14px",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                color: "#cbd5e1",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              <option value="">All Actors</option>
              <option value="STAFF">Staff</option>
              <option value="CUSTOMER">Customer</option>
              <option value="AI">AI System</option>
              <option value="PLATFORM_SUPPORT">Platform Support</option>
              <option value="SYSTEM">Automated System</option>
            </select>
          </div>

          {loadingAudit ? (
            <div style={{ color: "#94a3b8", padding: "32px 0", textAlign: "center" }}>Loading audit records…</div>
          ) : filteredAuditLogs.length === 0 ? (
            <GlassCard variant="panel" style={{ padding: "32px", textAlign: "center" }}>
              <p style={{ color: "#94a3b8", margin: 0 }}>No audit events found matching the current filter.</p>
            </GlassCard>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {filteredAuditLogs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                return (
                  <GlassCard
                    key={log.id}
                    variant="panel"
                    glow="none"
                    style={{ padding: "16px 20px", cursor: "pointer" }}
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                          <strong style={{ color: "#f8fafc", fontSize: "14px" }}>{log.action}</strong>
                          <GlassBadge variant="info" size="sm">
                            {log.actorType}
                          </GlassBadge>
                          <span style={{ color: "#94a3b8", fontSize: "12px" }}>· {log.resourceType}</span>
                        </div>
                        <span style={{ color: "#64748b", fontSize: "12px" }}>Resource ID: {log.resourceId}</span>
                      </div>
                      <time style={{ color: "#94a3b8", fontSize: "12px" }}>
                        {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(
                          new Date(log.createdAt)
                        )}
                      </time>
                    </div>

                    {isExpanded && log.payload && (
                      <div
                        style={{
                          marginTop: "12px",
                          padding: "12px",
                          backgroundColor: "rgba(0, 0, 0, 0.4)",
                          borderRadius: "8px",
                          fontSize: "12px",
                          color: "#38bdf8",
                          overflowX: "auto",
                        }}
                      >
                        <pre style={{ margin: 0, fontFamily: "monospace" }}>{JSON.stringify(log.payload, null, 2)}</pre>
                      </div>
                    )}
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Settings Forms */
        <form onSubmit={handleSaveAll}>
          {activeTab === "general" && (
            <GlassCard variant="panel" style={{ padding: "28px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#f8fafc", marginBottom: "6px" }}>
                Organization Identity
              </h3>
              <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "24px" }}>
                Authoritative legal and communication details for your business.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Legal Business Name <span style={{ color: "#38bdf8" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={profile.name}
                    onChange={(e) => handleProfileChange("name", e.target.value)}
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Industry Category
                  </label>
                  <select
                    value={profile.industry || ""}
                    onChange={(e) => handleProfileChange("industry", e.target.value)}
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "#0f172a", color: "#fff", fontSize: "13.5px" }}
                  >
                    <option value="">Select industry…</option>
                    {industries.map((ind) => (
                      <option key={ind.id || ind.slug} value={ind.slug || ind.id}>
                        {ind.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Support Email
                  </label>
                  <input
                    type="email"
                    value={profile.email || ""}
                    onChange={(e) => handleProfileChange("email", e.target.value)}
                    placeholder="support@yourbusiness.com"
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Business Phone
                  </label>
                  <input
                    type="tel"
                    value={profile.phone || ""}
                    onChange={(e) => handleProfileChange("phone", e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Official Website
                  </label>
                  <input
                    type="url"
                    value={profile.website || ""}
                    onChange={(e) => handleProfileChange("website", e.target.value)}
                    placeholder="https://yourbusiness.com"
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Primary Country
                  </label>
                  <select
                    value={profile.country}
                    onChange={(e) => handleProfileChange("country", e.target.value)}
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "#0f172a", color: "#fff", fontSize: "13.5px" }}
                  >
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ gridColumn: "span 2", marginTop: "12px", padding: "16px", backgroundColor: "rgba(15, 23, 42, 0.6)", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong style={{ color: "#f8fafc", fontSize: "14px", display: "block" }}>Public Customer Booking Page</strong>
                    <span style={{ color: "#94a3b8", fontSize: "12.5px" }}>Enable or disable public appointment booking for this organization.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={profile.bookingEnabled}
                    onChange={(e) => handleProfileChange("bookingEnabled", e.target.checked)}
                    style={{ width: "20px", height: "20px", cursor: "pointer" }}
                  />
                </div>
              </div>
            </GlassCard>
          )}

          {activeTab === "regional" && (
            <GlassCard variant="panel" style={{ padding: "28px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#f8fafc", marginBottom: "6px" }}>
                Regional & Currency Settings
              </h3>
              <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "24px" }}>
                Timezone is used for calendar slots, availability intervals, and automated reminders. Currency applies across your catalog and invoices.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Business Time Zone <span style={{ color: "#38bdf8" }}>*</span>
                  </label>
                  <select
                    value={profile.timezone}
                    onChange={(e) => handleProfileChange("timezone", e.target.value)}
                    style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "#0f172a", color: "#fff", fontSize: "13.5px" }}
                  >
                    {timezones.map((tz) => (
                      <option key={tz.name} value={tz.name}>
                        {tz.label || tz.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Operating Currency <span style={{ color: "#38bdf8" }}>*</span>
                  </label>
                  <select
                    value={profile.currency}
                    onChange={(e) => handleProfileChange("currency", e.target.value)}
                    style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "#0f172a", color: "#fff", fontSize: "13.5px" }}
                  >
                    {currencies.map((curr) => (
                      <option key={curr.code} value={curr.code}>
                        {curr.name} ({curr.code} - {curr.symbol})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </GlassCard>
          )}

          {activeTab === "branding" && (
            <GlassCard variant="panel" style={{ padding: "28px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#f8fafc", marginBottom: "6px" }}>
                Brand Identity & Customer Experience
              </h3>
              <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "24px" }}>
                Customize how your business appears on the customer booking portal, email notifications, and invoices.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Brand Display Name
                  </label>
                  <input
                    type="text"
                    value={profile.brandName || ""}
                    onChange={(e) => handleProfileChange("brandName", e.target.value)}
                    placeholder="e.g. Studio Luxe & Spa"
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Brand Logo URL
                  </label>
                  <input
                    type="url"
                    value={profile.logoUrl || ""}
                    onChange={(e) => handleProfileChange("logoUrl", e.target.value)}
                    placeholder="https://cdn.example.com/logo.png"
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Primary Accent Color
                  </label>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <input
                      type="color"
                      value={profile.primaryColor || "#0284c7"}
                      onChange={(e) => handleProfileChange("primaryColor", e.target.value)}
                      style={{ width: "44px", height: "42px", borderRadius: "8px", border: "none", cursor: "pointer", backgroundColor: "transparent" }}
                    />
                    <input
                      type="text"
                      value={profile.primaryColor || "#0284c7"}
                      onChange={(e) => handleProfileChange("primaryColor", e.target.value)}
                      style={{ flex: 1, padding: "11px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                    />
                  </div>
                </div>
              </div>
            </GlassCard>
          )}

          {activeTab === "policy" && (
            <GlassCard variant="panel" style={{ padding: "28px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#f8fafc", marginBottom: "6px" }}>
                Online Booking & Cancellation Policy
              </h3>
              <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "24px" }}>
                Define notice requirements, hold timeouts, and automated late cancellation fees.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Minimum Notice Required (Hours)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={policy.minNoticeHours}
                    onChange={(e) => handlePolicyChange("minNoticeHours", parseInt(e.target.value, 10) || 0)}
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                  />
                  <span style={{ fontSize: "11.5px", color: "#94a3b8", marginTop: "4px", display: "block" }}>
                    Customers cannot book appointments starting sooner than this.
                  </span>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Max Advance Booking Window (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={policy.maxNoticeDays}
                    onChange={(e) => handlePolicyChange("maxNoticeDays", parseInt(e.target.value, 10) || 30)}
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                  />
                  <span style={{ fontSize: "11.5px", color: "#94a3b8", marginTop: "4px", display: "block" }}>
                    How far ahead customers can reserve calendar slots.
                  </span>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Free Cancellation Cutoff (Hours)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={policy.cancelCutoffHours}
                    onChange={(e) => handlePolicyChange("cancelCutoffHours", parseInt(e.target.value, 10) || 0)}
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                  />
                  <span style={{ fontSize: "11.5px", color: "#94a3b8", marginTop: "4px", display: "block" }}>
                    Cancellations after this cutoff trigger the cancellation fee.
                  </span>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Temporary Hold Timeout (Minutes)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="60"
                    value={policy.holdDurationMinutes}
                    onChange={(e) => handlePolicyChange("holdDurationMinutes", parseInt(e.target.value, 10) || 10)}
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                  />
                  <span style={{ fontSize: "11.5px", color: "#94a3b8", marginTop: "4px", display: "block" }}>
                    Time held during checkout before releasing back to the public.
                  </span>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Late Cancellation Fee Type
                  </label>
                  <select
                    value={policy.cancelFeeType}
                    onChange={(e) => handlePolicyChange("cancelFeeType", e.target.value as any)}
                    style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "#0f172a", color: "#fff", fontSize: "13.5px" }}
                  >
                    <option value="NONE">No Fee (Full Refund / Free Cancellation)</option>
                    <option value="PERCENTAGE">Percentage of Total Price (%)</option>
                    <option value="FIXED_AMOUNT">Fixed Dollar / Currency Fee ({profile.currency})</option>
                  </select>
                </div>

                {policy.cancelFeeType !== "NONE" && (
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                      {policy.cancelFeeType === "PERCENTAGE" ? "Fee Percentage (%)" : `Fixed Fee Amount (${profile.currency})`}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={policy.cancelFeeType === "PERCENTAGE" ? "100" : undefined}
                      value={policy.cancelFeeValue}
                      onChange={(e) => handlePolicyChange("cancelFeeValue", parseFloat(e.target.value) || 0)}
                      placeholder={policy.cancelFeeType === "PERCENTAGE" ? "50" : "25.00"}
                      style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                    />
                  </div>
                )}
              </div>
            </GlassCard>
          )}

          {/* Sticky Save Bar */}
          <div
            style={{
              marginTop: "24px",
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
            }}
          >
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "12px 28px",
                borderRadius: "8px",
                border: "none",
                background: "linear-gradient(135deg, #0284c7, #2563eb)",
                color: "#fff",
                fontWeight: 800,
                fontSize: "14px",
                cursor: saving ? "not-allowed" : "pointer",
                boxShadow: "0 4px 14px rgba(2, 132, 199, 0.35)",
              }}
            >
              {saving ? "Saving Changes…" : "Save Configuration"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
