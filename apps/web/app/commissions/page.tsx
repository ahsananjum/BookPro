/* Hallmark · macrostructure: Financial Operations & Commissions Hub · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 */
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { ProtectedRoute } from "../../components/protected-route";
import { useAuth } from "../../lib/auth-context";
import { useRealtimeEvents } from "../../lib/use-realtime-events";
import { apiFetch } from "../../lib/api-client";
import { formatCurrency } from "../../lib/currency-utils";
import { GlassCard, GlassBadge } from "../../components/glass-card";
import {
  CircleDollarSign,
  DollarSign,
  CreditCard,
  Receipt,
  Search,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Trash2,
  Sparkles,
  User,
  ArrowUpRight,
  ArrowDownRight,
  X,
  Printer,
  Calendar,
} from "../../components/icons";

interface PaymentItem {
  id: string;
  providerPaymentId: string;
  amountCents: number;
  currency: string;
  convertedAmountCents?: number;
  convertedCurrency?: string;
  totalRefundedConvertedCents?: number;
  metadata?: any;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "PARTIALLY_REFUNDED" | "REFUNDED" | "REQUIRES_RECONCILIATION";
  createdAt: string;
  appointment?: {
    id: string;
    startAt: string;
    priceCents: number;
    currency?: string;
    service?: { name: string; durationMin: number };
    staff?: { displayName: string };
    customer?: { id: string; fullName: string; email: string; phone?: string | null };
  } | null;
  bookingHold?: {
    id: string;
    guestName?: string | null;
    guestEmail?: string | null;
    customer?: { id: string; fullName: string; email: string } | null;
  } | null;
  refunds?: Array<{
    id: string;
    amountCents: number;
    currency: string;
    convertedAmountCents?: number;
    convertedCurrency?: string;
    status: string;
    reason?: string | null;
    createdAt: string;
  }>;
}

interface CommissionRecord {
  id: string;
  calculatedAmountCents: number;
  currency: string;
  convertedAmountCents?: number;
  convertedPriceSnapshotCents?: number;
  convertedCurrency?: string;
  calculationBasisSnapshot: "NET_SERVICE_PRICE" | "GROSS_SERVICE_PRICE" | "TOTAL_APPOINTMENT_PRICE";
  rateValueSnapshot: number;
  ruleVersionSnapshot: number;
  priceSnapshotCents: number;
  status: "PENDING" | "APPROVED" | "PAID" | "CLAWED_BACK";
  createdAt: string;
  staff?: {
    id: string;
    displayName: string;
    title?: string | null;
  } | null;
  appointment?: {
    id: string;
    startAt: string;
    service?: { name: string };
    customer?: { fullName: string; email: string };
    paymentRecords?: Array<{
      amountCents: number;
      status: string;
      refunds?: Array<{ amountCents: number; status: string }>;
    }>;
  } | null;
}

interface CommissionRule {
  id: string;
  name: string;
  calculationType: "PERCENTAGE" | "FIXED_AMOUNT";
  rateValue: number;
  calculationBasis: "NET_SERVICE_PRICE" | "GROSS_SERVICE_PRICE" | "TOTAL_APPOINTMENT_PRICE";
  ruleVersion: number;
  isActive: boolean;
  staffId?: string | null;
  staff?: {
    id: string;
    displayName: string;
    title?: string | null;
  } | null;
}

interface PaymentsSummary {
  currency: string;
  grossRevenueCents: number;
  totalRefundsCents: number;
  netRevenueCents: number;
  totalPaymentsCount: number;
  successfulPaymentsCount: number;
  pendingPaymentsCount: number;
  failedPaymentsCount: number;
  refundedPaymentsCount: number;
  stripeConnect?: {
    connected: boolean;
    accountId?: string | null;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
  };
}

interface CommissionsSummary {
  currency?: string;
  totalAccruedCents: number;
  totalApprovedCents: number;
  totalPaidCents: number;
  totalClawedBackCents: number;
  pendingCount: number;
  activeRulesCount: number;
  totalRecordsCount: number;
}

interface StaffOption {
  id: string;
  displayName: string;
  title?: string | null;
}

export default function CommissionsPage() {
  return (
    <ProtectedRoute>
      <FinancialOperationsContent />
    </ProtectedRoute>
  );
}

function FinancialOperationsContent() {
  const { user } = useAuth();
  const orgId = user?.organizationId || "";
  const orgCurrency = user?.currency || "USD";

  // Tab State
  const [activeTab, setActiveTab] = useState<"payments" | "commissions" | "rules">("payments");

  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Data States
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [paymentsSummary, setPaymentsSummary] = useState<PaymentsSummary | null>(null);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [commissionsSummary, setCommissionsSummary] = useState<CommissionsSummary | null>(null);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);

  // Filters
  const [paymentFilterStatus, setPaymentFilterStatus] = useState<string>("ALL");
  const [paymentSearch, setPaymentSearch] = useState<string>("");
  const [commissionFilterStatus, setCommissionFilterStatus] = useState<string>("ALL");
  const [commissionStaffFilter, setCommissionStaffFilter] = useState<string>("ALL");

  // Modals
  const [selectedRefundPayment, setSelectedRefundPayment] = useState<PaymentItem | null>(null);
  const [refundType, setRefundType] = useState<"FULL" | "PARTIAL">("FULL");
  const [refundAmountDollars, setRefundAmountDollars] = useState<string>("");
  const [refundReason, setRefundReason] = useState<string>("");
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);

  const [showRuleModal, setShowRuleModal] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [ruleStaffId, setRuleStaffId] = useState<string>("");
  const [ruleCalcType, setRuleCalcType] = useState<"PERCENTAGE" | "FIXED_AMOUNT">("PERCENTAGE");
  const [ruleRateInput, setRuleRateInput] = useState<string>("20");
  const [ruleCalcBasis, setRuleCalcBasis] = useState<"NET_SERVICE_PRICE" | "GROSS_SERVICE_PRICE" | "TOTAL_APPOINTMENT_PRICE">("NET_SERVICE_PRICE");
  const [isSubmittingRule, setIsSubmittingRule] = useState(false);

  const [invoiceModalData, setInvoiceModalData] = useState<{
    payment: PaymentItem;
    orgName: string;
  } | null>(null);

  // Real-time live synchronization
  useRealtimeEvents(orgId, {
    onEvent: (hint) => {
      if (
        hint.type.startsWith("payment.") ||
        hint.type.startsWith("refund.") ||
        hint.type.startsWith("commission.") ||
        hint.type.startsWith("appointment.")
      ) {
        fetchAllData(false);
      }
    },
  });

  const fetchAllData = useCallback(async (showFullLoader = true) => {
    if (!orgId) return;
    if (showFullLoader) setLoading(true);
    setIsRefreshing(true);

    try {
      const [
        paymentsRes,
        paymentsSummaryRes,
        commissionsRes,
        commissionsSummaryRes,
        rulesRes,
        staffRes,
      ] = await Promise.all([
        apiFetch<{ items: PaymentItem[]; total: number }>(
          `/organizations/${orgId}/payments?limit=100`,
          {},
          orgId
        ),
        apiFetch<PaymentsSummary>(`/organizations/${orgId}/payments/summary`, {}, orgId),
        apiFetch<CommissionRecord[]>(`/organizations/${orgId}/commissions`, {}, orgId),
        apiFetch<CommissionsSummary>(`/organizations/${orgId}/commissions/summary`, {}, orgId),
        apiFetch<CommissionRule[]>(`/organizations/${orgId}/commissions/rules`, {}, orgId),
        apiFetch<any[]>(`/organizations/${orgId}/staff`, {}, orgId),
      ]);

      if (paymentsRes.success && paymentsRes.data) {
        const raw = paymentsRes.data;
        setPayments(Array.isArray(raw) ? raw : raw.items || []);
      }
      if (paymentsSummaryRes.success && paymentsSummaryRes.data) {
        setPaymentsSummary(paymentsSummaryRes.data);
      }
      if (commissionsRes.success && commissionsRes.data) {
        const rawCommissions = commissionsRes.data as any;
        setCommissions(
          Array.isArray(rawCommissions)
            ? rawCommissions
            : rawCommissions?.entries || rawCommissions?.items || rawCommissions?.records || []
        );
      }
      if (commissionsSummaryRes.success && commissionsSummaryRes.data) {
        setCommissionsSummary(commissionsSummaryRes.data);
      }
      if (rulesRes.success && rulesRes.data) {
        setRules(Array.isArray(rulesRes.data) ? rulesRes.data : []);
      }
      if (staffRes.success && staffRes.data) {
        setStaffList(
          (staffRes.data || []).map((s: any) => ({
            id: s.id,
            displayName: s.displayName || s.name || "Specialist",
            title: s.title,
          }))
        );
      }
    } catch (e: any) {
      console.error("Failed to load financial data", e);
      setActionError("Failed to synchronize financial data with database.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Status update for staff commission
  const handleCommissionStatusUpdate = async (id: string, newStatus: "APPROVED" | "PAID" | "CLAWED_BACK") => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch<any>(
        `/organizations/${orgId}/commissions/${id}/status`,
        {
          method: "PUT",
          body: JSON.stringify({ status: newStatus }),
        },
        orgId
      );
      if (res.success) {
        setActionSuccess(`✓ Commission record updated to ${newStatus}.`);
        fetchAllData(false);
      } else {
        setActionError(res.error?.message || "Failed to update commission record.");
      }
    } catch {
      setActionError("Network error while updating commission status.");
    }
  };

  // Rule creation
  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) return;
    setIsSubmittingRule(true);
    setActionError(null);
    setActionSuccess(null);

    const numValue = parseFloat(ruleRateInput);
    if (isNaN(numValue) || numValue <= 0) {
      setActionError("Please provide a valid positive rate.");
      setIsSubmittingRule(false);
      return;
    }

    // Convert to basis points for percentage, or minor units (cents) for fixed
    const rateValue =
      ruleCalcType === "PERCENTAGE"
        ? Math.round(numValue * 100)
        : Math.round(numValue * 100);

    try {
      const res = await apiFetch<any>(
        `/organizations/${orgId}/commissions/rules`,
        {
          method: "POST",
          body: JSON.stringify({
            name: ruleName.trim(),
            staffId: ruleStaffId || undefined,
            calculationType: ruleCalcType,
            rateValue,
            calculationBasis: ruleCalcBasis,
          }),
        },
        orgId
      );

      if (res.success) {
        setShowRuleModal(false);
        setRuleName("");
        setRuleStaffId("");
        setRuleRateInput("20");
        setActionSuccess(`✓ Commission rule created successfully.`);
        fetchAllData(false);
      } else {
        setActionError(res.error?.message || "Could not create commission rule.");
      }
    } catch {
      setActionError("Network error while creating commission rule.");
    } finally {
      setIsSubmittingRule(false);
    }
  };

  // Rule toggle active/inactive
  const handleToggleRule = async (rule: CommissionRule) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch<any>(
        `/organizations/${orgId}/commissions/rules/${rule.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ isActive: !rule.isActive }),
        },
        orgId
      );
      if (res.success) {
        setActionSuccess(`✓ Rule "${rule.name}" is now ${!rule.isActive ? "Active" : "Inactive"}.`);
        fetchAllData(false);
      } else {
        setActionError(res.error?.message || "Could not update rule status.");
      }
    } catch {
      setActionError("Network error while toggling rule.");
    }
  };

  // Rule delete
  const handleDeleteRule = async (ruleId: string, ruleName: string) => {
    if (!confirm(`Are you sure you want to delete commission rule "${ruleName}"?`)) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch<any>(
        `/organizations/${orgId}/commissions/rules/${ruleId}`,
        { method: "DELETE" },
        orgId
      );
      if (res.success) {
        setActionSuccess(`✓ Rule "${ruleName}" deleted.`);
        fetchAllData(false);
      } else {
        setActionError(res.error?.message || "Could not delete rule.");
      }
    } catch {
      setActionError("Network error while deleting rule.");
    }
  };

  // Issue refund submission
  const handleProcessRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRefundPayment) return;
    setIsProcessingRefund(true);
    setActionError(null);
    setActionSuccess(null);

    const primaryBalance = Math.max(
      0,
      (selectedRefundPayment.convertedAmountCents ?? selectedRefundPayment.amountCents) -
        (selectedRefundPayment.totalRefundedConvertedCents ?? 0)
    );
    const activeGatewayRefunds = (selectedRefundPayment.refunds || [])
      .filter((r) => r.status === "SUCCEEDED")
      .reduce((sum, r) => sum + r.amountCents, 0);
    const maxGatewayRefundableCents = Math.max(0, selectedRefundPayment.amountCents - activeGatewayRefunds);

    const isFull = refundType === "FULL";
    let refundAmountCents = maxGatewayRefundableCents;
    let refundCurrency: string | undefined = selectedRefundPayment.currency;

    if (!isFull) {
      const partialVal = parseFloat(refundAmountDollars);
      if (isNaN(partialVal) || partialVal <= 0) {
        setActionError("Please provide a valid refund amount.");
        setIsProcessingRefund(false);
        return;
      }
      const partialCents = Math.round(partialVal * 100);
      if (partialCents > primaryBalance) {
        setActionError(
          `Refund amount (${formatCurrency(partialCents, selectedRefundPayment.convertedCurrency || orgCurrency)}) exceeds maximum available balance (${formatCurrency(primaryBalance, selectedRefundPayment.convertedCurrency || orgCurrency)}).`
        );
        setIsProcessingRefund(false);
        return;
      }
      refundAmountCents = partialCents;
      refundCurrency = selectedRefundPayment.convertedCurrency || orgCurrency;
    }

    try {
      const idempotencyKey = `ref_${selectedRefundPayment.id}_${Date.now()}`;
      const res = await apiFetch<any>(
        `/organizations/${orgId}/refunds`,
        {
          method: "POST",
          body: JSON.stringify({
            paymentRecordId: selectedRefundPayment.id,
            amountCents: refundAmountCents,
            currency: refundCurrency,
            reason: refundReason.trim() || "Customer refund requested by manager",
            actorType: "STAFF",
            actorId: user?.userId,
            idempotencyKey,
          }),
        },
        orgId
      );

      if (res.success) {
        setSelectedRefundPayment(null);
        setRefundReason("");
        setRefundAmountDollars("");
        const displayAmt = isFull ? primaryBalance : refundAmountCents;
        const displayCurr = selectedRefundPayment.convertedCurrency || orgCurrency;
        setActionSuccess(
          `✓ Refund of ${formatCurrency(displayAmt, displayCurr)} successfully processed directly from organization Stripe account. Customer balance and commissions auto-reconciled.`
        );
        fetchAllData(false);
      } else {
        setActionError(res.error?.message || "Failed to process refund.");
      }
    } catch {
      setActionError("Network error while submitting refund request.");
    } finally {
      setIsProcessingRefund(false);
    }
  };

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (paymentFilterStatus !== "ALL" && p.status !== paymentFilterStatus) return false;
      if (paymentSearch.trim()) {
        const q = paymentSearch.trim().toLowerCase();
        const custName = p.appointment?.customer?.fullName || p.bookingHold?.guestName || "";
        const custEmail = p.appointment?.customer?.email || p.bookingHold?.guestEmail || "";
        const svcName = p.appointment?.service?.name || "";
        const refId = p.providerPaymentId || "";
        if (
          !custName.toLowerCase().includes(q) &&
          !custEmail.toLowerCase().includes(q) &&
          !svcName.toLowerCase().includes(q) &&
          !refId.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [payments, paymentFilterStatus, paymentSearch]);

  // Filtered Commissions
  const filteredCommissions = useMemo(() => {
    return commissions.filter((c) => {
      if (commissionFilterStatus !== "ALL" && c.status !== commissionFilterStatus) return false;
      if (commissionStaffFilter !== "ALL" && c.staff?.id !== commissionStaffFilter) return false;
      return true;
    });
  }, [commissions, commissionFilterStatus, commissionStaffFilter]);

  return (
    <div style={{ padding: "32px", minHeight: "100vh", backgroundColor: "var(--color-paper, #090d16)", color: "var(--color-ink, #f8fafc)", fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      {/* Header & Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "20px", marginBottom: "28px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <span style={{ backgroundColor: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", border: "1px solid rgba(56, 189, 248, 0.3)", padding: "4px 10px", borderRadius: "9999px", fontSize: "11.5px", fontWeight: 800, letterSpacing: "0.05em" }}>
              FINANCE &amp; COMMISSIONS
            </span>
            {paymentsSummary?.stripeConnect?.chargesEnabled ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#34d399", border: "1px solid rgba(52, 211, 153, 0.3)", padding: "3px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#34d399" }} />
                Stripe Connected
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", border: "1px solid rgba(245, 158, 11, 0.3)", padding: "3px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#fbbf24" }} />
                Stripe Onboarding Incomplete
              </span>
            )}
          </div>
          <h1 style={{ fontSize: "28px", fontWeight: 850, margin: "0 0 6px", color: "#f8fafc", letterSpacing: "-0.02em" }}>
            Payments &amp; Staff Financial Operations
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0, maxWidth: "720px" }}>
            Live authoritative financial ledger: customer transaction records, full &amp; partial refund execution, automated commission snapshots, and payout disbursement.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button
            onClick={() => fetchAllData(false)}
            disabled={isRefreshing}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              borderRadius: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#f8fafc",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
            <span>Sync Live</span>
          </button>

          <button
            onClick={() => setShowRuleModal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 18px",
              borderRadius: "8px",
              backgroundColor: "#7c3aed",
              color: "#fff",
              border: "none",
              fontSize: "13px",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(124, 58, 237, 0.35)",
            }}
          >
            <Plus size={15} />
            <span>New Commission Rule</span>
          </button>
        </div>
      </div>

      {/* Notifications / Feedback */}
      {actionSuccess && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 18px", borderRadius: "10px", backgroundColor: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(52, 211, 153, 0.35)", color: "#6ee7b7", fontSize: "13.5px", fontWeight: 700, marginBottom: "24px" }}>
          <CheckCircle2 size={18} />
          <span style={{ flex: 1 }}>{actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} style={{ background: "none", border: "none", color: "#6ee7b7", cursor: "pointer" }}><X size={16} /></button>
        </div>
      )}

      {actionError && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 18px", borderRadius: "10px", backgroundColor: "rgba(244, 63, 94, 0.15)", border: "1px solid rgba(244, 63, 94, 0.35)", color: "#fca5a5", fontSize: "13.5px", fontWeight: 700, marginBottom: "24px" }}>
          <AlertCircle size={18} />
          <span style={{ flex: 1 }}>{actionError}</span>
          <button onClick={() => setActionError(null)} style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer" }}><X size={16} /></button>
        </div>
      )}

      {/* Top Financial Executive KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginBottom: "32px" }}>
        <GlassCard style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12.5px", color: "#94a3b8", fontWeight: 700 }}>GROSS COLLECTED</span>
            <DollarSign size={18} color="#38bdf8" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 850, color: "#38bdf8" }}>
            {formatCurrency(paymentsSummary?.grossRevenueCents || 0, paymentsSummary?.currency || orgCurrency)}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
            {paymentsSummary?.successfulPaymentsCount || 0} successful transaction(s)
          </div>
        </GlassCard>

        <GlassCard style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12.5px", color: "#94a3b8", fontWeight: 700 }}>TOTAL REFUNDED</span>
            <ArrowDownRight size={18} color="#f43f5e" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 850, color: "#f43f5e" }}>
            {formatCurrency(paymentsSummary?.totalRefundsCents || 0, paymentsSummary?.currency || orgCurrency)}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
            {paymentsSummary?.refundedPaymentsCount || 0} refund incident(s)
          </div>
        </GlassCard>

        <GlassCard style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12.5px", color: "#94a3b8", fontWeight: 700 }}>NET COLLECTED REVENUE</span>
            <ArrowUpRight size={18} color="#34d399" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 850, color: "#34d399" }}>
            {formatCurrency(paymentsSummary?.netRevenueCents || 0, paymentsSummary?.currency || orgCurrency)}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
            Authoritative balance after refunds
          </div>
        </GlassCard>

        <GlassCard style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12.5px", color: "#94a3b8", fontWeight: 700 }}>COMMISSION LIABILITIES</span>
            <CircleDollarSign size={18} color="#a855f7" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 850, color: "#a855f7" }}>
            {formatCurrency(commissionsSummary?.totalAccruedCents || 0, commissionsSummary?.currency || orgCurrency)}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
            {commissionsSummary?.pendingCount || 0} pending manager review
          </div>
        </GlassCard>
      </div>

      {/* Main Multi-Tab Navigation */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #1e293b", paddingBottom: "12px", marginBottom: "24px" }}>
        <button
          onClick={() => setActiveTab("payments")}
          style={{
            padding: "8px 18px",
            borderRadius: "8px",
            fontSize: "13.5px",
            fontWeight: 800,
            border: "none",
            cursor: "pointer",
            backgroundColor: activeTab === "payments" ? "rgba(56, 189, 248, 0.15)" : "transparent",
            color: activeTab === "payments" ? "#38bdf8" : "#94a3b8",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Receipt size={16} />
          <span>Customer Transactions &amp; Invoices</span>
          <span style={{ backgroundColor: activeTab === "payments" ? "#0284c7" : "#334155", color: "#fff", padding: "1px 6px", borderRadius: "9999px", fontSize: "11px" }}>
            {payments.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("commissions")}
          style={{
            padding: "8px 18px",
            borderRadius: "8px",
            fontSize: "13.5px",
            fontWeight: 800,
            border: "none",
            cursor: "pointer",
            backgroundColor: activeTab === "commissions" ? "rgba(168, 85, 247, 0.15)" : "transparent",
            color: activeTab === "commissions" ? "#c084fc" : "#94a3b8",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <CircleDollarSign size={16} />
          <span>Staff Commission Ledger &amp; Payouts</span>
          <span style={{ backgroundColor: activeTab === "commissions" ? "#7c3aed" : "#334155", color: "#fff", padding: "1px 6px", borderRadius: "9999px", fontSize: "11px" }}>
            {commissions.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("rules")}
          style={{
            padding: "8px 18px",
            borderRadius: "8px",
            fontSize: "13.5px",
            fontWeight: 800,
            border: "none",
            cursor: "pointer",
            backgroundColor: activeTab === "rules" ? "rgba(234, 179, 8, 0.15)" : "transparent",
            color: activeTab === "rules" ? "#facc15" : "#94a3b8",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <ShieldCheck size={16} />
          <span>Commission Rules Engine</span>
          <span style={{ backgroundColor: activeTab === "rules" ? "#ca8a04" : "#334155", color: "#fff", padding: "1px 6px", borderRadius: "9999px", fontSize: "11px" }}>
            {rules.length}
          </span>
        </button>
      </div>

      {/* Tab 1: Customer Transactions & Invoices */}
      {activeTab === "payments" && (
        <div style={{ backgroundColor: "#0f172a", borderRadius: "14px", border: "1px solid #1e293b", padding: "24px" }}>
          {/* Controls Bar */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
              {["ALL", "SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED", "PENDING", "FAILED"].map((st) => (
                <button
                  key={st}
                  onClick={() => setPaymentFilterStatus(st)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                    backgroundColor: paymentFilterStatus === st ? "#38bdf8" : "#1e293b",
                    color: paymentFilterStatus === st ? "#0f172a" : "#94a3b8",
                  }}
                >
                  {st.replace(/_/g, " ")}
                </button>
              ))}
            </div>

            <div style={{ position: "relative", minWidth: "260px" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "10px", color: "#64748b" }} />
              <input
                type="text"
                placeholder="Search customer, email, ref ID..."
                value={paymentSearch}
                onChange={(e) => setPaymentSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px 8px 32px",
                  borderRadius: "6px",
                  border: "1px solid #334155",
                  backgroundColor: "#1e293b",
                  color: "#fff",
                  fontSize: "12.5px",
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Transactions Table */}
          {loading ? (
            <div style={{ padding: "64px", textAlign: "center", color: "#64748b" }}>Loading transactions...</div>
          ) : filteredPayments.length === 0 ? (
            <div style={{ padding: "64px", textAlign: "center", color: "#64748b" }}>
              No customer payments found matching current filters.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    <th style={{ padding: "12px 14px" }}>Date &amp; Time</th>
                    <th style={{ padding: "12px 14px" }}>Customer / Client</th>
                    <th style={{ padding: "12px 14px" }}>Appointment / Service</th>
                    <th style={{ padding: "12px 14px" }}>Provider &amp; Ref</th>
                    <th style={{ padding: "12px 14px" }}>Amount Paid</th>
                    <th style={{ padding: "12px 14px" }}>Refunds</th>
                    <th style={{ padding: "12px 14px" }}>Status</th>
                    <th style={{ padding: "12px 14px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p) => {
                    const custName = p.appointment?.customer?.fullName || p.bookingHold?.guestName || "Customer";
                    const custEmail = p.appointment?.customer?.email || p.bookingHold?.guestEmail || "";
                    const svcName = p.appointment?.service?.name || "Service Session";
                    const staffName = p.appointment?.staff?.displayName || "Specialist";
                    const totalRefunded = (p.refunds || [])
                      .filter((r) => r.status === "SUCCEEDED")
                      .reduce((sum, r) => sum + r.amountCents, 0);

                    let statusBadgeBg = "rgba(100, 116, 139, 0.2)";
                    let statusBadgeColor = "#cbd5e1";
                    if (p.status === "SUCCEEDED") {
                      statusBadgeBg = "rgba(16, 185, 129, 0.2)";
                      statusBadgeColor = "#34d399";
                    } else if (p.status === "PARTIALLY_REFUNDED") {
                      statusBadgeBg = "rgba(245, 158, 11, 0.2)";
                      statusBadgeColor = "#fbbf24";
                    } else if (p.status === "REFUNDED") {
                      statusBadgeBg = "rgba(244, 63, 94, 0.2)";
                      statusBadgeColor = "#f87171";
                    } else if (p.status === "PENDING") {
                      statusBadgeBg = "rgba(56, 189, 248, 0.2)";
                      statusBadgeColor = "#38bdf8";
                    }

                    const canRefund =
                      (p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED") &&
                      p.amountCents - totalRefunded > 0;

                    return (
                      <tr key={p.id} style={{ borderBottom: "1px solid #131d2e" }}>
                        <td style={{ padding: "14px", color: "#cbd5e1", whiteSpace: "nowrap" }}>
                          {new Date(p.createdAt).toLocaleDateString()}{" "}
                          <span style={{ fontSize: "11px", color: "#64748b" }}>
                            {new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </td>
                        <td style={{ padding: "14px" }}>
                          <div style={{ fontWeight: 700, color: "#f8fafc" }}>{custName}</div>
                          <div style={{ fontSize: "11px", color: "#64748b" }}>{custEmail}</div>
                        </td>
                        <td style={{ padding: "14px" }}>
                          <div style={{ fontWeight: 600, color: "#e2e8f0" }}>{svcName}</div>
                          <div style={{ fontSize: "11px", color: "#64748b" }}>With {staffName}</div>
                        </td>
                        <td style={{ padding: "14px" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11.5px", color: "#94a3b8" }}>
                            <CreditCard size={12} />
                            <span>Stripe</span>
                          </div>
                          <div style={{ fontSize: "10.5px", color: "#64748b", fontFamily: "monospace" }}>
                            {p.providerPaymentId.slice(0, 16)}...
                          </div>
                        </td>
                        <td style={{ padding: "14px", fontWeight: 800, color: "#f8fafc", fontSize: "14px" }}>
                          <div>
                            {formatCurrency(p.convertedAmountCents ?? p.amountCents, p.convertedCurrency || orgCurrency)}
                          </div>
                          {p.currency && p.convertedCurrency && p.currency !== p.convertedCurrency && (
                            <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 500 }}>
                              {formatCurrency(p.amountCents, p.currency)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "14px" }}>
                          {(p.totalRefundedConvertedCents || 0) > 0 || totalRefunded > 0 ? (
                            <span style={{ color: "#f43f5e", fontWeight: 700, fontSize: "12.5px" }}>
                              -{formatCurrency(p.totalRefundedConvertedCents ?? totalRefunded, p.convertedCurrency || orgCurrency)}
                            </span>
                          ) : (
                            <span style={{ color: "#475569", fontSize: "12px" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "14px" }}>
                          <span style={{ backgroundColor: statusBadgeBg, color: statusBadgeColor, padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 800 }}>
                            {p.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td style={{ padding: "14px" }}>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            {canRefund && (
                              <button
                                onClick={() => {
                                  setSelectedRefundPayment(p);
                                  setRefundType("FULL");
                                  setRefundReason("");
                                  const bal = Math.max(
                                    0,
                                    (p.convertedAmountCents ?? p.amountCents) - (p.totalRefundedConvertedCents ?? totalRefunded)
                                  ) / 100;
                                  setRefundAmountDollars(bal.toFixed(2));
                                }}
                                style={{
                                  padding: "5px 10px",
                                  borderRadius: "4px",
                                  border: "1px solid rgba(244, 63, 94, 0.4)",
                                  backgroundColor: "rgba(244, 63, 94, 0.1)",
                                  color: "#fda4af",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                Refund
                              </button>
                            )}
                            <button
                              onClick={() => setInvoiceModalData({ payment: p, orgName: user?.organizationName || "BookPro Business" })}
                              style={{
                                padding: "5px 10px",
                                borderRadius: "4px",
                                border: "1px solid rgba(56, 189, 248, 0.3)",
                                backgroundColor: "rgba(56, 189, 248, 0.08)",
                                color: "#38bdf8",
                                fontSize: "11px",
                                fontWeight: 700,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <Receipt size={11} />
                              <span>Invoice</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Staff Commission Ledger & Payouts */}
      {activeTab === "commissions" && (
        <div style={{ backgroundColor: "#0f172a", borderRadius: "14px", border: "1px solid #1e293b", padding: "24px" }}>
          {/* Filter Bar */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {["ALL", "PENDING", "APPROVED", "PAID", "CLAWED_BACK"].map((st) => (
                <button
                  key={st}
                  onClick={() => setCommissionFilterStatus(st)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                    backgroundColor: commissionFilterStatus === st ? "#7c3aed" : "#1e293b",
                    color: commissionFilterStatus === st ? "#fff" : "#94a3b8",
                  }}
                >
                  {st.replace(/_/g, " ")}
                </button>
              ))}
            </div>

            {/* Staff Filter Selector */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "#64748b" }}>Staff:</span>
              <select
                value={commissionStaffFilter}
                onChange={(e) => setCommissionStaffFilter(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  color: "#f8fafc",
                  fontSize: "12px",
                }}
              >
                <option value="ALL">All Staff Members</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Ledger Table */}
          {loading ? (
            <div style={{ padding: "64px", textAlign: "center", color: "#64748b" }}>Loading commission ledger...</div>
          ) : filteredCommissions.length === 0 ? (
            <div style={{ padding: "64px", textAlign: "center", color: "#64748b" }}>
              No commission events found for current filter.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    <th style={{ padding: "12px 14px" }}>Event Date</th>
                    <th style={{ padding: "12px 14px" }}>Specialist</th>
                    <th style={{ padding: "12px 14px" }}>Service &amp; Customer</th>
                    <th style={{ padding: "12px 14px" }}>Calculation Basis</th>
                    <th style={{ padding: "12px 14px" }}>Rate Snapshot</th>
                    <th style={{ padding: "12px 14px" }}>Commission</th>
                    <th style={{ padding: "12px 14px" }}>Status</th>
                    <th style={{ padding: "12px 14px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCommissions.map((c) => {
                    let statusBg = "#1e293b";
                    let statusColor = "#94a3b8";
                    if (c.status === "PENDING") {
                      statusBg = "rgba(245, 158, 11, 0.2)";
                      statusColor = "#fbbf24";
                    } else if (c.status === "APPROVED") {
                      statusBg = "rgba(16, 185, 129, 0.2)";
                      statusColor = "#34d399";
                    } else if (c.status === "PAID") {
                      statusBg = "rgba(124, 58, 237, 0.2)";
                      statusColor = "#c084fc";
                    } else if (c.status === "CLAWED_BACK") {
                      statusBg = "rgba(244, 63, 94, 0.2)";
                      statusColor = "#f87171";
                    }

                    const rateDisplay =
                      c.rateValueSnapshot > 100
                        ? `${(c.rateValueSnapshot / 100).toFixed(2)}%`
                        : `${c.rateValueSnapshot}%`;

                    return (
                      <tr key={c.id} style={{ borderBottom: "1px solid #131d2e" }}>
                        <td style={{ padding: "14px", color: "#cbd5e1" }}>
                          {new Date(c.createdAt).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "14px", fontWeight: 700, color: "#f8fafc" }}>
                          {c.staff?.displayName || "Specialist"}
                          {c.staff?.title && <div style={{ fontSize: "11px", color: "#64748b" }}>{c.staff.title}</div>}
                        </td>
                        <td style={{ padding: "14px" }}>
                          <div style={{ fontWeight: 600, color: "#e2e8f0" }}>{c.appointment?.service?.name || "Service Session"}</div>
                          <div style={{ fontSize: "11px", color: "#64748b" }}>{c.appointment?.customer?.fullName || "Client"}</div>
                        </td>
                        <td style={{ padding: "14px" }}>
                          <div>{formatCurrency(c.convertedPriceSnapshotCents ?? c.priceSnapshotCents, c.convertedCurrency || c.currency || orgCurrency)}</div>
                          <div style={{ fontSize: "10.5px", color: "#64748b" }}>{c.calculationBasisSnapshot.replace(/_/g, " ")}</div>
                        </td>
                        <td style={{ padding: "14px" }}>
                          <div style={{ fontWeight: 700, color: "#f8fafc" }}>{rateDisplay}</div>
                          <div style={{ fontSize: "10.5px", color: "#64748b" }}>v{c.ruleVersionSnapshot || 1}</div>
                        </td>
                        <td style={{ padding: "14px", fontWeight: 800, color: c.status === "CLAWED_BACK" ? "#94a3b8" : "#34d399", fontSize: "14px", textDecoration: c.status === "CLAWED_BACK" ? "line-through" : "none" }}>
                          {formatCurrency(c.convertedAmountCents ?? c.calculatedAmountCents, c.convertedCurrency || c.currency || orgCurrency)}
                        </td>
                        <td style={{ padding: "14px" }}>
                          <span style={{ backgroundColor: statusBg, color: statusColor, padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 800 }}>
                            {c.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td style={{ padding: "14px" }}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            {c.status === "PENDING" && (
                              <button
                                onClick={() => handleCommissionStatusUpdate(c.id, "APPROVED")}
                                style={{ padding: "4px 8px", backgroundColor: "#059669", color: "#fff", border: "none", borderRadius: "4px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                              >
                                Approve
                              </button>
                            )}
                            {c.status === "APPROVED" && (
                              <button
                                onClick={() => handleCommissionStatusUpdate(c.id, "PAID")}
                                style={{ padding: "4px 8px", backgroundColor: "#7c3aed", color: "#fff", border: "none", borderRadius: "4px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                              >
                                Mark Paid
                              </button>
                            )}
                            {c.status !== "CLAWED_BACK" && c.status !== "PAID" && (
                              <button
                                onClick={() => handleCommissionStatusUpdate(c.id, "CLAWED_BACK")}
                                style={{ padding: "4px 8px", backgroundColor: "#334155", color: "#fda4af", border: "none", borderRadius: "4px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                              >
                                Void
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Commission Rules Configuration */}
      {activeTab === "rules" && (
        <div style={{ backgroundColor: "#0f172a", borderRadius: "14px", border: "1px solid #1e293b", padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 800, margin: "0 0 4px", color: "#f8fafc" }}>
                Active Commission Calculation Rules
              </h2>
              <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>
                Hierarchical rule matching: staff-specific rules take precedence over organization-wide defaults.
              </p>
            </div>

            <button
              onClick={() => setShowRuleModal(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "6px",
                backgroundColor: "#7c3aed",
                color: "#fff",
                border: "none",
                fontSize: "12.5px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Plus size={14} />
              <span>Add Rule</span>
            </button>
          </div>

          {loading ? (
            <div style={{ padding: "64px", textAlign: "center", color: "#64748b" }}>Loading rules...</div>
          ) : rules.length === 0 ? (
            <div style={{ padding: "64px", textAlign: "center", color: "#64748b" }}>
              No commission rules configured yet. Click &quot;Add Rule&quot; to configure your first payout formula.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
              {rules.map((rule) => {
                const rateFormatted =
                  rule.calculationType === "PERCENTAGE"
                    ? `${(rule.rateValue / 100).toFixed(2)}%`
                    : formatCurrency(rule.rateValue, orgCurrency);

                return (
                  <div
                    key={rule.id}
                    style={{
                      backgroundColor: "#1e293b",
                      borderRadius: "10px",
                      border: `1px solid ${rule.isActive ? "#334155" : "#283548"}`,
                      padding: "18px",
                      opacity: rule.isActive ? 1 : 0.6,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                        <div>
                          <h3 style={{ fontSize: "16px", fontWeight: 800, margin: "0 0 4px", color: "#f8fafc" }}>
                            {rule.name}
                          </h3>
                          <span style={{ fontSize: "11px", color: "#38bdf8", fontWeight: 700 }}>
                            {rule.staff ? `Specialist: ${rule.staff.displayName}` : "All Organization Staff (Default)"}
                          </span>
                        </div>
                        <span style={{ backgroundColor: rule.isActive ? "rgba(16, 185, 129, 0.2)" : "rgba(100, 116, 139, 0.2)", color: rule.isActive ? "#34d399" : "#94a3b8", padding: "2px 8px", borderRadius: "9999px", fontSize: "10.5px", fontWeight: 800 }}>
                          {rule.isActive ? "ACTIVE" : "DISABLED"}
                        </span>
                      </div>

                      <div style={{ display: "grid", gap: "6px", fontSize: "12.5px", color: "#cbd5e1", marginTop: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "#94a3b8" }}>Formula:</span>
                          <strong style={{ color: "#f8fafc" }}>{rule.calculationType} ({rateFormatted})</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "#94a3b8" }}>Basis:</span>
                          <span style={{ color: "#f8fafc" }}>{rule.calculationBasis.replace(/_/g, " ")}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "#94a3b8" }}>Version:</span>
                          <span>v{rule.ruleVersion}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #334155" }}>
                      <button
                        onClick={() => handleToggleRule(rule)}
                        style={{
                          flex: 1,
                          padding: "6px",
                          borderRadius: "6px",
                          backgroundColor: "#0f172a",
                          border: "1px solid #334155",
                          color: "#f8fafc",
                          fontSize: "11.5px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {rule.isActive ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id, rule.name)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "6px",
                          backgroundColor: "rgba(244, 63, 94, 0.15)",
                          border: "1px solid rgba(244, 63, 94, 0.3)",
                          color: "#fda4af",
                          fontSize: "11.5px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal: Issue Refund */}
      {selectedRefundPayment && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0, 0, 0, 0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ backgroundColor: "#0f172a", borderRadius: "14px", border: "1px solid #334155", padding: "28px", width: "100%", maxWidth: "480px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: 800, margin: 0, color: "#f8fafc" }}>
                Execute Customer Refund
              </h3>
              <button onClick={() => setSelectedRefundPayment(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}><X size={18} /></button>
            </div>

            {(() => {
              const primaryCharged = selectedRefundPayment.convertedAmountCents ?? selectedRefundPayment.amountCents;
              const primaryCurr = selectedRefundPayment.convertedCurrency || orgCurrency;
              const primaryRefunded = selectedRefundPayment.totalRefundedConvertedCents ??
                (selectedRefundPayment.refunds || [])
                  .filter((r) => r.status === "SUCCEEDED")
                  .reduce((sum, r) => sum + (r.convertedAmountCents ?? r.amountCents), 0);
              const remainingBalancePrimary = Math.max(0, primaryCharged - primaryRefunded);

              const gatewayCharged = selectedRefundPayment.amountCents;
              const gatewayRefunded = (selectedRefundPayment.refunds || [])
                .filter((r) => r.status === "SUCCEEDED")
                .reduce((sum, r) => sum + r.amountCents, 0);
              const remainingBalanceGateway = Math.max(0, gatewayCharged - gatewayRefunded);

              const cust = selectedRefundPayment.appointment?.customer?.fullName || selectedRefundPayment.bookingHold?.guestName || "Customer";
              const stripeAccId = selectedRefundPayment.metadata?.connectedAccountId || paymentsSummary?.stripeConnect?.accountId;

              return (
                <form onSubmit={handleProcessRefund} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ backgroundColor: "#1e293b", padding: "12px", borderRadius: "8px", fontSize: "13px", color: "#cbd5e1" }}>
                    <div><strong>Customer:</strong> {cust}</div>
                    <div>
                      <strong>Original Charged:</strong> {formatCurrency(primaryCharged, primaryCurr)}
                      {primaryCurr !== selectedRefundPayment.currency && (
                        <span style={{ fontSize: "11.5px", color: "#94a3b8", marginLeft: "6px" }}>
                          ({formatCurrency(gatewayCharged, selectedRefundPayment.currency)})
                        </span>
                      )}
                    </div>
                    <div>
                      <strong>Maximum Refundable:</strong>{" "}
                      <span style={{ color: "#34d399", fontWeight: 800 }}>
                        {formatCurrency(remainingBalancePrimary, primaryCurr)}
                      </span>
                      {primaryCurr !== selectedRefundPayment.currency && (
                        <span style={{ fontSize: "11.5px", color: "#94a3b8", marginLeft: "6px" }}>
                          ({formatCurrency(remainingBalanceGateway, selectedRefundPayment.currency)})
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ backgroundColor: "rgba(56, 189, 248, 0.08)", border: "1px solid rgba(56, 189, 248, 0.2)", borderRadius: "6px", padding: "8px 12px", fontSize: "11.5px", color: "#38bdf8" }}>
                    ✓ Refund will be deducted directly from organization Stripe account {stripeAccId ? `(${stripeAccId})` : ""} to customer.
                  </div>

                  <div>
                    <label style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "6px" }}>Refund Type</label>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <label style={{ flex: 1, padding: "10px", borderRadius: "6px", backgroundColor: refundType === "FULL" ? "rgba(56, 189, 248, 0.15)" : "#1e293b", border: `1px solid ${refundType === "FULL" ? "#38bdf8" : "#334155"}`, color: "#f8fafc", fontSize: "12.5px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                        <input
                          type="radio"
                          name="refundType"
                          checked={refundType === "FULL"}
                          onChange={() => {
                            setRefundType("FULL");
                            setRefundAmountDollars((remainingBalancePrimary / 100).toFixed(2));
                          }}
                        />
                        <span>Full Balance ({formatCurrency(remainingBalancePrimary, primaryCurr)})</span>
                      </label>
                      <label style={{ flex: 1, padding: "10px", borderRadius: "6px", backgroundColor: refundType === "PARTIAL" ? "rgba(56, 189, 248, 0.15)" : "#1e293b", border: `1px solid ${refundType === "PARTIAL" ? "#38bdf8" : "#334155"}`, color: "#f8fafc", fontSize: "12.5px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                        <input
                          type="radio"
                          name="refundType"
                          checked={refundType === "PARTIAL"}
                          onChange={() => {
                            setRefundType("PARTIAL");
                            setRefundAmountDollars("");
                          }}
                        />
                        <span>Custom Partial</span>
                      </label>
                    </div>
                  </div>

                  {refundType === "PARTIAL" && (
                    <div>
                      <label style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "6px" }}>
                        Refund Amount ({primaryCurr})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        max={(remainingBalancePrimary / 100).toFixed(2)}
                        min="0.01"
                        placeholder="0.00"
                        value={refundAmountDollars}
                        onChange={(e) => setRefundAmountDollars(e.target.value)}
                        style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                      />
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "6px" }}>Reason for Refund</label>
                    <input
                      type="text"
                      placeholder="e.g. Client cancelled per policy / Service adjustment"
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedRefundPayment(null)}
                      style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", cursor: "pointer", fontWeight: 700 }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isProcessingRefund}
                      style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "none", backgroundColor: "#f43f5e", color: "#fff", cursor: "pointer", fontWeight: 800 }}
                    >
                      {isProcessingRefund ? "Processing Refund..." : "Confirm Refund"}
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal: New Commission Rule */}
      {showRuleModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ backgroundColor: "#0f172a", borderRadius: "14px", border: "1px solid #334155", padding: "28px", width: "100%", maxWidth: "480px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: 800, margin: 0, color: "#f8fafc" }}>
                Configure Commission Rule
              </h3>
              <button onClick={() => setShowRuleModal(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreateRule} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "6px" }}>Rule Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master Stylist 35% Tier"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "6px" }}>Applies To Specialist</label>
                <select
                  value={ruleStaffId}
                  onChange={(e) => setRuleStaffId(e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                >
                  <option value="">All Staff Members (Org Default Rule)</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName} {s.title ? `(${s.title})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "6px" }}>Formula Type</label>
                  <select
                    value={ruleCalcType}
                    onChange={(e) => setRuleCalcType(e.target.value as any)}
                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED_AMOUNT">Fixed Dollar ($)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "6px" }}>
                    {ruleCalcType === "PERCENTAGE" ? "Rate (%)" : `Amount (${orgCurrency})`}
                  </label>
                  <input
                    type="number"
                    step={ruleCalcType === "PERCENTAGE" ? "0.1" : "1"}
                    required
                    value={ruleRateInput}
                    onChange={(e) => setRuleRateInput(e.target.value)}
                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "6px" }}>Calculation Basis</label>
                <select
                  value={ruleCalcBasis}
                  onChange={(e) => setRuleCalcBasis(e.target.value as any)}
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                >
                  <option value="NET_SERVICE_PRICE">Net Service Price (After Discounts)</option>
                  <option value="GROSS_SERVICE_PRICE">Gross Service Price</option>
                  <option value="TOTAL_APPOINTMENT_PRICE">Total Appointment Price</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowRuleModal(false)}
                  style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", cursor: "pointer", fontWeight: 700 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRule}
                  style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "none", backgroundColor: "#7c3aed", color: "#fff", cursor: "pointer", fontWeight: 800 }}
                >
                  {isSubmittingRule ? "Saving..." : "Save Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Customer Tax Invoice & Receipt Breakdown */}
      {invoiceModalData && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ backgroundColor: "#0f172a", borderRadius: "14px", border: "1px solid #334155", padding: "32px", width: "100%", maxWidth: "560px", color: "#f8fafc" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", borderBottom: "1px solid #1e293b", paddingBottom: "16px" }}>
              <div>
                <span style={{ fontSize: "11px", color: "#38bdf8", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>OFFICIAL TAX INVOICE</span>
                <h2 style={{ fontSize: "22px", fontWeight: 850, margin: "4px 0 0" }}>{invoiceModalData.orgName}</h2>
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>Invoice Ref: #{invoiceModalData.payment.id.slice(0, 8).toUpperCase()}</div>
              </div>
              <button onClick={() => setInvoiceModalData(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}><X size={20} /></button>
            </div>

            <div style={{ display: "grid", gap: "14px", fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", backgroundColor: "#1e293b", padding: "12px", borderRadius: "8px" }}>
                <div>
                  <div style={{ color: "#94a3b8", fontSize: "11px" }}>Billed To:</div>
                  <strong style={{ color: "#f8fafc" }}>
                    {invoiceModalData.payment.appointment?.customer?.fullName || invoiceModalData.payment.bookingHold?.guestName || "Client"}
                  </strong>
                  <div style={{ color: "#64748b", fontSize: "11px" }}>
                    {invoiceModalData.payment.appointment?.customer?.email || invoiceModalData.payment.bookingHold?.guestEmail || ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#94a3b8", fontSize: "11px" }}>Date:</div>
                  <strong>{new Date(invoiceModalData.payment.createdAt).toLocaleDateString()}</strong>
                  <div style={{ color: "#64748b", fontSize: "11px" }}>Method: Stripe Authorization</div>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, marginBottom: "8px", color: "#cbd5e1" }}>Service Itemized:</div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #1e293b", paddingBottom: "8px" }}>
                  <span>{invoiceModalData.payment.appointment?.service?.name || "Professional Session"}</span>
                  <strong>
                    {formatCurrency(
                      invoiceModalData.payment.convertedAmountCents ?? invoiceModalData.payment.amountCents,
                      invoiceModalData.payment.convertedCurrency || invoiceModalData.payment.currency || orgCurrency
                    )}
                  </strong>
                </div>
              </div>

              {(invoiceModalData.payment.refunds || []).length > 0 && (
                <div style={{ backgroundColor: "rgba(244, 63, 94, 0.1)", border: "1px solid rgba(244, 63, 94, 0.25)", padding: "12px", borderRadius: "8px" }}>
                  <div style={{ fontWeight: 700, color: "#fda4af", marginBottom: "4px" }}>Refunds Processed:</div>
                  {invoiceModalData.payment.refunds!.map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#fca5a5" }}>
                      <span>{new Date(r.createdAt).toLocaleDateString()}: {r.reason || "Refund adjustment"}</span>
                      <strong>
                        -{formatCurrency(
                          r.convertedAmountCents ?? r.amountCents,
                          r.convertedCurrency || r.currency || orgCurrency
                        )}
                      </strong>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "2px solid #334155", paddingTop: "12px", fontSize: "16px" }}>
                <strong>Net Settled Balance:</strong>
                <strong style={{ color: "#34d399", fontSize: "18px" }}>
                  {formatCurrency(
                    (invoiceModalData.payment.convertedAmountCents ?? invoiceModalData.payment.amountCents) -
                      (invoiceModalData.payment.refunds || [])
                        .filter((r) => r.status === "SUCCEEDED")
                        .reduce((sum, r) => sum + (r.convertedAmountCents ?? r.amountCents), 0),
                    invoiceModalData.payment.convertedCurrency || invoiceModalData.payment.currency || orgCurrency
                  )}
                </strong>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
              <button
                onClick={() => window.print()}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <Printer size={15} />
                <span>Print Invoice</span>
              </button>
              <button
                onClick={() => setInvoiceModalData(null)}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  backgroundColor: "#38bdf8",
                  border: "none",
                  color: "#0f172a",
                  fontSize: "13px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

