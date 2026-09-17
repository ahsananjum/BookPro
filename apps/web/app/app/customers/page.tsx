"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "../../../components/shell/app-shell";
import { GlassCard } from "../../../components/glass-card";
import { CancellationDrawer } from "../../../components/cancellation-drawer";
import { useAuth } from "../../../lib/auth-context";
import { useRealtimeEvents } from "../../../lib/use-realtime-events";
import { apiFetch } from "../../../lib/api-client";
import {
  Users,
  UserCheck,
  DollarSign,
  Calendar,
  Search,
  Plus,
  Mail,
  Phone,
  Tag,
  ShieldCheck,
  Trash2,
  Edit2,
  Clock,
  Star,
  CheckCircle2,
  AlertCircle,
  X,
  Send,
  ExternalLink,
  ChevronRight,
  Filter,
} from "../../../components/icons";
import { formatCurrency } from "../../../lib/currency-utils";
import { sanitizeErrorMessage } from "../../../lib/error-utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  SpotlightCard,
  AnimatedGroup,
  MotionAlert,
  CollapsibleDisclosure,
} from "../../../components/motion-primitives";

interface CustomerSummary {
  id: string;
  organizationId: string;
  fullName: string;
  email: string;
  phone?: string;
  tags: string[];
  operationalNotes?: string;
  totalSpentCents: number;
  currency?: string;
  completedAppointmentsCount: number;
  cancelledCount: number;
  noShowCount: number;
  consentMarketing: boolean;
  consentMarketingAt?: string;
  consentSource?: string;
  lastBookingAt?: string;
  nextBookingAt?: string;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    emailVerifiedAt: string | null;
    accountType: string;
  } | null;
  pendingInvitation?: {
    id: string;
    status: string;
    expiresAt: string;
  } | null;
}

interface CustomerTimelineEvent {
  id: string;
  type: string;
  timestamp: string;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  actorType?: string;
}

interface Note {
  id: string;
  authorId: string;
  authorName?: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

interface CustomerDetails extends CustomerSummary {
  notes: Note[];
  timeline: CustomerTimelineEvent[];
  appointments: any[];
  waitlistEntries?: any[];
  reviews?: any[];
}

export default function CustomersPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId || "";
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDetails, setCustomerDetails] = useState<CustomerDetails | null>(null);
  const orgCurrency = customerDetails?.currency || customers[0]?.currency || user?.currency || "USD";
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<"ALL" | "PORTAL_MEMBER" | "GUEST">("ALL");
  const [activeTab, setActiveTab] = useState<"timeline" | "appointments" | "notes" | "waitlist_reviews">("timeline");

  // Loading states
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; error?: boolean } | null>(null);

  // Progressive disclosure states
  const [notesShowAll, setNotesShowAll] = useState(false);
  const [apptsShowAll, setApptsShowAll] = useState(false);
  const [timelineShowAll, setTimelineShowAll] = useState(false);
  const [operationalNotesExpanded, setOperationalNotesExpanded] = useState(false);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cancelAppointmentId, setCancelAppointmentId] = useState<string | null>(null);
  const [cancelDrawerOpen, setCancelDrawerOpen] = useState(false);

  // Form states
  const [newNoteContent, setNewNoteContent] = useState("");
  const [createForm, setCreateForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    tags: "",
    operationalNotes: "",
    consentMarketing: false,
  });
  const [editForm, setEditForm] = useState({
    fullName: "",
    phone: "",
    tags: "",
    operationalNotes: "",
  });

  // Fetch all customers for organization
  const fetchCustomers = useCallback(async () => {
    if (!orgId) return;
    setLoadingList(true);
    try {
      let queryParams = "";
      const params = new URLSearchParams();
      if (search.trim()) params.append("search", search.trim());
      if (selectedTag) params.append("tag", selectedTag);
      if (accountFilter !== "ALL") params.append("accountFilter", accountFilter);
      if (params.toString()) queryParams = `?${params.toString()}`;

      const res = await apiFetch<CustomerSummary[]>(`/organizations/${orgId}/customers${queryParams}`);
      if (res.success && res.data) {
        setCustomers(res.data);
        if (res.data.length > 0 && (!selectedCustomerId || !res.data.some((c) => c.id === selectedCustomerId))) {
          setSelectedCustomerId(res.data[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to load customers:", e);
    } finally {
      setLoadingList(false);
    }
  }, [orgId, search, selectedTag, accountFilter, selectedCustomerId]);

  // Fetch detailed customer profile
  const fetchCustomerDetails = useCallback(async (id: string) => {
    if (!orgId || !id) return;
    setLoadingDetails(true);
    try {
      const res = await apiFetch<CustomerDetails>(`/organizations/${orgId}/customers/${id}`);
      if (res.success && res.data) {
        setCustomerDetails(res.data);
        setEditForm({
          fullName: res.data.fullName,
          phone: res.data.phone || "",
          tags: (res.data.tags || []).join(", "),
          operationalNotes: res.data.operationalNotes || "",
        });
      }
    } catch (e) {
      console.error("Failed to load customer details:", e);
    } finally {
      setLoadingDetails(false);
    }
  }, [orgId]);

  // Real-time synchronization
  const { isConnected: isRealtimeLive } = useRealtimeEvents(orgId, {
    onEvent: (hint) => {
      if (
        hint.type.startsWith("customer.") ||
        hint.type.startsWith("appointment.") ||
        hint.type.startsWith("payment.") ||
        hint.type.startsWith("refund.") ||
        hint.type.startsWith("waitlist.") ||
        hint.type.startsWith("review.")
      ) {
        fetchCustomers();
        if (selectedCustomerId) {
          fetchCustomerDetails(selectedCustomerId);
        }
      }
    },
  });

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    if (selectedCustomerId) {
      fetchCustomerDetails(selectedCustomerId);
    } else {
      setCustomerDetails(null);
    }
  }, [selectedCustomerId, fetchCustomerDetails]);

  // Temporary feedback toast
  const notify = (text: string, error = false) => {
    setFeedbackMessage({ text, error });
    setTimeout(() => setFeedbackMessage(null), 4500);
  };

  // Handlers: Customer Creation
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.fullName.trim() || !createForm.email.trim()) {
      notify("Please provide customer name and email address.", true);
      return;
    }
    setActionBusy(true);
    try {
      const tagsArray = createForm.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await apiFetch<CustomerSummary>(`/organizations/${orgId}/customers`, {
        method: "POST",
        body: JSON.stringify({
          fullName: createForm.fullName.trim(),
          email: createForm.email.trim().toLowerCase(),
          phone: createForm.phone.trim() || undefined,
          tags: tagsArray,
          operationalNotes: createForm.operationalNotes.trim() || undefined,
          consentMarketing: createForm.consentMarketing,
        }),
      });

      if (res.success && res.data) {
        notify(`Customer "${res.data.fullName}" added successfully.`);
        setShowCreateModal(false);
        setCreateForm({
          fullName: "",
          email: "",
          phone: "",
          tags: "",
          operationalNotes: "",
          consentMarketing: false,
        });
        await fetchCustomers();
        setSelectedCustomerId(res.data.id);
      } else {
        notify(sanitizeErrorMessage(res.error, "Failed to create customer.").message, true);
      }
    } catch (err: any) {
      notify(sanitizeErrorMessage(err, "Failed to create customer.").message, true);
    } finally {
      setActionBusy(false);
    }
  };

  // Handlers: Customer Update
  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;
    setActionBusy(true);
    try {
      const tagsArray = editForm.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await apiFetch<CustomerSummary>(`/organizations/${orgId}/customers/${selectedCustomerId}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: editForm.fullName.trim(),
          phone: editForm.phone.trim() || null,
          tags: tagsArray,
          operationalNotes: editForm.operationalNotes.trim() || null,
        }),
      });

      if (res.success) {
        notify("Customer profile updated.");
        setShowEditModal(false);
        await fetchCustomerDetails(selectedCustomerId);
        await fetchCustomers();
      } else {
        notify(sanitizeErrorMessage(res.error, "Failed to update customer.").message, true);
      }
    } catch (err: any) {
      notify(sanitizeErrorMessage(err, "Failed to update customer.").message, true);
    } finally {
      setActionBusy(false);
    }
  };

  // Handlers: Customer Deletion
  const handleDeleteCustomer = async () => {
    if (!selectedCustomerId) return;
    setActionBusy(true);
    try {
      const res = await apiFetch(`/organizations/${orgId}/customers/${selectedCustomerId}`, {
        method: "DELETE",
      });

      if (res.success) {
        notify("Customer deleted.");
        setShowDeleteModal(false);
        setSelectedCustomerId(null);
        setCustomerDetails(null);
        await fetchCustomers();
      } else {
        notify(sanitizeErrorMessage(res.error, "Failed to delete customer.").message, true);
      }
    } catch (err: any) {
      notify(sanitizeErrorMessage(err, "Failed to delete customer.").message, true);
    } finally {
      setActionBusy(false);
    }
  };

  // Handlers: Invite Customer to Portal
  const handleInviteCustomer = async () => {
    if (!customerDetails) return;
    setActionBusy(true);
    try {
      const res = await apiFetch(`/organizations/${orgId}/customers/${customerDetails.id}/invite`, {
        method: "POST",
      });

      if (res.success) {
        notify(`A single-use portal invitation link was queued for ${customerDetails.email}.`);
        await fetchCustomerDetails(customerDetails.id);
        await fetchCustomers();
      } else {
        notify(sanitizeErrorMessage(res.error, "Could not send invitation.").message, true);
      }
    } catch (err: any) {
      notify(sanitizeErrorMessage(err, "Could not send invitation.").message, true);
    } finally {
      setActionBusy(false);
    }
  };

  // Handlers: Add Staff Note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !newNoteContent.trim()) return;

    setActionBusy(true);
    try {
      const res = await apiFetch(`/organizations/${orgId}/customers/${selectedCustomerId}/notes`, {
        method: "POST",
        body: JSON.stringify({
          content: newNoteContent.trim(),
          isInternal: true,
        }),
      });

      if (res.success) {
        setNewNoteContent("");
        notify("Confidential staff note added.");
        await fetchCustomerDetails(selectedCustomerId);
      } else {
        notify(sanitizeErrorMessage(res.error, "Failed to add note.").message, true);
      }
    } catch (err: any) {
      notify(sanitizeErrorMessage(err, "Failed to add note.").message, true);
    } finally {
      setActionBusy(false);
    }
  };

  // Handlers: Toggle Marketing Consent
  const handleToggleConsent = async () => {
    if (!customerDetails) return;
    setActionBusy(true);
    try {
      const nextVal = !customerDetails.consentMarketing;
      const res = await apiFetch(`/organizations/${orgId}/customers/${customerDetails.id}/consent`, {
        method: "PUT",
        body: JSON.stringify({
          consentMarketing: nextVal,
          source: "OWNER_PORTAL_CRM",
        }),
      });

      if (res.success) {
        notify(`Consent status changed to ${nextVal ? "Opted In" : "Transactional Only"}.`);
        await fetchCustomerDetails(customerDetails.id);
        await fetchCustomers();
      } else {
        notify(sanitizeErrorMessage(res.error, "Failed to update consent.").message, true);
      }
    } catch (err: any) {
      notify(sanitizeErrorMessage(err, "Failed to update consent.").message, true);
    } finally {
      setActionBusy(false);
    }
  };

  // Aggregated KPI numbers
  const totalCustomers = customers.length;
  const verifiedPortalMembers = customers.filter((c) => !!c.user).length;
  const portalMemberPct = totalCustomers > 0 ? Math.round((verifiedPortalMembers / totalCustomers) * 100) : 0;
  const cumulativeLtvCents = customers.reduce((sum, c) => sum + (c.totalSpentCents || 0), 0);
  const totalCompletedBookings = customers.reduce((sum, c) => sum + (c.completedAppointmentsCount || 0), 0);

  // All unique tags across directory
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    customers.forEach((c) => (c.tags || []).forEach((t) => tags.add(t)));
    return Array.from(tags);
  }, [customers]);

  return (
    <div style={{ paddingBottom: "60px" }}>
      {/* Top Header */}
      <PageHeader
        title="Customer Directory & CRM"
        description="Tenant-isolated customer profiles, verified portal member sync, chronological timeline, and lifetime financial intelligence."
        actions={
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {/* Live SSE status */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: 700,
                backgroundColor: isRealtimeLive ? "rgba(16, 185, 129, 0.12)" : "rgba(245, 158, 11, 0.12)",
                border: `1px solid ${isRealtimeLive ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
                color: isRealtimeLive ? "#34d399" : "#fbbf24",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: isRealtimeLive ? "#10b981" : "#f59e0b",
                  boxShadow: isRealtimeLive ? "0 0 8px rgba(16, 185, 129, 0.6)" : "none",
                }}
              />
              <span>{isRealtimeLive ? "Live Sync Active" : "Sync Reconnecting..."}</span>
            </div>

            <Link
              href="/app/customers/invite"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "8px",
                backgroundColor: "rgba(56, 189, 248, 0.1)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                color: "#38bdf8",
                fontSize: "13px",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              <Mail size={15} />
              <span>Invite Queue</span>
            </Link>

            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                borderRadius: "8px",
                backgroundColor: "#0284c7",
                color: "#fff",
                border: "none",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(2, 132, 199, 0.35)",
              }}
            >
              <Plus size={16} />
              <span>Add Customer</span>
            </button>
          </div>
        }
      />

      {/* Feedback Toast */}
      <MotionAlert
        isVisible={Boolean(feedbackMessage)}
        type={feedbackMessage?.error ? "error" : "success"}
      >
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "8px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            backgroundColor: feedbackMessage?.error ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
            border: `1px solid ${feedbackMessage?.error ? "rgba(239, 68, 68, 0.35)" : "rgba(16, 185, 129, 0.35)"}`,
            color: feedbackMessage?.error ? "#fca5a5" : "#6ee7b7",
            fontSize: "13.5px",
            fontWeight: 600,
          }}
        >
          {feedbackMessage?.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{feedbackMessage?.text}</span>
        </div>
      </MotionAlert>

      {/* KPI Overview Summary */}
      <AnimatedGroup
        stagger={0.06}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <SpotlightCard
          spotlightColor="rgba(56, 189, 248, 0.14)"
          style={{ padding: "18px 20px" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
              Total Customers
            </span>
            <Users size={18} color="#38bdf8" />
          </div>
          <strong style={{ fontSize: "28px", color: "#f8fafc", display: "block", marginTop: "6px", fontWeight: 850 }}>
            {totalCustomers}
          </strong>
        </SpotlightCard>

        <SpotlightCard
          spotlightColor="rgba(52, 211, 153, 0.14)"
          style={{ padding: "18px 20px" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
              Portal Verified Members
            </span>
            <ShieldCheck size={18} color="#34d399" />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "6px" }}>
            <strong style={{ fontSize: "28px", color: "#34d399", fontWeight: 850 }}>
              {verifiedPortalMembers}
            </strong>
            <span style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 600 }}>({portalMemberPct}%)</span>
          </div>
        </SpotlightCard>

        <SpotlightCard
          spotlightColor="rgba(74, 222, 128, 0.14)"
          style={{ padding: "18px 20px" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
              Cumulative Lifetime Value
            </span>
            <DollarSign size={18} color="#4ade80" />
          </div>
          <strong style={{ fontSize: "28px", color: "#4ade80", display: "block", marginTop: "6px", fontWeight: 850 }}>
            {formatCurrency(cumulativeLtvCents, orgCurrency)}
          </strong>
        </SpotlightCard>

        <SpotlightCard
          spotlightColor="rgba(167, 139, 250, 0.14)"
          style={{ padding: "18px 20px" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
              Completed Bookings
            </span>
            <Calendar size={18} color="#a78bfa" />
          </div>
          <strong style={{ fontSize: "28px", color: "#a78bfa", display: "block", marginTop: "6px", fontWeight: 850 }}>
            {totalCompletedBookings}
          </strong>
        </SpotlightCard>
      </AnimatedGroup>

      {/* Main Workspace Split Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "380px 1fr",
          gap: "20px",
          minHeight: "calc(100vh - 280px)",
          alignItems: "start",
        }}
      >
        {/* Left Column: Customer Directory */}
        <aside
          style={{
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "14px",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            maxHeight: "calc(100vh - 200px)",
          }}
        >
          {/* Search & Filter Header */}
          <div style={{ padding: "16px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <div style={{ position: "relative", marginBottom: "12px" }}>
              <Search
                size={16}
                style={{ position: "absolute", left: "12px", top: "11px", color: "#64748b" }}
              />
              <input
                type="text"
                placeholder="Search name, email, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px 9px 36px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  backgroundColor: "rgba(15, 23, 42, 0.8)",
                  color: "#f8fafc",
                  fontSize: "13.5px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "10px",
                    background: "none",
                    border: "none",
                    color: "#64748b",
                    cursor: "pointer",
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Account Type Filter Toggle */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "4px",
                backgroundColor: "rgba(11, 17, 33, 0.8)",
                padding: "3px",
                borderRadius: "8px",
                fontSize: "11.5px",
                fontWeight: 700,
              }}
            >
              <button
                onClick={() => setAccountFilter("ALL")}
                style={{
                  padding: "5px 4px",
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: accountFilter === "ALL" ? "#0284c7" : "transparent",
                  color: accountFilter === "ALL" ? "#fff" : "#94a3b8",
                  transition: "all 0.15s",
                }}
              >
                All ({totalCustomers})
              </button>
              <button
                onClick={() => setAccountFilter("PORTAL_MEMBER")}
                style={{
                  padding: "5px 4px",
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: accountFilter === "PORTAL_MEMBER" ? "#0284c7" : "transparent",
                  color: accountFilter === "PORTAL_MEMBER" ? "#fff" : "#94a3b8",
                  transition: "all 0.15s",
                }}
              >
                Verified ({verifiedPortalMembers})
              </button>
              <button
                onClick={() => setAccountFilter("GUEST")}
                style={{
                  padding: "5px 4px",
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: accountFilter === "GUEST" ? "#0284c7" : "transparent",
                  color: accountFilter === "GUEST" ? "#fff" : "#94a3b8",
                  transition: "all 0.15s",
                }}
              >
                Guests ({totalCustomers - verifiedPortalMembers})
              </button>
            </div>

            {/* Tag Chips */}
            {allTags.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  overflowX: "auto",
                  marginTop: "10px",
                  paddingBottom: "2px",
                }}
              >
                <button
                  onClick={() => setSelectedTag(null)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "12px",
                    fontSize: "11px",
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                    backgroundColor: selectedTag === null ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 255, 255, 0.05)",
                    color: selectedTag === null ? "#38bdf8" : "#94a3b8",
                  }}
                >
                  All Tags
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    style={{
                      padding: "3px 8px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: 700,
                      border: "none",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      backgroundColor: selectedTag === tag ? "#0284c7" : "rgba(255, 255, 255, 0.05)",
                      color: selectedTag === tag ? "#fff" : "#94a3b8",
                    }}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Directory Item List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {loadingList ? (
              <div style={{ padding: "40px 16px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                Loading customer records...
              </div>
            ) : customers.length === 0 ? (
              <div style={{ padding: "40px 16px", textAlign: "center", color: "#64748b" }}>
                <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#94a3b8" }}>No customers found</p>
                <p style={{ margin: 0, fontSize: "12.5px" }}>Try adjusting your search criteria or add a customer.</p>
              </div>
            ) : (
              <AnimatedGroup stagger={0.03} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {customers.map((c) => {
                  const isSelected = selectedCustomerId === c.id;
                  const initials = c.fullName
                    .split(" ")
                    .map((w) => w[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase() || "C";

                  return (
                    <motion.div
                      key={c.id}
                      onClick={() => setSelectedCustomerId(c.id)}
                      whileHover={{ scale: 1.01, x: 2 }}
                      whileTap={{ scale: 0.99 }}
                      transition={{ type: "spring", stiffness: 450, damping: 30 }}
                      style={{
                        padding: "14px",
                        borderRadius: "10px",
                        cursor: "pointer",
                        backgroundColor: isSelected ? "rgba(2, 132, 199, 0.15)" : "rgba(255, 255, 255, 0.02)",
                        border: isSelected ? "1px solid #0284c7" : "1px solid rgba(255, 255, 255, 0.06)",
                        boxShadow: isSelected ? "0 4px 16px rgba(2, 132, 199, 0.18)" : "none",
                        transition: "background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                        {/* Avatar */}
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "50%",
                            backgroundColor: isSelected ? "#0284c7" : "rgba(56, 189, 248, 0.15)",
                            color: isSelected ? "#fff" : "#38bdf8",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 800,
                            fontSize: "13px",
                            flexShrink: 0,
                          }}
                        >
                          {initials}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ fontWeight: 700, fontSize: "14.5px", color: isSelected ? "#38bdf8" : "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {c.fullName}
                            </div>
                            <span style={{ fontWeight: 800, fontSize: "13.5px", color: "#4ade80", flexShrink: 0, marginLeft: "8px" }}>
                              {formatCurrency(c.totalSpentCents, c.currency || orgCurrency)}
                            </span>
                          </div>

                          <div style={{ fontSize: "12px", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "2px" }}>
                            {c.email}
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px" }}>
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
                              {c.user ? (
                                <span
                                  style={{
                                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                                    color: "#34d399",
                                    fontSize: "10px",
                                    fontWeight: 800,
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    border: "1px solid rgba(16, 185, 129, 0.3)",
                                  }}
                                >
                                  ✓ Portal Member
                                </span>
                              ) : c.pendingInvitation ? (
                                <span
                                  style={{
                                    backgroundColor: "rgba(245, 158, 11, 0.15)",
                                    color: "#fbbf24",
                                    fontSize: "10px",
                                    fontWeight: 800,
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    border: "1px solid rgba(245, 158, 11, 0.3)",
                                  }}
                                >
                                  Invite Pending
                                </span>
                              ) : (
                                <span
                                  style={{
                                    backgroundColor: "rgba(148, 163, 184, 0.1)",
                                    color: "#94a3b8",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                  }}
                                >
                                  Guest
                                </span>
                              )}

                              {c.tags.slice(0, 1).map((t) => (
                                <span
                                  key={t}
                                  style={{
                                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                                    color: "#cbd5e1",
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                  }}
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>

                            <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600 }}>
                              {c.completedAppointmentsCount} bookings
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatedGroup>
            )}
          </div>
        </aside>

        {/* Right Column: Customer Intelligence Workspace */}
        <main style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {loadingDetails && !customerDetails ? (
            <GlassCard variant="card" style={{ padding: "60px 24px", textAlign: "center", color: "#94a3b8" }}>
              Loading comprehensive customer intelligence...
            </GlassCard>
          ) : !customerDetails ? (
            <GlassCard variant="card" style={{ padding: "60px 24px", textAlign: "center", color: "#94a3b8" }}>
              <Users size={32} style={{ margin: "0 auto 12px", color: "#64748b" }} />
              <p style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
                No Customer Selected
              </p>
              <p style={{ margin: 0, fontSize: "13px" }}>
                Select a client from the left directory to review their profile, bookings, staff notes, and timeline.
              </p>
            </GlassCard>
          ) : (
            <>
              {/* Customer Profile Card */}
              <GlassCard variant="card" glow="subtle" style={{ padding: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <h2 style={{ fontSize: "24px", fontWeight: 850, margin: 0, color: "#f8fafc" }}>
                        {customerDetails.fullName}
                      </h2>

                      {customerDetails.user ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            backgroundColor: "rgba(16, 185, 129, 0.15)",
                            color: "#34d399",
                            fontSize: "11.5px",
                            fontWeight: 800,
                            padding: "3px 10px",
                            borderRadius: "9999px",
                            border: "1px solid rgba(16, 185, 129, 0.3)",
                          }}
                        >
                          <ShieldCheck size={14} />
                          <span>Verified Portal Member</span>
                        </span>
                      ) : customerDetails.pendingInvitation ? (
                        <span
                          style={{
                            backgroundColor: "rgba(245, 158, 11, 0.15)",
                            color: "#fbbf24",
                            fontSize: "11.5px",
                            fontWeight: 800,
                            padding: "3px 10px",
                            borderRadius: "9999px",
                            border: "1px solid rgba(245, 158, 11, 0.3)",
                          }}
                        >
                          Invitation Pending
                        </span>
                      ) : (
                        <span
                          style={{
                            backgroundColor: "rgba(148, 163, 184, 0.15)",
                            color: "#94a3b8",
                            fontSize: "11.5px",
                            fontWeight: 700,
                            padding: "3px 10px",
                            borderRadius: "9999px",
                          }}
                        >
                          Guest Account
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: "16px", marginTop: "8px", fontSize: "13.5px", color: "#94a3b8", flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                        <Mail size={14} /> {customerDetails.email}
                      </span>
                      {customerDetails.phone && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                          <Phone size={14} /> {customerDetails.phone}
                        </span>
                      )}
                      <span>Created {new Date(customerDetails.createdAt).toLocaleDateString()}</span>
                    </div>

                    {/* Tags List */}
                    <div style={{ display: "flex", gap: "6px", marginTop: "12px", flexWrap: "wrap", alignItems: "center" }}>
                      {customerDetails.tags?.map((t) => (
                        <span
                          key={t}
                          style={{
                            backgroundColor: "rgba(56, 189, 248, 0.12)",
                            border: "1px solid rgba(56, 189, 248, 0.3)",
                            color: "#38bdf8",
                            fontSize: "11px",
                            padding: "3px 9px",
                            borderRadius: "6px",
                            fontWeight: 700,
                          }}
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* LTV & Action Toolbar */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px" }}>
                    <div style={{ textAlign: "right", backgroundColor: "rgba(15, 23, 42, 0.8)", padding: "12px 20px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                      <div style={{ fontSize: "24px", fontWeight: 900, color: "#4ade80" }}>
                        {formatCurrency(customerDetails.totalSpentCents, customerDetails.currency || orgCurrency)}
                      </div>
                      <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
                        Lifetime Value (LTV)
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => setShowEditModal(true)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          backgroundColor: "rgba(255, 255, 255, 0.05)",
                          color: "#f8fafc",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <Edit2 size={13} />
                        <span>Edit</span>
                      </button>

                      {!customerDetails.user && (
                        <button
                          onClick={handleInviteCustomer}
                          disabled={actionBusy}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            border: "1px solid rgba(56, 189, 248, 0.35)",
                            backgroundColor: "rgba(56, 189, 248, 0.12)",
                            color: "#38bdf8",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          <Send size={13} />
                          <span>{customerDetails.pendingInvitation ? "Resend Invite" : "Invite to Portal"}</span>
                        </button>
                      )}

                      <button
                        onClick={() => setShowDeleteModal(true)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          backgroundColor: "rgba(239, 68, 68, 0.1)",
                          color: "#f87171",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Metrics Sub-strip */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: "12px",
                    marginTop: "20px",
                    paddingTop: "16px",
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <div style={{ backgroundColor: "rgba(11, 17, 33, 0.7)", padding: "12px 14px", borderRadius: "8px" }}>
                    <div style={{ fontSize: "11.5px", color: "#94a3b8", fontWeight: 700 }}>Completed</div>
                    <div style={{ fontSize: "18px", fontWeight: 800, color: "#f8fafc", marginTop: "2px" }}>
                      {customerDetails.completedAppointmentsCount}
                    </div>
                  </div>

                  <div style={{ backgroundColor: "rgba(11, 17, 33, 0.7)", padding: "12px 14px", borderRadius: "8px" }}>
                    <div style={{ fontSize: "11.5px", color: "#94a3b8", fontWeight: 700 }}>Cancelled</div>
                    <div style={{ fontSize: "18px", fontWeight: 800, color: "#f87171", marginTop: "2px" }}>
                      {customerDetails.cancelledCount}
                    </div>
                  </div>

                  <div style={{ backgroundColor: "rgba(11, 17, 33, 0.7)", padding: "12px 14px", borderRadius: "8px" }}>
                    <div style={{ fontSize: "11.5px", color: "#94a3b8", fontWeight: 700 }}>No-Shows</div>
                    <div style={{ fontSize: "18px", fontWeight: 800, color: "#fbbf24", marginTop: "2px" }}>
                      {customerDetails.noShowCount}
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: "rgba(11, 17, 33, 0.7)",
                      padding: "12px 14px",
                      borderRadius: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "11.5px", color: "#94a3b8", fontWeight: 700 }}>Marketing</div>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: 800,
                          color: customerDetails.consentMarketing ? "#34d399" : "#94a3b8",
                          marginTop: "2px",
                        }}
                      >
                        {customerDetails.consentMarketing ? "Opted In" : "Transactional"}
                      </div>
                    </div>
                    <button
                      onClick={handleToggleConsent}
                      disabled={actionBusy}
                      style={{
                        padding: "4px 8px",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        borderRadius: "4px",
                        border: "1px solid rgba(56, 189, 248, 0.3)",
                        backgroundColor: "rgba(56, 189, 248, 0.1)",
                        color: "#38bdf8",
                        cursor: "pointer",
                      }}
                    >
                      Toggle
                    </button>
                  </div>
                </div>

                {/* Operational Preferences Banner */}
                {customerDetails.operationalNotes && (
                  <div
                    style={{
                      marginTop: "16px",
                      backgroundColor: "rgba(56, 189, 248, 0.08)",
                      borderLeft: "3px solid #38bdf8",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      color: "#e2e8f0",
                    }}
                  >
                    <strong style={{ color: "#38bdf8" }}>Operational Preferences: </strong>
                    {customerDetails.operationalNotes.length > 140 && !operationalNotesExpanded ? (
                      <>
                        {customerDetails.operationalNotes.slice(0, 140)}…{" "}
                        <button
                          type="button"
                          onClick={() => setOperationalNotesExpanded(true)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#38bdf8",
                            fontWeight: 700,
                            cursor: "pointer",
                            fontSize: "12px",
                            padding: "0 4px",
                          }}
                        >
                          See more
                        </button>
                      </>
                    ) : (
                      <>
                        {customerDetails.operationalNotes}
                        {customerDetails.operationalNotes.length > 140 && (
                          <button
                            type="button"
                            onClick={() => setOperationalNotesExpanded(false)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#38bdf8",
                              fontWeight: 700,
                              cursor: "pointer",
                              fontSize: "12px",
                              marginLeft: "6px",
                            }}
                          >
                            Show less
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </GlassCard>

              {/* Workspace Navigation Tabs */}
              <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "8px", position: "relative" }}>
                {[
                  { id: "timeline" as const, label: `⏱ Timeline (${customerDetails.timeline?.length || 0})` },
                  { id: "appointments" as const, label: `📅 Bookings & Services (${customerDetails.appointments?.length || 0})` },
                  { id: "notes" as const, label: `🔒 Staff Notes (${customerDetails.notes?.length || 0})` },
                  { id: "waitlist_reviews" as const, label: `⭐ Waitlist & Reviews (${(customerDetails.waitlistEntries?.length || 0) + (customerDetails.reviews?.length || 0)})` },
                ].map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        position: "relative",
                        padding: "8px 16px",
                        borderRadius: "8px",
                        fontWeight: 700,
                        fontSize: "13.5px",
                        border: "none",
                        cursor: "pointer",
                        backgroundColor: "transparent",
                        color: isActive ? "#fff" : "#94a3b8",
                        transition: "color 0.15s ease",
                      }}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="customer-active-tab-indicator"
                          transition={{ type: "spring", stiffness: 450, damping: 35 }}
                          style={{
                            position: "absolute",
                            inset: 0,
                            backgroundColor: "#0284c7",
                            borderRadius: "8px",
                            zIndex: 0,
                          }}
                        />
                      )}
                      <span style={{ position: "relative", zIndex: 1 }}>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab 1: Chronological Timeline */}
              {activeTab === "timeline" && (
                <GlassCard variant="card" style={{ padding: "24px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 20px 0", color: "#f8fafc" }}>
                    Interaction & Transaction Ledger
                  </h3>

                  {(!customerDetails.timeline || customerDetails.timeline.length === 0) ? (
                    <p style={{ color: "#64748b", margin: 0, fontSize: "13.5px" }}>No timeline events recorded yet.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px", position: "relative", paddingLeft: "24px" }}>
                      <div style={{ position: "absolute", left: "7px", top: "8px", bottom: "8px", width: "2px", backgroundColor: "rgba(255, 255, 255, 0.08)" }} />

                      {(timelineShowAll ? customerDetails.timeline : customerDetails.timeline.slice(0, 6)).map((evt) => {
                        let dotColor = "#38bdf8";
                        if (evt.type === "PAYMENT_SUCCEEDED") dotColor = "#4ade80";
                        if (evt.type === "REFUND_ISSUED") dotColor = "#fb923c";
                        if (evt.type === "CANCELLED") dotColor = "#f43f5e";
                        if (evt.type === "NOTE_ADDED") dotColor = "#f59e0b";
                        if (evt.type === "COMPLETED") dotColor = "#10b981";
                        if (evt.type === "WAITLIST_JOINED") dotColor = "#818cf8";
                        if (evt.type === "REVIEW_LEFT") dotColor = "#facc15";
                        if (evt.type === "PORTAL_JOINED") dotColor = "#06b6d4";

                        return (
                          <div key={evt.id} style={{ position: "relative" }}>
                            <div
                              style={{
                                position: "absolute",
                                left: "-21px",
                                top: "5px",
                                width: "10px",
                                height: "10px",
                                borderRadius: "50%",
                                backgroundColor: dotColor,
                                border: "2px solid #0f172a",
                              }}
                            />
                            <div
                              style={{
                                backgroundColor: "rgba(15, 23, 42, 0.7)",
                                borderRadius: "8px",
                                padding: "12px 16px",
                                border: "1px solid rgba(255, 255, 255, 0.06)",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ fontWeight: 700, fontSize: "14px", color: "#f8fafc" }}>
                                  {evt.title}
                                </div>
                                <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                                  {new Date(evt.timestamp).toLocaleString()}
                                </div>
                              </div>
                              {evt.description && (
                                <div style={{ fontSize: "13px", color: "#cbd5e1", marginTop: "4px" }}>
                                  {evt.description}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {customerDetails.timeline.length > 6 && (
                        <div style={{ display: "flex", justifyContent: "center", marginTop: "8px" }}>
                          <button
                            type="button"
                            onClick={() => setTimelineShowAll((prev) => !prev)}
                            style={{
                              padding: "6px 14px",
                              borderRadius: "6px",
                              backgroundColor: "rgba(56, 189, 248, 0.08)",
                              border: "1px solid rgba(56, 189, 248, 0.25)",
                              color: "#38bdf8",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {timelineShowAll
                              ? `Show fewer events (top 6 of ${customerDetails.timeline.length})`
                              : `Showing 6 of ${customerDetails.timeline.length} events · Show all (${customerDetails.timeline.length - 6} more)`}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </GlassCard>
              )}

              {/* Tab 2: Bookings & Services */}
              {activeTab === "appointments" && (
                <GlassCard variant="card" style={{ padding: "24px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 20px 0", color: "#f8fafc" }}>
                    Service Bookings History
                  </h3>

                  {(!customerDetails.appointments || customerDetails.appointments.length === 0) ? (
                    <p style={{ color: "#64748b", margin: 0, fontSize: "13.5px" }}>No bookings on file for this customer.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {(apptsShowAll ? customerDetails.appointments : customerDetails.appointments.slice(0, 5)).map((appt: any) => (
                        <div
                          key={appt.id}
                          style={{
                            backgroundColor: "rgba(15, 23, 42, 0.7)",
                            padding: "16px 20px",
                            borderRadius: "10px",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "12px",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "15px", color: "#f8fafc" }}>
                              {appt.service?.name || "Service Appointment"}
                            </div>
                            <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "4px" }}>
                              📅 {new Date(appt.startAt).toLocaleString()} • Staff: {appt.staff?.displayName || "Unassigned"}
                              {appt.location?.name ? ` • Location: ${appt.location.name}` : ""}
                            </div>
                            <div style={{ display: "flex", gap: "8px", marginTop: "8px", alignItems: "center" }}>
                              <span
                                style={{
                                  backgroundColor: appt.status === "CONFIRMED" ? "rgba(16, 185, 129, 0.15)" : appt.status === "COMPLETED" ? "rgba(56, 189, 248, 0.15)" : "rgba(239, 68, 68, 0.15)",
                                  color: appt.status === "CONFIRMED" ? "#34d399" : appt.status === "COMPLETED" ? "#38bdf8" : "#f87171",
                                  fontSize: "11px",
                                  padding: "3px 8px",
                                  borderRadius: "4px",
                                  fontWeight: 800,
                                }}
                              >
                                {appt.status}
                              </span>
                              <span
                                style={{
                                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                                  color: "#4ade80",
                                  fontSize: "11px",
                                  padding: "3px 8px",
                                  borderRadius: "4px",
                                  fontWeight: 800,
                                }}
                              >
                                {formatCurrency(appt.priceCents, appt.currency || orgCurrency)}
                              </span>
                            </div>
                          </div>

                          {appt.status === "CONFIRMED" && (
                            <button
                              onClick={() => {
                                setCancelAppointmentId(appt.id);
                                setCancelDrawerOpen(true);
                              }}
                              style={{
                                padding: "8px 16px",
                                backgroundColor: "rgba(239, 68, 68, 0.2)",
                                border: "1px solid rgba(239, 68, 68, 0.4)",
                                color: "#f87171",
                                borderRadius: "6px",
                                fontSize: "12.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Cancel Booking
                            </button>
                          )}
                        </div>
                      ))}

                      {customerDetails.appointments.length > 5 && (
                        <div style={{ display: "flex", justifyContent: "center", marginTop: "8px" }}>
                          <button
                            type="button"
                            onClick={() => setApptsShowAll((prev) => !prev)}
                            style={{
                              padding: "6px 14px",
                              borderRadius: "6px",
                              backgroundColor: "rgba(56, 189, 248, 0.08)",
                              border: "1px solid rgba(56, 189, 248, 0.25)",
                              color: "#38bdf8",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {apptsShowAll
                              ? `Show fewer bookings (top 5 of ${customerDetails.appointments.length})`
                              : `Showing 5 of ${customerDetails.appointments.length} bookings · Show all (${customerDetails.appointments.length - 5} more)`}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </GlassCard>
              )}

              {/* Tab 3: Confidential Staff Notes */}
              {activeTab === "notes" && (
                <GlassCard variant="card" style={{ padding: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <div>
                      <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#f8fafc" }}>
                        Confidential Staff Notes
                      </h3>
                      <p style={{ color: "#94a3b8", fontSize: "12.5px", margin: "3px 0 0 0" }}>
                        Internal clinical and operational observations. Protected and excluded from AI context.
                      </p>
                    </div>
                    <span
                      style={{
                        backgroundColor: "rgba(245, 158, 11, 0.15)",
                        border: "1px solid rgba(245, 158, 11, 0.35)",
                        color: "#fbbf24",
                        padding: "3px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: 800,
                      }}
                    >
                      🛡️ AI-Sanitized Privacy
                    </span>
                  </div>

                  <form onSubmit={handleAddNote} style={{ display: "flex", gap: "10px", marginBottom: "24px" }}>
                    <input
                      type="text"
                      placeholder="Add staff note (e.g. client sensitivities, formula, preferences)..."
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        backgroundColor: "rgba(15, 23, 42, 0.8)",
                        color: "#fff",
                        fontSize: "13.5px",
                        outline: "none",
                      }}
                    />
                    <button
                      type="submit"
                      disabled={actionBusy || !newNoteContent.trim()}
                      style={{
                        padding: "10px 20px",
                        backgroundColor: "#0284c7",
                        color: "#fff",
                        border: "none",
                        borderRadius: "8px",
                        fontWeight: 700,
                        fontSize: "13.5px",
                        cursor: "pointer",
                      }}
                    >
                      Post Note
                    </button>
                  </form>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {(!customerDetails.notes || customerDetails.notes.length === 0) ? (
                      <p style={{ color: "#64748b", margin: 0, fontSize: "13.5px" }}>No internal notes posted yet.</p>
                    ) : (
                      <>
                        {(notesShowAll ? customerDetails.notes : customerDetails.notes.slice(0, 5)).map((n) => (
                          <div
                            key={n.id}
                            style={{
                              backgroundColor: "rgba(15, 23, 42, 0.7)",
                              padding: "14px 18px",
                              borderRadius: "8px",
                              borderLeft: "4px solid #f59e0b",
                              border: "1px solid rgba(255, 255, 255, 0.06)",
                              borderLeftColor: "#f59e0b",
                            }}
                          >
                            <div style={{ fontSize: "14px", color: "#f8fafc", lineHeight: 1.5, wordBreak: "break-word" }}>
                              {n.content}
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "11px", color: "#94a3b8" }}>
                              <span>Author: {n.authorName || (n.authorId === user?.userId ? "You" : "Team member")}</span>
                              <span>{new Date(n.createdAt).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                        {customerDetails.notes.length > 5 && (
                          <button
                            type="button"
                            onClick={() => setNotesShowAll(!notesShowAll)}
                            style={{
                              alignSelf: "center",
                              marginTop: "8px",
                              padding: "6px 14px",
                              backgroundColor: "rgba(255, 255, 255, 0.04)",
                              border: "1px solid rgba(255, 255, 255, 0.12)",
                              borderRadius: "6px",
                              color: "#38bdf8",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              transition: "all 0.15s ease",
                            }}
                          >
                            {notesShowAll
                              ? "Show fewer notes"
                              : `Showing 5 of ${customerDetails.notes.length} notes · See all`}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </GlassCard>
              )}

              {/* Tab 4: Waitlist & Reviews */}
              {activeTab === "waitlist_reviews" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  {/* Waitlist Section */}
                  <GlassCard variant="card" style={{ padding: "24px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 16px 0", color: "#f8fafc" }}>
                      Active Waitlist Requests
                    </h3>
                    {(!customerDetails.waitlistEntries || customerDetails.waitlistEntries.length === 0) ? (
                      <p style={{ color: "#64748b", margin: 0, fontSize: "13.5px" }}>Not currently on any waitlists.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {customerDetails.waitlistEntries.map((w: any) => (
                          <div
                            key={w.id}
                            style={{
                              backgroundColor: "rgba(15, 23, 42, 0.7)",
                              padding: "14px",
                              borderRadius: "8px",
                              border: "1px solid rgba(255, 255, 255, 0.08)",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700, color: "#f8fafc" }}>
                                {w.service?.name || "Service Waitlist"}
                              </div>
                              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                                Desired Window: {new Date(w.startWindowDate).toLocaleDateString()} – {new Date(w.endWindowDate).toLocaleDateString()} • Preference: {w.timePreference || "ANY"}
                              </div>
                            </div>
                            <span
                              style={{
                                backgroundColor: "rgba(129, 140, 248, 0.15)",
                                color: "#818cf8",
                                fontSize: "11px",
                                fontWeight: 800,
                                padding: "3px 8px",
                                borderRadius: "4px",
                              }}
                            >
                              {w.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </GlassCard>

                  {/* Reviews Section */}
                  <GlassCard variant="card" style={{ padding: "24px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 16px 0", color: "#f8fafc" }}>
                      Customer Ratings & Feedback
                    </h3>
                    {(!customerDetails.reviews || customerDetails.reviews.length === 0) ? (
                      <p style={{ color: "#64748b", margin: 0, fontSize: "13.5px" }}>No reviews submitted yet.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {customerDetails.reviews.map((r: any) => (
                          <div
                            key={r.id}
                            style={{
                              backgroundColor: "rgba(15, 23, 42, 0.7)",
                              padding: "14px",
                              borderRadius: "8px",
                              border: "1px solid rgba(255, 255, 255, 0.08)",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#facc15" }}>
                                {Array.from({ length: r.rating || 5 }).map((_, i) => (
                                  <Star key={i} size={14} fill="#facc15" />
                                ))}
                                <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: "13px", marginLeft: "6px" }}>
                                  {r.service?.name || "Service"}
                                </span>
                              </div>
                              <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                                {new Date(r.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            {r.comment && (
                              <div style={{ fontSize: "13px", color: "#cbd5e1", marginTop: "6px" }}>
                                "{r.comment}"
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </GlassCard>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Modal: Add Customer */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(6px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "20px",
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              style={{
                backgroundColor: "#0f172a",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "14px",
                padding: "28px",
                maxWidth: "520px",
                width: "100%",
                boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#f8fafc" }}>
                  Add New Customer
                </h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreateCustomer} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Eleanor Vance"
                    value={createForm.fullName}
                    onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      color: "#fff",
                      fontSize: "13.5px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="client@example.com"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      color: "#fff",
                      fontSize: "13.5px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+1 (555) 012-3456"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      color: "#fff",
                      fontSize: "13.5px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Tags (comma separated)
                  </label>
                  <input
                    type="text"
                    placeholder="VIP, Regular, Referral"
                    value={createForm.tags}
                    onChange={(e) => setCreateForm({ ...createForm, tags: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      color: "#fff",
                      fontSize: "13.5px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Operational Preferences / Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Allergies, preferred staff, seating choices..."
                    value={createForm.operationalNotes}
                    onChange={(e) => setCreateForm({ ...createForm, operationalNotes: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      color: "#fff",
                      fontSize: "13.5px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    id="consentMarketingCheck"
                    checked={createForm.consentMarketing}
                    onChange={(e) => setCreateForm({ ...createForm, consentMarketing: e.target.checked })}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <label htmlFor="consentMarketingCheck" style={{ fontSize: "13px", color: "#cbd5e1", cursor: "pointer" }}>
                    Customer consented to promotional marketing emails
                  </label>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      backgroundColor: "transparent",
                      color: "#cbd5e1",
                      fontSize: "13.5px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionBusy}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "8px",
                      border: "none",
                      backgroundColor: "#0284c7",
                      color: "#fff",
                      fontSize: "13.5px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {actionBusy ? "Saving..." : "Create Customer"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Edit Customer */}
      <AnimatePresence>
        {showEditModal && customerDetails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(6px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "20px",
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              style={{
                backgroundColor: "#0f172a",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "14px",
                padding: "28px",
                maxWidth: "500px",
                width: "100%",
                boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#f8fafc" }}>
                  Edit Customer Profile
                </h3>
                <button
                  onClick={() => setShowEditModal(false)}
                  style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleUpdateCustomer} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.fullName}
                    onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      color: "#fff",
                      fontSize: "13.5px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      color: "#fff",
                      fontSize: "13.5px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Tags (comma separated)
                  </label>
                  <input
                    type="text"
                    value={editForm.tags}
                    onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      color: "#fff",
                      fontSize: "13.5px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Operational Preferences
                  </label>
                  <textarea
                    rows={3}
                    value={editForm.operationalNotes}
                    onChange={(e) => setEditForm({ ...editForm, operationalNotes: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      color: "#fff",
                      fontSize: "13.5px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      backgroundColor: "transparent",
                      color: "#cbd5e1",
                      fontSize: "13.5px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionBusy}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "8px",
                      border: "none",
                      backgroundColor: "#0284c7",
                      color: "#fff",
                      fontSize: "13.5px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {actionBusy ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Delete Customer Confirmation */}
      <AnimatePresence>
        {showDeleteModal && customerDetails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(6px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "20px",
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              style={{
                backgroundColor: "#0f172a",
                border: "1px solid rgba(239, 68, 68, 0.35)",
                borderRadius: "14px",
                padding: "28px",
                maxWidth: "460px",
                width: "100%",
                boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "16px" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(239, 68, 68, 0.15)",
                    color: "#f87171",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#f8fafc" }}>
                    Delete Customer
                  </h3>
                  <p style={{ margin: "6px 0 0 0", color: "#94a3b8", fontSize: "13px", lineHeight: 1.5 }}>
                    Are you sure you want to delete <strong style={{ color: "#f8fafc" }}>{customerDetails.fullName}</strong> ({customerDetails.email})?
                    This will remove their profile and notes. Active future bookings must be completed or cancelled before deleting.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  style={{
                    padding: "9px 16px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    backgroundColor: "transparent",
                    color: "#cbd5e1",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCustomer}
                  disabled={actionBusy}
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#e11d48",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {actionBusy ? "Deleting..." : "Confirm Delete"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cancellation Drawer Component */}
      {cancelAppointmentId && (
        <CancellationDrawer
          isOpen={cancelDrawerOpen}
          onClose={() => setCancelDrawerOpen(false)}
          appointmentId={cancelAppointmentId}
          organizationId={orgId}
          onCancelled={() => {
            if (selectedCustomerId) fetchCustomerDetails(selectedCustomerId);
            fetchCustomers();
            notify("Appointment cancelled successfully.");
          }}
        />
      )}
    </div>
  );
}
