"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "../../../components/shell/app-shell";
import { apiFetch } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import {
  Mail,
  Users,
  Tag,
  Plus,
  Trash2,
  Edit2,
  Send,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Sparkles,
  Clock,
  Search,
  Filter,
  X,
  ExternalLink,
  Eye,
  Check,
} from "../../../components/icons";
import { sanitizeErrorMessage, SanitizedError } from "../../../lib/error-utils";
import { SanitizedAlert } from "../../../components/sanitized-alert";
import { formatCurrency } from "../../../lib/currency-utils";
import styles from "./marketing.module.css";

type AudienceSegment = "ALL_SUBSCRIBED" | "PORTAL_MEMBERS" | "VIP_CLIENTS" | "INACTIVE_CLIENTS" | "RECENT_CLIENTS";

interface MarketingStats {
  totalSubscribers: number;
  totalAudience: number;
  optInRatePct: number;
  unsubscribedCount: number;
  totalCampaignsSent: number;
  deliveredCount: number;
  failedCount: number;
  deliveryRatePct: number;
  activeCouponsCount: number;
}

interface Template {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  sentAt?: string | null;
  createdAt: string;
  template: {
    id: string;
    name: string;
    subject: string;
  };
}

interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  sentAt?: string | null;
  createdAt: string;
  template: {
    id: string;
    name: string;
    subject: string;
  };
  recipients: {
    id: string;
    customerId?: string | null;
    customerName: string;
    recipientEmail: string;
    status: string;
    providerId?: string | null;
    sentAt?: string | null;
    failedAt?: string | null;
    lastError?: string | null;
  }[];
}

interface Coupon {
  id: string;
  organizationId: string;
  code: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  minSpendCents?: number | null;
  maxDiscountCents?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  usageLimit?: number | null;
  usageCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AudienceCustomer {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  consentMarketing: boolean;
  consentMarketingAt?: string | null;
  isRegisteredUser: boolean;
  totalAppointments: number;
  totalSpentCents: number;
  lastBookingAt?: string | null;
  createdAt: string;
}

const PRESET_TEMPLATES = [
  {
    name: "VIP Appreciation & Exclusive Deal",
    subject: "A special gift for you from {{studioName}}",
    htmlBody: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 12px;">
  <h1 style="color: #38bdf8; font-size: 22px;">Hello {{customerName}},</h1>
  <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1;">As one of our most valued clients at <strong>{{studioName}}</strong>, we want to thank you with an exclusive seasonal offer.</p>
  <div style="background: rgba(56, 189, 248, 0.1); border: 1px dashed #38bdf8; padding: 18px; border-radius: 8px; text-align: center; margin: 24px 0;">
    <p style="margin: 0; font-size: 14px; text-transform: uppercase; color: #94a3b8;">Use Promo Code</p>
    <h2 style="margin: 6px 0; font-size: 28px; letter-spacing: 2px; color: #38bdf8;">{{couponCode}}</h2>
    <p style="margin: 0; font-size: 15px; color: #f1f5f9;">Save <strong>{{discountValue}}</strong> on your upcoming reservation</p>
  </div>
  <p style="text-align: center; margin-top: 28px;">
    <a href="{{bookingLink}}" style="background: #0284c7; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Book Your Appointment</a>
  </p>
  <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 36px;">You are receiving this because you opted into promotional updates from {{studioName}}.</p>
</div>`,
    textBody: "Hello {{customerName}},\n\nAs one of our most valued clients at {{studioName}}, we would love to offer you {{discountValue}} off using promo code {{couponCode}}.\n\nBook here: {{bookingLink}}",
  },
  {
    name: "We Miss You — Re-engagement",
    subject: "It's time to treat yourself at {{studioName}}",
    htmlBody: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 12px;">
  <h1 style="color: #38bdf8; font-size: 22px;">We miss seeing you, {{customerName}}!</h1>
  <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1;">It has been a while since your last appointment at <strong>{{studioName}}</strong>. Take a moment for self-care this week.</p>
  <p style="text-align: center; margin: 28px 0;">
    <a href="{{bookingLink}}" style="background: #0284c7; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Explore Live Openings</a>
  </p>
  <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 36px;">{{studioName}} · Professional Services</p>
</div>`,
    textBody: "Hello {{customerName}},\n\nWe miss seeing you at {{studioName}}! View our live availability and book here: {{bookingLink}}",
  },
];

export default function MarketingPage() {
  const { user } = useAuth();
  const orgCurrency = user?.currency || "USD";
  const [activeTab, setActiveTab] = useState<"campaigns" | "templates" | "coupons" | "audience">("campaigns");
  const [stats, setStats] = useState<MarketingStats | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [audience, setAudience] = useState<AudienceCustomer[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);
  const [errorState, setErrorState] = useState<SanitizedError | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Progressive disclosure controls for large record sets
  const [showAllCampaigns, setShowAllCampaigns] = useState(false);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [showAllCoupons, setShowAllCoupons] = useState(false);
  const [showAllAudience, setShowAllAudience] = useState(false);
  const [showAllModalRecipients, setShowAllModalRecipients] = useState(false);

  // Campaign creation modal state
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedSegment, setSelectedSegment] = useState<AudienceSegment>("ALL_SUBSCRIBED");
  const [selectedCouponId, setSelectedCouponId] = useState("");
  const [recipientPreviewCount, setRecipientPreviewCount] = useState<number | null>(null);
  const [loadingRecipientCount, setLoadingRecipientCount] = useState(false);

  // Delivery report modal state
  const [inspectingCampaign, setInspectingCampaign] = useState<CampaignDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Template editor state
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateHtml, setTemplateHtml] = useState("");
  const [templateText, setTemplateText] = useState("");
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "mobile">("desktop");

  // Coupon modal state
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscountType, setCouponDiscountType] = useState<"PERCENTAGE" | "FIXED_AMOUNT">("PERCENTAGE");
  const [couponDiscountValue, setCouponDiscountValue] = useState("20");
  const [couponMinSpend, setCouponMinSpend] = useState("");
  const [couponMaxDiscount, setCouponMaxDiscount] = useState("");
  const [couponValidTo, setCouponValidTo] = useState("");
  const [couponUsageLimit, setCouponUsageLimit] = useState("");

  // Audience directory state
  const [audienceSearch, setAudienceSearch] = useState("");
  const [audienceStatusFilter, setAudienceStatusFilter] = useState<"all" | "subscribed" | "unsubscribed">("all");

  // ==========================================
  // DATA LOADERS
  // ==========================================

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, tplRes, campRes, cpnRes, audRes] = await Promise.all([
        apiFetch<MarketingStats>("/marketing/stats"),
        apiFetch<Template[]>("/marketing/templates"),
        apiFetch<Campaign[]>("/marketing/campaigns"),
        apiFetch<Coupon[]>("/marketing/coupons"),
        apiFetch<AudienceCustomer[]>("/marketing/audience"),
      ]);

      if (statsRes.success) setStats(statsRes.data || null);
      if (tplRes.success) setTemplates(tplRes.data || []);
      if (campRes.success) setCampaigns(campRes.data || []);
      if (cpnRes.success) setCoupons(cpnRes.data || []);
      if (audRes.success) setAudience(audRes.data || []);
    } catch {
      setMessage({ error: true, text: "Failed to load marketing dashboard data." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Recipient count preview
  useEffect(() => {
    if (!showCampaignModal) return;
    setLoadingRecipientCount(true);
    apiFetch<{ count: number }>(`/marketing/audience/count?segment=${selectedSegment}`)
      .then((res) => {
        if (res.success && res.data) setRecipientPreviewCount(res.data.count);
        else setRecipientPreviewCount(0);
      })
      .catch(() => setRecipientPreviewCount(0))
      .finally(() => setLoadingRecipientCount(false));
  }, [showCampaignModal, selectedSegment]);

  // Copy helper
  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // ==========================================
  // CAMPAIGN ACTIONS
  // ==========================================

  async function handleLaunchCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTemplateId || !campaignName.trim()) {
      setErrorState(sanitizeErrorMessage("Please select a template and provide a campaign name."));
      return;
    }

    setBusy(true);
    setErrorState(null);
    const payload = {
      name: campaignName.trim(),
      templateId: selectedTemplateId,
      segment: selectedSegment,
      couponId: selectedCouponId || undefined,
    };

    const res = await apiFetch<Campaign>("/marketing/campaigns/send", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setBusy(false);
    if (res.success) {
      setMessage({ text: `Campaign "${campaignName}" queued successfully through the durable pipeline.` });
      setErrorState(null);
      setShowCampaignModal(false);
      setCampaignName("");
      setSelectedTemplateId("");
      setSelectedCouponId("");
      await loadAll();
    } else {
      setErrorState(sanitizeErrorMessage(res.error?.message, "Could not queue marketing campaign."));
    }
  }

  async function handleOpenDeliveryReport(campaignId: string) {
    setLoadingDetail(true);
    setInspectingCampaign(null);
    setErrorState(null);
    const res = await apiFetch<CampaignDetail>(`/marketing/campaigns/${campaignId}`);
    setLoadingDetail(false);
    if (res.success && res.data) {
      setInspectingCampaign(res.data);
    } else {
      setErrorState(sanitizeErrorMessage(res.error?.message, "Could not load campaign delivery report."));
    }
  }

  // ==========================================
  // TEMPLATE STUDIO ACTIONS
  // ==========================================

  function handleStartEditTemplate(tpl?: Template) {
    if (tpl) {
      setEditingTemplate(tpl);
      setTemplateName(tpl.name);
      setTemplateSubject(tpl.subject);
      setTemplateHtml(tpl.htmlBody);
      setTemplateText(tpl.textBody || "");
    } else {
      setEditingTemplate(null);
      setTemplateName("");
      setTemplateSubject("");
      setTemplateHtml("<h1>Hello {{customerName}}</h1>\n<p>An update from {{studioName}}</p>");
      setTemplateText("Hello {{customerName}},\n\nAn update from {{studioName}}");
    }
    setActiveTab("templates");
  }

  function handleApplyPreset(preset: (typeof PRESET_TEMPLATES)[0]) {
    setEditingTemplate(null);
    setTemplateName(preset.name);
    setTemplateSubject(preset.subject);
    setTemplateHtml(preset.htmlBody);
    setTemplateText(preset.textBody);
    setMessage({ text: `Applied preset: "${preset.name}". You can customize and save it.` });
    setErrorState(null);
  }

  function handleInsertVariable(variableName: string) {
    const chip = `{{${variableName}}}`;
    setTemplateHtml((prev) => prev + chip);
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorState(null);
    const payload = {
      name: templateName.trim(),
      subject: templateSubject.trim(),
      htmlBody: templateHtml,
      textBody: templateText || undefined,
    };

    const res = await apiFetch(
      editingTemplate ? `/marketing/templates/${editingTemplate.id}` : "/marketing/templates",
      {
        method: editingTemplate ? "PUT" : "POST",
        body: JSON.stringify(payload),
      }
    );

    setBusy(false);
    if (res.success) {
      setMessage({ text: editingTemplate ? "Template updated successfully." : "Template saved successfully." });
      setErrorState(null);
      setEditingTemplate(null);
      await loadAll();
    } else {
      setErrorState(sanitizeErrorMessage(res.error?.message, "Failed to save template."));
    }
  }

  async function handleDuplicateTemplate(tplId: string) {
    setBusy(true);
    setErrorState(null);
    const res = await apiFetch(`/marketing/templates/${tplId}/duplicate`, { method: "POST" });
    setBusy(false);
    if (res.success) {
      setMessage({ text: "Template cloned successfully." });
      setErrorState(null);
      await loadAll();
    } else {
      setErrorState(sanitizeErrorMessage(res.error?.message, "Failed to duplicate template."));
    }
  }

  async function handleDeleteTemplate(tpl: Template) {
    if (!confirm(`Are you sure you want to delete template "${tpl.name}"?`)) return;
    setBusy(true);
    setErrorState(null);
    const res = await apiFetch(`/marketing/templates/${tpl.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.success) {
      setMessage({ text: "Template deleted." });
      setErrorState(null);
      if (editingTemplate?.id === tpl.id) setEditingTemplate(null);
      await loadAll();
    } else {
      setErrorState(sanitizeErrorMessage(res.error?.message, "Failed to delete template."));
    }
  }

  // Simulated email preview data
  const simulatedHtmlPreview = useMemo(() => {
    let html = templateHtml;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://bookpro.app";
    html = html.replace(/{{customerName}}/g, "Jane Doe");
    html = html.replace(/{{studioName}}/g, user?.organizationName || "Luxe Wellness Studio");
    html = html.replace(/{{bookingLink}}/g, `${origin}/${user?.organizationSlug || "studio"}/book?coupon=WELCOME20`);
    html = html.replace(/{{couponCode}}/g, "WELCOME20");
    html = html.replace(/{{discountValue}}/g, "20% OFF");
    return html;
  }, [templateHtml, user]);

  // ==========================================
  // COUPON ACTIONS
  // ==========================================

  function handleOpenCouponModal(cpn?: Coupon) {
    if (cpn) {
      setEditingCoupon(cpn);
      setCouponCode(cpn.code);
      setCouponDiscountType(cpn.discountType);
      setCouponDiscountValue(
        cpn.discountType === "PERCENTAGE"
          ? String(cpn.discountValue)
          : String((cpn.discountValue / 100).toFixed(2))
      );
      setCouponMinSpend(cpn.minSpendCents ? String((cpn.minSpendCents / 100).toFixed(2)) : "");
      setCouponMaxDiscount(cpn.maxDiscountCents ? String((cpn.maxDiscountCents / 100).toFixed(2)) : "");
      setCouponValidTo(cpn.validTo ? cpn.validTo.substring(0, 10) : "");
      setCouponUsageLimit(cpn.usageLimit ? String(cpn.usageLimit) : "");
    } else {
      setEditingCoupon(null);
      setCouponCode("");
      setCouponDiscountType("PERCENTAGE");
      setCouponDiscountValue("20");
      setCouponMinSpend("");
      setCouponMaxDiscount("");
      setCouponValidTo("");
      setCouponUsageLimit("");
    }
    setShowCouponModal(true);
  }

  async function handleSaveCoupon(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorState(null);

    const valNum = parseFloat(couponDiscountValue);
    const discountValue =
      couponDiscountType === "PERCENTAGE"
        ? Math.round(valNum)
        : Math.round(valNum * 100);

    const payload = {
      code: couponCode.trim().toUpperCase(),
      discountType: couponDiscountType,
      discountValue,
      minSpendCents: couponMinSpend ? Math.round(parseFloat(couponMinSpend) * 100) : null,
      maxDiscountCents: couponMaxDiscount ? Math.round(parseFloat(couponMaxDiscount) * 100) : null,
      validTo: couponValidTo ? new Date(couponValidTo).toISOString() : null,
      usageLimit: couponUsageLimit ? parseInt(couponUsageLimit, 10) : null,
    };

    const res = await apiFetch(
      editingCoupon ? `/marketing/coupons/${editingCoupon.id}` : "/marketing/coupons",
      {
        method: editingCoupon ? "PUT" : "POST",
        body: JSON.stringify(payload),
      }
    );

    setBusy(false);
    if (res.success) {
      setMessage({ text: editingCoupon ? "Promo code updated." : "Promo code created." });
      setErrorState(null);
      setShowCouponModal(false);
      await loadAll();
    } else {
      setErrorState(sanitizeErrorMessage(res.error?.message, "Failed to save promo code."));
    }
  }

  async function handleToggleCoupon(id: string) {
    setErrorState(null);
    const res = await apiFetch(`/marketing/coupons/${id}/toggle`, { method: "PATCH" });
    if (res.success) {
      await loadAll();
    } else {
      setErrorState(sanitizeErrorMessage(res.error?.message, "Failed to toggle promo code."));
    }
  }

  async function handleDeleteCoupon(cpn: Coupon) {
    if (!confirm(`Delete promo code "${cpn.code}"?`)) return;
    setErrorState(null);
    const res = await apiFetch(`/marketing/coupons/${cpn.id}`, { method: "DELETE" });
    if (res.success) {
      setMessage({ text: "Promo code deleted." });
      setErrorState(null);
      await loadAll();
    } else {
      setErrorState(sanitizeErrorMessage(res.error?.message, "Failed to delete promo code."));
    }
  }

  function handleCreateCampaignWithCoupon(cpn: Coupon) {
    setSelectedCouponId(cpn.id);
    setCampaignName(`${cpn.code} Exclusive Offer · ${new Intl.DateTimeFormat("en-CA").format(new Date())}`);
    if (templates.length > 0) setSelectedTemplateId(templates[0].id);
    setShowCampaignModal(true);
  }

  // Filtered audience
  const filteredAudience = useMemo(() => {
    return audience.filter((c) => {
      if (audienceStatusFilter === "subscribed" && !c.consentMarketing) return false;
      if (audienceStatusFilter === "unsubscribed" && c.consentMarketing) return false;
      if (audienceSearch.trim()) {
        const q = audienceSearch.toLowerCase();
        return c.fullName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
      }
      return true;
    });
  }, [audience, audienceStatusFilter, audienceSearch]);

  return (
    <div className={styles.container}>
      <PageHeader
        title="Marketing & Growth Hub"
        description="Deliver targeted email broadcasts, launch studio promo perks, and manage customer marketing consent backed by PostgreSQL and Brevo."
        actions={
          <div style={{ display: "flex", gap: "10px" }}>
            <button className={styles.btnSecondary} onClick={loadAll} disabled={loading}>
              <RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh Telemetry
            </button>
            <button
              className={styles.btnPrimary}
              onClick={() => {
                setCampaignName(`Special Announcement · ${new Intl.DateTimeFormat("en-CA").format(new Date())}`);
                if (templates.length > 0 && !selectedTemplateId) setSelectedTemplateId(templates[0].id);
                setShowCampaignModal(true);
              }}
            >
              <Send size={15} /> Queue Broadcast
            </button>
          </div>
        }
      />

      {errorState && (
        <div style={{ marginBottom: "16px" }}>
          <SanitizedAlert error={errorState} onDismiss={() => setErrorState(null)} />
        </div>
      )}

      {message && !message.error && (
        <div className={`${styles.alert} ${styles.alertSuccess}`}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <CheckCircle2 size={18} />
            <span>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Top Telemetry KPI Row */}
      <section className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>Subscribers</span>
            <Users size={16} color="#38bdf8" />
          </div>
          <div className={styles.statValue}>
            {stats ? stats.totalSubscribers.toLocaleString() : "—"}
          </div>
          <div className={styles.statSubtext}>
            <span>{stats?.optInRatePct ?? 0}% consent opt-in rate</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>Reachable Audience</span>
            <Mail size={16} color="#818cf8" />
          </div>
          <div className={styles.statValue}>
            {stats ? stats.totalAudience.toLocaleString() : "—"}
          </div>
          <div className={styles.statSubtext}>
            <span>{stats ? stats.unsubscribedCount : 0} contacts opted out</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>Delivery Success</span>
            <CheckCircle2 size={16} color="#4ade80" />
          </div>
          <div className={styles.statValue}>
            {stats ? `${stats.deliveryRatePct}%` : "100%"}
          </div>
          <div className={styles.statSubtext}>
            <span>{stats?.deliveredCount ?? 0} delivered · {stats?.failedCount ?? 0} failed</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span>Active Studio Deals</span>
            <Tag size={16} color="#facc15" />
          </div>
          <div className={styles.statValue}>
            {stats ? stats.activeCouponsCount : coupons.filter((c) => c.isActive).length}
          </div>
          <div className={styles.statSubtext}>
            <span>{coupons.length} total coupons configured</span>
          </div>
        </div>
      </section>

      {/* Navigation Tabs */}
      <nav className={styles.tabNav}>
        <button
          className={`${styles.tabButton} ${activeTab === "campaigns" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("campaigns")}
        >
          <Send size={16} /> Campaigns & Broadcasts ({campaigns.length})
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === "templates" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("templates")}
        >
          <Mail size={16} /> Email Template Studio ({templates.length})
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === "coupons" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("coupons")}
        >
          <Tag size={16} /> Studio Deals & Promo Codes ({coupons.length})
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === "audience" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("audience")}
        >
          <Users size={16} /> Audience & Consent Directory ({audience.length})
        </button>
      </nav>

      {/* ========================================================================= */}
      {/* TAB 1: CAMPAIGNS & BROADCASTS */}
      {/* ========================================================================= */}
      {activeTab === "campaigns" && (
        <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Campaign History & Delivery Status</h2>
              <p className={styles.sectionDesc}>
                Real-time tracking of sent and queued customer campaigns powered by the durable Brevo worker pipeline.
              </p>
            </div>
            <button
              className={styles.btnPrimary}
              onClick={() => {
                setCampaignName(`Special Announcement · ${new Intl.DateTimeFormat("en-CA").format(new Date())}`);
                if (templates.length > 0 && !selectedTemplateId) setSelectedTemplateId(templates[0].id);
                setShowCampaignModal(true);
              }}
            >
              <Plus size={15} /> Launch Campaign
            </button>
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Campaign Name</th>
                  <th>Template / Subject</th>
                  <th>Status</th>
                  <th>Delivery Progress</th>
                  <th>Sent At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "36px", color: "#94a3b8" }}>
                      No campaigns have been sent yet. Click &quot;Launch Campaign&quot; to queue your first broadcast.
                    </td>
                  </tr>
                ) : (
                  (showAllCampaigns ? campaigns : campaigns.slice(0, 8)).map((camp) => {
                    const pct =
                      camp.recipientCount > 0
                        ? Math.round((camp.deliveredCount / camp.recipientCount) * 100)
                        : camp.status === "SENT"
                        ? 100
                        : 0;
                    return (
                      <tr key={camp.id}>
                        <td>
                          <strong>{camp.name}</strong>
                        </td>
                        <td>
                          <div style={{ color: "#f1f5f9" }}>{camp.template.name}</div>
                          <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{camp.template.subject}</div>
                        </td>
                        <td>
                          <span
                            className={`${styles.badge} ${
                              camp.status === "SENT"
                                ? styles.badgeSent
                                : camp.status === "QUEUED"
                                ? styles.badgeQueued
                                : styles.badgeFailed
                            }`}
                          >
                            {camp.status}
                          </span>
                        </td>
                        <td style={{ minWidth: "160px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "4px" }}>
                            <span>
                              {camp.deliveredCount} / {camp.recipientCount}
                            </span>
                            <span>{pct}%</span>
                          </div>
                          <div className={styles.progressBar}>
                            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                          </div>
                          {camp.failedCount > 0 && (
                            <span style={{ fontSize: "0.72rem", color: "#f87171" }}>
                              {camp.failedCount} failed
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                          {new Intl.DateTimeFormat(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(camp.createdAt))}
                        </td>
                        <td>
                          <button
                            className={styles.btnSecondary}
                            onClick={() => handleOpenDeliveryReport(camp.id)}
                          >
                            <Eye size={14} /> Delivery Report
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {campaigns.length > 8 && (
            <div style={{ textAlign: "center", marginTop: "12px" }}>
              <button
                type="button"
                onClick={() => setShowAllCampaigns(!showAllCampaigns)}
                className={styles.btnSecondary}
                style={{ fontSize: "12px", padding: "6px 16px" }}
              >
                {showAllCampaigns
                  ? "Show fewer campaigns"
                  : `Showing 8 of ${campaigns.length} campaigns · See all`}
              </button>
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: EMAIL TEMPLATE STUDIO */}
      {/* ========================================================================= */}
      {activeTab === "templates" && (
        <section style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>
                {editingTemplate ? `Editing: ${editingTemplate.name}` : "Email Template Studio"}
              </h2>
              <p className={styles.sectionDesc}>
                Compose responsive, safe email templates with dynamic customer personalization and coupon injection.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {PRESET_TEMPLATES.map((p, idx) => (
                <button
                  key={idx}
                  className={styles.btnSecondary}
                  onClick={() => handleApplyPreset(p)}
                >
                  <Sparkles size={14} /> {p.name.split(" ")[0]} Preset
                </button>
              ))}
              <button
                className={styles.btnPrimary}
                onClick={() => handleStartEditTemplate()}
              >
                <Plus size={15} /> New Template
              </button>
            </div>
          </div>

          <div className={styles.dualPane}>
            {/* Left: Form */}
            <div className={styles.panel}>
              <form onSubmit={handleSaveTemplate}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Template Name</label>
                  <input
                    className={styles.input}
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g. VIP Seasonal Offer"
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Email Subject</label>
                  <input
                    className={styles.input}
                    value={templateSubject}
                    onChange={(e) => setTemplateSubject(e.target.value)}
                    placeholder="e.g. A special gift from {{studioName}}"
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <div className={styles.formLabel}>
                    <span>HTML Email Body</span>
                    <span className={styles.helper}>Use safe inline HTML</span>
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Insert variable: </span>
                    <div className={styles.variableChips}>
                      <button
                        type="button"
                        className={styles.variableChip}
                        onClick={() => handleInsertVariable("customerName")}
                      >
                        + customerName
                      </button>
                      <button
                        type="button"
                        className={styles.variableChip}
                        onClick={() => handleInsertVariable("studioName")}
                      >
                        + studioName
                      </button>
                      <button
                        type="button"
                        className={styles.variableChip}
                        onClick={() => handleInsertVariable("bookingLink")}
                      >
                        + bookingLink
                      </button>
                      <button
                        type="button"
                        className={styles.variableChip}
                        onClick={() => handleInsertVariable("couponCode")}
                      >
                        + couponCode
                      </button>
                      <button
                        type="button"
                        className={styles.variableChip}
                        onClick={() => handleInsertVariable("discountValue")}
                      >
                        + discountValue
                      </button>
                    </div>
                  </div>
                  <textarea
                    className={styles.textarea}
                    style={{ minHeight: "220px" }}
                    value={templateHtml}
                    onChange={(e) => setTemplateHtml(e.target.value)}
                    placeholder="<h1>Hello {{customerName}}</h1>..."
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Plain-Text Fallback</label>
                  <textarea
                    className={styles.textarea}
                    style={{ minHeight: "80px" }}
                    value={templateText}
                    onChange={(e) => setTemplateText(e.target.value)}
                    placeholder="Hello {{customerName}}, ..."
                  />
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                  <button className={styles.btnPrimary} type="submit" disabled={busy}>
                    {busy ? "Saving…" : editingTemplate ? "Update Template" : "Save Template"}
                  </button>
                  {editingTemplate && (
                    <button
                      className={styles.btnSecondary}
                      type="button"
                      onClick={() => setEditingTemplate(null)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Right: Live Preview */}
            <div className={styles.panel}>
              <div className={styles.previewContainer}>
                <div className={styles.previewToolbar}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Eye size={16} color="#38bdf8" />
                    <strong style={{ fontSize: "0.85rem", color: "#f8fafc" }}>Live Recipient Preview</strong>
                  </div>
                  <div className={styles.viewportToggle}>
                    <button
                      className={`${styles.viewportBtn} ${
                        previewViewport === "desktop" ? styles.viewportBtnActive : ""
                      }`}
                      onClick={() => setPreviewViewport("desktop")}
                    >
                      Desktop
                    </button>
                    <button
                      className={`${styles.viewportBtn} ${
                        previewViewport === "mobile" ? styles.viewportBtnActive : ""
                      }`}
                      onClick={() => setPreviewViewport("mobile")}
                    >
                      Mobile
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: "0.8rem", color: "#94a3b8", padding: "6px 0" }}>
                  <strong>Subject:</strong> {templateSubject || "(No subject provided)"}
                </div>

                <div className={previewViewport === "desktop" ? styles.previewDesktop : styles.previewMobile}>
                  <div
                    dangerouslySetInnerHTML={{ __html: simulatedHtmlPreview }}
                    style={{ color: "#f8fafc" }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Template Catalogue */}
          <div className={styles.sectionHeader} style={{ marginTop: "24px" }}>
            <h3 className={styles.sectionTitle}>Saved Organization Templates ({templates.length})</h3>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
            {(showAllTemplates ? templates : templates.slice(0, 6)).map((tpl) => (
              <div key={tpl.id} className={styles.panel} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <strong style={{ color: "#f8fafc", fontSize: "1rem" }}>{tpl.name}</strong>
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "4px" }}>
                    Subject: <em>{tpl.subject}</em>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "auto" }}>
                  <button className={styles.btnSecondary} onClick={() => handleStartEditTemplate(tpl)}>
                    <Edit2 size={13} /> Edit
                  </button>
                  <button className={styles.btnSecondary} onClick={() => handleDuplicateTemplate(tpl.id)}>
                    <Copy size={13} /> Clone
                  </button>
                  <button
                    className={styles.btnPrimary}
                    onClick={() => {
                      setSelectedTemplateId(tpl.id);
                      setCampaignName(`${tpl.name} · ${new Intl.DateTimeFormat("en-CA").format(new Date())}`);
                      setShowCampaignModal(true);
                    }}
                  >
                    <Send size={13} /> Broadcast
                  </button>
                  <button className={styles.btnDanger} onClick={() => handleDeleteTemplate(tpl)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {templates.length > 6 && (
            <div style={{ textAlign: "center", marginTop: "12px" }}>
              <button
                type="button"
                onClick={() => setShowAllTemplates(!showAllTemplates)}
                className={styles.btnSecondary}
                style={{ fontSize: "12px", padding: "6px 16px" }}
              >
                {showAllTemplates
                  ? "Show fewer templates"
                  : `Showing 6 of ${templates.length} templates · See all`}
              </button>
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: STUDIO DEALS & PROMO CODES */}
      {/* ========================================================================= */}
      {activeTab === "coupons" && (
        <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Studio Deals & Promotional Perks</h2>
              <p className={styles.sectionDesc}>
                Create verified coupons that customers can view in their Customer Portal and redeem during booking checkout.
              </p>
            </div>
            <button className={styles.btnPrimary} onClick={() => handleOpenCouponModal()}>
              <Plus size={15} /> Create Promo Code
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
            {coupons.length === 0 ? (
              <div className={styles.panel} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px" }}>
                <p style={{ color: "#94a3b8", margin: 0 }}>
                  No coupons configured yet. Click &quot;Create Promo Code&quot; to offer special discounts to your clients.
                </p>
              </div>
            ) : (
              (showAllCoupons ? coupons : coupons.slice(0, 6)).map((cpn) => {
                const isExpired = cpn.validTo && new Date(cpn.validTo) < new Date();
                const usagePct = cpn.usageLimit ? Math.round((cpn.usageCount / cpn.usageLimit) * 100) : 0;
                return (
                  <div key={cpn.id} className={styles.couponCard}>
                    <div className={styles.couponHeader}>
                      <div className={styles.couponCode}>
                        <span>{cpn.code}</span>
                        <button
                          onClick={() => handleCopy(cpn.code)}
                          style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", display: "flex" }}
                          title="Copy Code"
                        >
                          {copiedCode === cpn.code ? <Check size={14} color="#4ade80" /> : <Copy size={14} />}
                        </button>
                      </div>
                      <span className={`${styles.badge} ${cpn.isActive && !isExpired ? styles.badgeActive : styles.badgeInactive}`}>
                        {!cpn.isActive ? "Disabled" : isExpired ? "Expired" : "Active"}
                      </span>
                    </div>

                    <div style={{ fontSize: "1.25rem", fontWeight: "800", color: "#f8fafc" }}>
                      {cpn.discountType === "PERCENTAGE" ? `${cpn.discountValue}% OFF` : `${formatCurrency(cpn.discountValue, orgCurrency)} OFF`}
                    </div>

                    <div style={{ fontSize: "0.78rem", color: "#94a3b8", display: "flex", flexDirection: "column", gap: "4px" }}>
                      {cpn.minSpendCents && (
                        <span>Minimum Spend: {formatCurrency(cpn.minSpendCents, orgCurrency)}</span>
                      )}
                      {cpn.maxDiscountCents && (
                        <span>Max Savings Cap: {formatCurrency(cpn.maxDiscountCents, orgCurrency)}</span>
                      )}
                      <span>
                        Validity: {cpn.validTo ? `Expires ${new Date(cpn.validTo).toLocaleDateString()}` : "No Expiration Date"}
                      </span>
                    </div>

                    {cpn.usageLimit && (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#94a3b8", marginBottom: "4px" }}>
                          <span>Redemptions: {cpn.usageCount} / {cpn.usageLimit}</span>
                          <span>{usagePct}%</span>
                        </div>
                        <div className={styles.progressBar}>
                          <div className={styles.progressFill} style={{ width: `${Math.min(100, usagePct)}%` }} />
                        </div>
                      </div>
                    )}

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px", paddingTop: "10px", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          className={styles.btnSecondary}
                          onClick={() => handleToggleCoupon(cpn.id)}
                          title="Toggle Active Status"
                        >
                          {cpn.isActive ? "Disable" : "Enable"}
                        </button>
                        <button
                          className={styles.btnSecondary}
                          onClick={() => handleOpenCouponModal(cpn)}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          className={styles.btnDanger}
                          onClick={() => handleDeleteCoupon(cpn)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <button
                        className={styles.btnPrimary}
                        style={{ fontSize: "0.75rem", padding: "6px 10px" }}
                        onClick={() => handleCreateCampaignWithCoupon(cpn)}
                      >
                        <Send size={12} /> Broadcast Deal
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {coupons.length > 6 && (
            <div style={{ textAlign: "center", marginTop: "12px" }}>
              <button
                type="button"
                onClick={() => setShowAllCoupons(!showAllCoupons)}
                className={styles.btnSecondary}
                style={{ fontSize: "12px", padding: "6px 16px" }}
              >
                {showAllCoupons
                  ? "Show fewer promo codes"
                  : `Showing 6 of ${coupons.length} promo codes · See all`}
              </button>
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: AUDIENCE & CONSENT DIRECTORY */}
      {/* ========================================================================= */}
      {activeTab === "audience" && (
        <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Customer Audience & Consent Directory</h2>
              <p className={styles.sectionDesc}>
                Real-time directory of all customers in your database, their marketing consent state, and CRM visit history.
              </p>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1, minWidth: "260px" }}>
              <input
                className={styles.input}
                style={{ paddingLeft: "36px" }}
                value={audienceSearch}
                onChange={(e) => setAudienceSearch(e.target.value)}
                placeholder="Search customers by name or email…"
              />
              <Search
                size={16}
                style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }}
              />
            </div>

            <div style={{ display: "flex", gap: "6px" }}>
              <button
                className={`${styles.btnSecondary} ${audienceStatusFilter === "all" ? styles.activeTab : ""}`}
                onClick={() => setAudienceStatusFilter("all")}
              >
                All ({audience.length})
              </button>
              <button
                className={`${styles.btnSecondary} ${audienceStatusFilter === "subscribed" ? styles.activeTab : ""}`}
                onClick={() => setAudienceStatusFilter("subscribed")}
              >
                Subscribed ({audience.filter((a) => a.consentMarketing).length})
              </button>
              <button
                className={`${styles.btnSecondary} ${audienceStatusFilter === "unsubscribed" ? styles.activeTab : ""}`}
                onClick={() => setAudienceStatusFilter("unsubscribed")}
              >
                Unsubscribed ({audience.filter((a) => !a.consentMarketing).length})
              </button>
            </div>
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Account Type</th>
                  <th>Marketing Consent</th>
                  <th>Consent Date</th>
                  <th>Completed Visits</th>
                  <th>Total Spent</th>
                </tr>
              </thead>
              <tbody>
                {filteredAudience.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "36px", color: "#94a3b8" }}>
                      No customers match your search criteria.
                    </td>
                  </tr>
                ) : (
                  (showAllAudience ? filteredAudience : filteredAudience.slice(0, 10)).map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.fullName}</strong>
                        <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>{c.email}</div>
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            c.isRegisteredUser ? styles.badgeActive : styles.badgeInactive
                          }`}
                        >
                          {c.isRegisteredUser ? "Portal Member" : "Guest Contact"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            c.consentMarketing ? styles.badgeSent : styles.badgeInactive
                          }`}
                        >
                          {c.consentMarketing ? "Subscribed" : "Unsubscribed"}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                        {c.consentMarketingAt
                          ? new Date(c.consentMarketingAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td>{c.totalAppointments} visits</td>
                      <td>{formatCurrency(c.totalSpentCents, orgCurrency)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredAudience.length > 10 && (
            <div style={{ textAlign: "center", marginTop: "12px" }}>
              <button
                type="button"
                onClick={() => setShowAllAudience(!showAllAudience)}
                className={styles.btnSecondary}
                style={{ fontSize: "12px", padding: "6px 16px" }}
              >
                {showAllAudience
                  ? "Show fewer contacts"
                  : `Showing 10 of ${filteredAudience.length} customer contacts · See all`}
              </button>
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* CAMPAIGN LAUNCH MODAL */}
      {/* ========================================================================= */}
      {showCampaignModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Launch Email Campaign</h3>
              <button className={styles.closeBtn} onClick={() => setShowCampaignModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleLaunchCampaign}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Campaign Name</label>
                <input
                  className={styles.input}
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. Labor Day VIP Special"
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Select Email Template</label>
                <select
                  className={styles.select}
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    -- Choose an approved template --
                  </option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} ({tpl.subject})
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <div className={styles.formLabel}>
                  <span>Target Audience Segment</span>
                  <span style={{ color: "#38bdf8", fontWeight: "normal" }}>
                    {loadingRecipientCount ? "Counting…" : `Reaches ${recipientPreviewCount ?? 0} customer(s)`}
                  </span>
                </div>
                <select
                  className={styles.select}
                  value={selectedSegment}
                  onChange={(e) => setSelectedSegment(e.target.value as AudienceSegment)}
                >
                  <option value="ALL_SUBSCRIBED">
                    All Opted-In Contacts (Both Guest & Portal Members)
                  </option>
                  <option value="PORTAL_MEMBERS">
                    Registered Portal Members Only
                  </option>
                  <option value="VIP_CLIENTS">
                    VIP Clients (Spent &gt; $100 or 3+ Visits)
                  </option>
                  <option value="RECENT_CLIENTS">
                    Recent Clients (Visited in last 30 days)
                  </option>
                  <option value="INACTIVE_CLIENTS">
                    Inactive Win-back (No visits in &gt; 30 days)
                  </option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Attach Studio Deal / Promo Code (Optional)</label>
                <select
                  className={styles.select}
                  value={selectedCouponId}
                  onChange={(e) => setSelectedCouponId(e.target.value)}
                >
                  <option value="">-- No coupon attached --</option>
                  {coupons
                    .filter((c) => c.isActive)
                    .map((cpn) => (
                      <option key={cpn.id} value={cpn.id}>
                        {cpn.code} ({cpn.discountType === "PERCENTAGE" ? `${cpn.discountValue}% OFF` : `$${(cpn.discountValue / 100).toFixed(2)} OFF`})
                      </option>
                    ))}
                </select>
                <span className={styles.helper}>
                  Attached coupons are automatically substituted into <code>{"{{couponCode}}"}</code> and <code>{"{{bookingLink}}"}</code>.
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setShowCampaignModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={busy || templates.length === 0}
                >
                  {busy ? "Queueing…" : "Queue Campaign Now"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DELIVERY REPORT MODAL */}
      {/* ========================================================================= */}
      {inspectingCampaign && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: "800px" }}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Delivery Report: {inspectingCampaign.name}</h3>
                <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "2px" }}>
                  Template: {inspectingCampaign.template.name} ({inspectingCampaign.template.subject})
                </div>
              </div>
              <button className={styles.closeBtn} onClick={() => setInspectingCampaign(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
              <div style={{ background: "rgba(15, 23, 42, 0.5)", padding: "12px", borderRadius: "8px", textAlign: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>TOTAL RECIPIENTS</span>
                <div style={{ fontSize: "1.4rem", fontWeight: "800", color: "#f8fafc" }}>
                  {inspectingCampaign.recipientCount}
                </div>
              </div>
              <div style={{ background: "rgba(34, 197, 94, 0.08)", padding: "12px", borderRadius: "8px", textAlign: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "#4ade80" }}>DELIVERED</span>
                <div style={{ fontSize: "1.4rem", fontWeight: "800", color: "#4ade80" }}>
                  {inspectingCampaign.deliveredCount}
                </div>
              </div>
              <div style={{ background: "rgba(239, 68, 68, 0.08)", padding: "12px", borderRadius: "8px", textAlign: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "#f87171" }}>FAILED</span>
                <div style={{ fontSize: "1.4rem", fontWeight: "800", color: "#f87171" }}>
                  {inspectingCampaign.failedCount}
                </div>
              </div>
            </div>

            <div className={styles.tableContainer} style={{ maxHeight: "350px", overflowY: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Provider Message ID</th>
                    <th>Sent Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {inspectingCampaign.recipients.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "24px", color: "#94a3b8" }}>
                        No delivery records available.
                      </td>
                    </tr>
                  ) : (
                    (showAllModalRecipients ? inspectingCampaign.recipients : inspectingCampaign.recipients.slice(0, 10)).map((rec) => (
                      <tr key={rec.id}>
                        <td>
                          <strong>{rec.customerName}</strong>
                        </td>
                        <td style={{ color: "#94a3b8", fontSize: "0.8rem" }}>{rec.recipientEmail}</td>
                        <td>
                          <span
                            className={`${styles.badge} ${
                              rec.status === "SENT"
                                ? styles.badgeSent
                                : rec.status === "QUEUED"
                                ? styles.badgeQueued
                                : styles.badgeFailed
                            }`}
                          >
                            {rec.status}
                          </span>
                          {rec.lastError && (
                            <div style={{ fontSize: "0.72rem", color: "#f87171", marginTop: "2px" }}>
                              {sanitizeErrorMessage(rec.lastError).message}
                            </div>
                          )}
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#64748b" }}>
                          {rec.providerId || "Queued"}
                        </td>
                        <td style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                          {rec.sentAt
                            ? new Date(rec.sentAt).toLocaleTimeString()
                            : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {inspectingCampaign.recipients.length > 10 && (
              <div style={{ textAlign: "center", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setShowAllModalRecipients(!showAllModalRecipients)}
                  className={styles.btnSecondary}
                  style={{ fontSize: "11px", padding: "4px 12px" }}
                >
                  {showAllModalRecipients
                    ? "Show fewer recipients"
                    : `Showing 10 of ${inspectingCampaign.recipients.length} recipients · See all`}
                </button>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className={styles.btnSecondary} onClick={() => setInspectingCampaign(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CREATE / EDIT COUPON MODAL */}
      {/* ========================================================================= */}
      {showCouponModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {editingCoupon ? `Edit Promo Code: ${editingCoupon.code}` : "Create Studio Promo Code"}
              </h3>
              <button className={styles.closeBtn} onClick={() => setShowCouponModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCoupon}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Promo Code</label>
                <input
                  className={styles.input}
                  style={{ textTransform: "uppercase", letterSpacing: "1px", fontWeight: "bold" }}
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="e.g. SUMMER20"
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Discount Type</label>
                  <select
                    className={styles.select}
                    value={couponDiscountType}
                    onChange={(e) => setCouponDiscountType(e.target.value as any)}
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED_AMOUNT">Fixed Dollar ($)</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    Discount Value {couponDiscountType === "PERCENTAGE" ? "(%)" : "($)"}
                  </label>
                  <input
                    type="number"
                    step={couponDiscountType === "PERCENTAGE" ? "1" : "0.01"}
                    className={styles.input}
                    value={couponDiscountValue}
                    onChange={(e) => setCouponDiscountValue(e.target.value)}
                    placeholder={couponDiscountType === "PERCENTAGE" ? "20" : "15.00"}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Minimum Spend ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className={styles.input}
                    value={couponMinSpend}
                    onChange={(e) => setCouponMinSpend(e.target.value)}
                    placeholder="Optional (e.g. 50.00)"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Max Discount Cap ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className={styles.input}
                    value={couponMaxDiscount}
                    onChange={(e) => setCouponMaxDiscount(e.target.value)}
                    placeholder="Optional (e.g. 100.00)"
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Expiration Date</label>
                  <input
                    type="date"
                    className={styles.input}
                    value={couponValidTo}
                    onChange={(e) => setCouponValidTo(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Usage Redemption Limit</label>
                  <input
                    type="number"
                    className={styles.input}
                    value={couponUsageLimit}
                    onChange={(e) => setCouponUsageLimit(e.target.value)}
                    placeholder="Optional (e.g. 100)"
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setShowCouponModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={busy}>
                  {busy ? "Saving…" : editingCoupon ? "Update Code" : "Create Code"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
