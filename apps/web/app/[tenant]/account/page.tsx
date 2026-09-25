/* Hallmark · macrostructure: Customer Account Dashboard · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 */
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { ActorType } from "@bookpro/contracts";
import { ProtectedRoute } from "../../../components/protected-route";
import { apiFetch } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { useRealtimeEvents } from "../../../lib/use-realtime-events";
import { GlassCard, GlassBadge } from "../../../components/glass-card";
import {
  FloatingParticles,
  CalendarPulse,
  ClockSpinner,
  QrCodeScan,
  CheckmarkDraw,
  PulsingDot,
} from "../../../components/animated-svgs";
import {
  Calendar,
  Clock,
  MapPin,
  ArrowRight,
  RefreshCw,
  XCircle,
  QrCode,
  Download,
  AlertCircle,
  User,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  Tag,
  Mail,
  Copy,
  Check,
  Sparkles,
  FileText,
  CreditCard,
} from "../../../components/icons";
import { QrDisplay } from "../../../components/qr-display";
import { CustomerPortalShell } from "../../../components/shell/customer-portal-shell";
import { CustomerCancellationModal } from "../../../components/customer-cancellation-modal";
import { syncServerTime, getServerNow } from "../../../lib/time-sync";

interface CustomerPaymentRecord {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  paymentMethod?: string;
  stripePaymentIntentId?: string;
  createdAt: string;
  refunds?: Array<{
    id: string;
    amountCents: number;
    reason?: string;
    status: string;
    createdAt: string;
  }>;
}

interface CustomerAppointment {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  priceCents: number;
  currency: string;
  serviceId?: string;
  locationId?: string;
  staffId?: string;
  service?: { id?: string; name: string; durationMin: number };
  staff?: { id?: string; displayName: string };
  location?: { id?: string; name: string; address?: string; city?: string; timezone?: string };
  paymentRecords?: CustomerPaymentRecord[];
  metadata?: {
    rescheduleProposal?: {
      proposedStartAt: string;
      proposedEndAt: string;
      proposedStaffId?: string;
      proposedStaffName?: string;
      reason?: string;
      status: string;
      proposedAt: string;
      proposedBy: string;
    };
    [key: string]: any;
  };
}

interface CustomerBillingTransaction {
  id: string;
  appointmentId: string;
  amountCents: number;
  currency: string;
  status: string;
  paymentMethod: string;
  stripePaymentIntentId?: string;
  createdAt: string;
  appointment?: {
    id: string;
    service?: { name: string; priceCents?: number };
    staff?: { displayName: string };
    startAt: string;
    endAt: string;
  };
  refunds?: Array<{
    id: string;
    amountCents: number;
    status: string;
    reason?: string;
    createdAt: string;
  }>;
}

interface CustomerBillingData {
  customer: {
    id: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    email: string;
    phone?: string;
    totalSpentCents: number;
    currency: string;
  };
  organization: {
    id: string;
    name: string;
    brandName?: string;
    currency: string;
    slug: string;
    logoUrl?: string;
  };
  transactions: CustomerBillingTransaction[];
  summary: {
    totalSpentCents: number;
    totalRefundedCents: number;
    netPaidCents: number;
    totalAppointments: number;
  };
}

interface OrganizationInfo {
  id: string;
  name: string;
  brandName?: string | null;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  timezone?: string | null;
}

function formatMoney(cents: number, currency: string = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "USD").toUpperCase(),
    }).format((cents || 0) / 100);
  } catch {
    return `${(currency || "USD").toUpperCase()} ${((cents || 0) / 100).toFixed(2)}`;
  }
}

function downloadIcsCalendar(appt: CustomerAppointment, orgName: string) {
  const startDate = new Date(appt.startAt);
  const endDate = new Date(appt.endAt);

  const formatIcsDate = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BookPro//Appointment Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:appt-${appt.id}@bookpro.app`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(startDate)}`,
    `DTEND:${formatIcsDate(endDate)}`,
    `SUMMARY:${appt.service?.name || "Appointment"} with ${orgName}`,
    `DESCRIPTION:Service: ${appt.service?.name || "Session"}\\nSpecialist: ${
      appt.staff?.displayName || "Practitioner"
    }\\nBooking Reference: ${appt.id}`,
    `LOCATION:${appt.location?.name || orgName}, ${appt.location?.address || ""}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `appointment-${appt.id.slice(0, 8)}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function CustomerAccountContent() {
  const params = useParams();
  const tenant = (params?.tenant as string) || (params?.slug as string) || "";
  const { user } = useAuth();

  const [organization, setOrganization] = useState<OrganizationInfo | null>(null);
  const [appointments, setAppointments] = useState<CustomerAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past" | "cancelled" | "billing" | "waitlist">("upcoming");
  const [billingData, setBillingData] = useState<CustomerBillingData | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [waitlistOffers, setWaitlistOffers] = useState<any[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<any[]>([]);
  const [loadingWaitlist, setLoadingWaitlist] = useState(false);
  const [isJoiningRescheduleWaitlist, setIsJoiningRescheduleWaitlist] = useState(false);
  const [selectedInvoiceItem, setSelectedInvoiceItem] = useState<{
    id: string;
    serviceName?: string;
    staffName?: string;
    startAt?: string;
    endAt?: string;
    priceCents?: number;
    currency?: string;
    paymentRecords?: any[];
    status?: string;
    invoiceNumber?: string;
    transactionId?: string;
    paymentMethod?: string;
  } | null>(null);
  const [selectedPassAppt, setSelectedPassAppt] = useState<CustomerAppointment | null>(null);
  const [passData, setPassData] = useState<any>(null);
  const [loadingPass, setLoadingPass] = useState(false);
  const [selfCheckingIn, setSelfCheckingIn] = useState(false);
  const [cancelModalAppt, setCancelModalAppt] = useState<CustomerAppointment | null>(null);
  const [rescheduleModalAppt, setRescheduleModalAppt] = useState<CustomerAppointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>("");
  const [rescheduleSlots, setRescheduleSlots] = useState<Array<{ slotUtc: string; available: boolean; staffId?: string; staffDisplayName?: string; remainingCapacity?: number }>>([]);
  const [rescheduleNonce, setRescheduleNonce] = useState(0);
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<string>("");
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [autoAssignStaff, setAutoAssignStaff] = useState<boolean>(true);
  const [isAutoScanning, setIsAutoScanning] = useState<boolean>(false);

  // Marketing offers & consent state
  const [offers, setOffers] = useState<any[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState<boolean>(false);
  const [consentUpdatedAt, setConsentUpdatedAt] = useState<string | null>(null);
  const [updatingConsent, setUpdatingConsent] = useState(false);
  const [copiedOfferCode, setCopiedOfferCode] = useState<string | null>(null);

  // Load active offers and customer marketing preferences
  useEffect(() => {
    if (!organization?.id) return;
    setLoadingOffers(true);
    apiFetch<any[]>("/customer-portal/offers", {}, organization.id)
      .then((res) => {
        if (res.success && res.data) setOffers(res.data);
      })
      .catch(() => {})
      .finally(() => setLoadingOffers(false));

    apiFetch<{ consentMarketing: boolean; consentMarketingAt?: string | null }>(
      "/customer-portal/preferences",
      {},
      organization.id
    )
      .then((res) => {
        if (res.success && res.data) {
          setMarketingConsent(Boolean(res.data.consentMarketing));
          setConsentUpdatedAt(res.data.consentMarketingAt || null);
        }
      })
      .catch(() => {});
  }, [organization?.id]);

  const handleToggleMarketingConsent = async () => {
    if (!organization?.id || updatingConsent) return;
    setUpdatingConsent(true);
    const nextVal = !marketingConsent;
    try {
      const res = await apiFetch<any>(
        "/customer-portal/preferences",
        {
          method: "PUT",
          body: JSON.stringify({ consentMarketing: nextVal }),
        },
        organization.id
      );
      if (res.success) {
        setMarketingConsent(Boolean(res.data?.consentMarketing ?? nextVal));
        setConsentUpdatedAt(res.data?.consentMarketingAt || null);
        setActionMessage(
          nextVal
            ? "✓ Subscribed to studio exclusive offers & announcements."
            : "✓ Unsubscribed from promotional emails. Vital booking reminders will still be delivered."
        );
      } else {
        setError(res.error?.message || "Could not update communication preferences.");
      }
    } catch {
      setError("Network error while updating communication preferences.");
    } finally {
      setUpdatingConsent(false);
    }
  };

  const handleCopyOfferCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedOfferCode(code);
    setTimeout(() => setCopiedOfferCode(null), 2000);
  };

  // Fetch cryptographic QR Pass token on appointment selection
  useEffect(() => {
    if (!selectedPassAppt || !organization?.id) {
      setPassData(null);
      return;
    }
    setLoadingPass(true);
    apiFetch<any>(`/appointments/${selectedPassAppt.id}/qr-pass`, {}, organization.id)
      .then((res) => {
        if (res.success && res.data) {
          setPassData(res.data);
        } else {
          setPassData(null);
        }
      })
      .catch(() => setPassData(null))
      .finally(() => setLoadingPass(false));
  }, [selectedPassAppt, organization?.id]);

  const handleSelfCheckIn = async () => {
    if (!passData?.qrToken) return;
    setSelfCheckingIn(true);
    setError(null);
    try {
      const res = await apiFetch<any>("/appointments/check-in/qr", {
        method: "POST",
        body: JSON.stringify({ token: passData.qrToken }),
      });
      if (res.success) {
        setActionMessage("✓ You are checked in! The team has been notified of your arrival.");
        fetchAppointments();
        if (selectedPassAppt) {
          setSelectedPassAppt({ ...selectedPassAppt, status: "CHECKED_IN" });
        }
      } else {
        setError(res.error?.message || "Check-in could not be completed. Please check in with front desk staff.");
      }
    } catch (err: any) {
      setError(err.message || "Network error during check-in.");
    } finally {
      setSelfCheckingIn(false);
    }
  };

  // Real-time SSE subscription: auto-refetch appointments & financial data on live domain events
  useRealtimeEvents(organization?.id, {
    onEvent: (hint) => {
      if (
        hint.type.startsWith("appointment.") ||
        hint.type.startsWith("booking_hold.") ||
        hint.type.startsWith("waitlist.") ||
        hint.type.startsWith("staff.") ||
        hint.type.startsWith("payment.") ||
        hint.type.startsWith("refund.") ||
        hint.type.startsWith("commission.") ||
        hint.type.startsWith("customer.") ||
        hint.type.startsWith("schedule.") ||
        hint.type.startsWith("location.")
      ) {
        fetchAppointments();
        fetchBilling();
        fetchWaitlistData();
        setRescheduleNonce((n) => n + 1);
      }
    },
  });

  useEffect(() => {
    if (!rescheduleModalAppt || !rescheduleDate || !organization?.id) return;
    setLoadingSlots(true);
    setSelectedRescheduleSlot("");
    const params = new URLSearchParams({
      organizationId: organization.id,
      startDate: `${rescheduleDate}T00:00:00.000Z`,
      endDate: `${rescheduleDate}T23:59:59.999Z`,
    });
    if (rescheduleModalAppt.locationId) params.append("locationId", rescheduleModalAppt.locationId);
    if (rescheduleModalAppt.serviceId) params.append("serviceId", rescheduleModalAppt.serviceId);
    if ((rescheduleModalAppt as any).partySize && (rescheduleModalAppt as any).partySize > 1) {
      params.append("partySize", String((rescheduleModalAppt as any).partySize));
    }
    if (!autoAssignStaff && rescheduleModalAppt.staffId) params.append("staffId", rescheduleModalAppt.staffId);

    apiFetch<any>(`/availability/slots?${params.toString()}`, {}, organization.id)
      .then((res) => {
        const slots: Array<{ slotUtc: string; available: boolean; staffId?: string; staffDisplayName?: string; remainingCapacity?: number }> = [];
        if (res.success && res.data) {
          const raw = Array.isArray(res.data) ? res.data : res.data.slots || [];
          raw.forEach((s: any) => {
            slots.push({
              slotUtc: s.startUtc || s.slotUtc || s.startAt || s,
              available: s.available !== false,
              staffId: s.staffId,
              staffDisplayName: s.staffDisplayName,
              remainingCapacity: typeof s.remainingCapacity === "number" ? s.remainingCapacity : undefined,
            });
          });
        }
        setRescheduleSlots(slots);
      })
      .catch(() => setRescheduleSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [rescheduleModalAppt, rescheduleDate, autoAssignStaff, organization?.id, rescheduleNonce]);

  const handleCustomerReschedule = async () => {
    if (!rescheduleModalAppt || !selectedRescheduleSlot || !organization?.id) return;
    setIsRescheduling(true);
    try {
      const durationMin = rescheduleModalAppt.service?.durationMin || 30;
      const newEnd = new Date(new Date(selectedRescheduleSlot).getTime() + durationMin * 60 * 1000).toISOString();
      const chosenSlot = rescheduleSlots.find((s) => s.slotUtc === selectedRescheduleSlot);

      const res = await apiFetch(
        `/appointments/${rescheduleModalAppt.id}/reschedule`,
        {
          method: "PATCH",
          body: JSON.stringify({
            organizationId: organization.id,
            newStartAt: selectedRescheduleSlot,
            newEndAt: newEnd,
            newStaffId: chosenSlot?.staffId || undefined,
          }),
        },
        organization.id
      );

      if (res.success) {
        setActionMessage("✓ Appointment successfully rescheduled.");
        setRescheduleModalAppt(null);
        fetchAppointments();
      } else {
        setError(res.error?.message || "Failed to reschedule appointment. The slot may have become unavailable.");
      }
    } catch (err: any) {
      setError(err.message || "Network error while rescheduling.");
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleInstantAutoReschedule = async () => {
    if (!rescheduleModalAppt || !organization?.id) return;
    setIsAutoScanning(true);
    setError(null);
    try {
      const today = new Date();
      const startDate = new Date(today.getTime() + 86400000).toISOString().split("T")[0];
      const endDate = new Date(today.getTime() + 8 * 86400000).toISOString().split("T")[0];

      const params = new URLSearchParams({
        organizationId: organization.id,
        startDate: `${startDate}T00:00:00.000Z`,
        endDate: `${endDate}T23:59:59.999Z`,
      });
      if (rescheduleModalAppt.locationId) params.append("locationId", rescheduleModalAppt.locationId);
      if (rescheduleModalAppt.serviceId) params.append("serviceId", rescheduleModalAppt.serviceId);

      const res = await apiFetch<any>(`/availability/slots?${params.toString()}`, {}, organization.id);
      let foundSlot: any = null;
      if (res.success && res.data) {
        const raw = Array.isArray(res.data) ? res.data : res.data.slots || [];
        foundSlot = raw.find((s: any) => s.available !== false);
      }

      if (foundSlot) {
        const slotUtc = foundSlot.startUtc || foundSlot.slotUtc || foundSlot.startAt || foundSlot;
        const durationMin = rescheduleModalAppt.service?.durationMin || 30;
        const newEnd = new Date(new Date(slotUtc).getTime() + durationMin * 60 * 1000).toISOString();

        const patchRes = await apiFetch(
          `/appointments/${rescheduleModalAppt.id}/reschedule`,
          {
            method: "PATCH",
            body: JSON.stringify({
              organizationId: organization.id,
              newStartAt: slotUtc,
              newEndAt: newEnd,
              newStaffId: foundSlot.staffId || undefined,
            }),
          },
          organization.id
        );

        if (patchRes.success) {
          const formattedDate = new Date(slotUtc).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
          const formattedTime = new Date(slotUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          setActionMessage(`✓ Fully automated reschedule complete! Confirmed for ${formattedDate} at ${formattedTime} with ${foundSlot.staffDisplayName || "Qualified Specialist"}.`);
          setRescheduleModalAppt(null);
          fetchAppointments();
        } else {
          setError(patchRes.error?.message || "Could not complete automated reschedule.");
        }
      } else {
        await handleJoinRescheduleWaitlist();
      }
    } catch (err: any) {
      setError(err.message || "Failed to execute automated reschedule.");
    } finally {
      setIsAutoScanning(false);
    }
  };

  const handleConfirmProposal = async (appointmentId: string) => {
    setError(null);
    try {
      const res = await apiFetch(`/appointments/${appointmentId}/reschedule/confirm`, {
        method: "POST",
        body: JSON.stringify({ organizationId: organization?.id }),
      });
      if (res.success) {
        setActionMessage("✓ New appointment time confirmed! Your schedule has been updated.");
        fetchAppointments();
      } else {
        setError(res.error?.message || "Failed to confirm reschedule proposal.");
      }
    } catch (err: any) {
      setError(err.message || "Network error while confirming proposal.");
    }
  };

  const handleDeclineProposal = async (appointmentId: string) => {
    setError(null);
    try {
      const res = await apiFetch(`/appointments/${appointmentId}/reschedule/decline`, {
        method: "POST",
        body: JSON.stringify({ organizationId: organization?.id }),
      });
      if (res.success) {
        setActionMessage("Reschedule proposal declined. Your original booking remains unchanged.");
        fetchAppointments();
      } else {
        setError(res.error?.message || "Failed to decline reschedule proposal.");
      }
    } catch (err: any) {
      setError(err.message || "Network error while declining proposal.");
    }
  };

  useEffect(() => {
    if (!tenant) return;
    apiFetch<OrganizationInfo>(`/organization/by-slug/${encodeURIComponent(tenant)}`).then((res) => {
      if (res.success && res.data) {
        setOrganization(res.data);
        if ((res.data as any).serverTime) {
          syncServerTime((res.data as any).serverTime);
        }
      }
    });
  }, [tenant]);

  const fetchBilling = useCallback(async () => {
    if (!tenant) return;
    setLoadingBilling(true);
    try {
      const res = await apiFetch<CustomerBillingData>(
        `/customer-portal/billing?tenantSlug=${encodeURIComponent(tenant)}`,
        { headers: { "x-tenant-slug": tenant } },
        organization?.id
      );
      if (res?.success && res?.data) {
        setBillingData(res.data);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoadingBilling(false);
    }
  }, [tenant, organization?.id]);

  const fetchWaitlistData = useCallback(async () => {
    if (!organization?.id) return;
    setLoadingWaitlist(true);
    try {
      const [offersRes, entriesRes] = await Promise.all([
        apiFetch<any[]>("/waitlist/offers/my", {}, organization.id),
        apiFetch<any[]>("/waitlist/entries", {}, organization.id),
      ]);
      if (offersRes?.success && Array.isArray(offersRes.data)) {
        setWaitlistOffers(offersRes.data);
      }
      if (entriesRes?.success && Array.isArray(entriesRes.data)) {
        setWaitlistEntries(entriesRes.data);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoadingWaitlist(false);
    }
  }, [organization?.id]);

  const handleJoinRescheduleWaitlist = async () => {
    if (!rescheduleModalAppt || !rescheduleDate || !organization?.id) return;
    setIsJoiningRescheduleWaitlist(true);
    setError(null);
    try {
      const res = await apiFetch<any>(
        "/waitlist/entries/smart-reschedule",
        {
          method: "POST",
          body: JSON.stringify({
            appointmentId: rescheduleModalAppt.id,
            targetDate: rescheduleDate,
            preferredTimeWindow: "ANY",
          }),
        },
        organization.id
      );

      if (res?.success) {
        setActionMessage("✓ Added to Priority Reschedule Waitlist! Your current appointment remains confirmed. If a slot opens up on that date, you'll receive a Fast-Pass offer immediately.");
        setRescheduleModalAppt(null);
        fetchWaitlistData();
        setActiveTab("waitlist");
      } else {
        setError(res?.error?.message || "Failed to join reschedule waitlist.");
      }
    } catch (err: any) {
      setError(err.message || "Network error while joining reschedule waitlist.");
    } finally {
      setIsJoiningRescheduleWaitlist(false);
    }
  };

  const fetchAppointments = async () => {
    if (!tenant) return;
    setLoading(true);
    setError(null);
    const res = await apiFetch<CustomerAppointment[]>(
      `/appointments?tenantSlug=${encodeURIComponent(tenant)}`,
      { headers: { "x-tenant-slug": tenant } }
    );
    const appts = Array.isArray(res)
      ? res
      : res?.success && Array.isArray(res.data)
      ? res.data
      : Array.isArray((res as any)?.data)
      ? (res as any).data
      : null;

    if (appts) {
      setAppointments(appts);
    } else {
      setError(res?.error?.message || "Your appointments could not be loaded.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAppointments();
    fetchBilling();
    fetchWaitlistData();
  }, [tenant, organization?.id, fetchBilling, fetchWaitlistData]);

  const getAppointmentPaymentStatus = (appt: CustomerAppointment) => {
    const records = appt.paymentRecords || [];
    if (records.length === 0) {
      if (appt.priceCents > 0) {
        return { label: "DUE AT VENUE", variant: "default" as const, color: "#94a3b8" };
      }
      return { label: "COMPLIMENTARY", variant: "default" as const, color: "#94a3b8" };
    }

    const allRefunds = records.flatMap((r) => r.refunds || []);
    const totalRefunded = allRefunds
      .filter((rf) => rf.status === "SUCCEEDED" || rf.status === "COMPLETED")
      .reduce((sum, rf) => sum + rf.amountCents, 0);

    const totalPaid = records
      .filter((r) => ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(r.status.toUpperCase()))
      .reduce((sum, r) => sum + r.amountCents, 0);

    if (records.some((r) => r.status.toUpperCase() === "REFUNDED") || (totalPaid > 0 && totalRefunded >= totalPaid)) {
      return {
        label: "REFUNDED",
        variant: "danger" as const,
        color: "#f87171",
        refundText: formatMoney(totalRefunded, appt.currency),
      };
    }

    if (totalRefunded > 0) {
      return {
        label: "PARTIAL REFUND",
        variant: "warning" as const,
        color: "#fbbf24",
        refundText: `${formatMoney(totalRefunded, appt.currency)} refunded`,
      };
    }

    const hasSucceeded = records.some((r) => r.status.toUpperCase() === "SUCCEEDED");
    if (hasSucceeded) {
      return {
        label: "PAID IN FULL",
        variant: "success" as const,
        color: "#34d399",
      };
    }

    return {
      label: "PAYMENT PENDING",
      variant: "info" as const,
      color: "#38bdf8",
    };
  };

  const handleOpenInvoiceFromAppointment = (appt: CustomerAppointment) => {
    setSelectedInvoiceItem({
      id: appt.id,
      serviceName: appt.service?.name || "Service Appointment",
      staffName: appt.staff?.displayName || "Studio Specialist",
      startAt: appt.startAt,
      endAt: appt.endAt,
      priceCents: appt.priceCents,
      currency: appt.currency,
      paymentRecords: appt.paymentRecords || [],
      status: appt.status,
      invoiceNumber: `INV-${appt.id.slice(0, 8).toUpperCase()}`,
      paymentMethod: appt.paymentRecords?.[0]?.paymentMethod || "Card on File",
      transactionId: appt.paymentRecords?.[0]?.stripePaymentIntentId || appt.paymentRecords?.[0]?.id || appt.id,
    });
  };

  const handleOpenInvoiceFromBilling = (tx: CustomerBillingTransaction) => {
    setSelectedInvoiceItem({
      id: tx.id,
      serviceName: tx.appointment?.service?.name || "Billed Service",
      staffName: tx.appointment?.staff?.displayName || "Staff Member",
      startAt: tx.appointment?.startAt || tx.createdAt,
      endAt: tx.appointment?.endAt || tx.createdAt,
      priceCents: tx.amountCents,
      currency: tx.currency,
      paymentRecords: [
        {
          id: tx.id,
          amountCents: tx.amountCents,
          currency: tx.currency,
          status: tx.status,
          paymentMethod: tx.paymentMethod,
          stripePaymentIntentId: tx.stripePaymentIntentId,
          createdAt: tx.createdAt,
          refunds: tx.refunds || [],
        },
      ],
      status: tx.status,
      invoiceNumber: `INV-${tx.id.slice(0, 8).toUpperCase()}`,
      paymentMethod: tx.paymentMethod,
      transactionId: tx.stripePaymentIntentId || tx.id,
    });
  };

  const openCancelModal = (appt: CustomerAppointment) => {
    setError(null);
    setActionMessage(null);
    setCancelModalAppt(appt);
  };

  const businessName = organization?.brandName || organization?.name || "Business Storefront";
  const accentColor = organization?.primaryColor || "#0284c7";

  const categorizedAppointments = useMemo(() => {
    const now = getServerNow();
    const upcoming: CustomerAppointment[] = [];
    const past: CustomerAppointment[] = [];
    const cancelled: CustomerAppointment[] = [];

    appointments.forEach((appt) => {
      const status = (appt.status || "").toUpperCase();
      const isCancelled = status === "CANCELLED";
      const isCompletedOrNoShow = status === "COMPLETED" || status === "NO_SHOW";
      const start = new Date(appt.startAt);

      if (isCancelled) {
        cancelled.push(appt);
      } else if (isCompletedOrNoShow) {
        past.push(appt);
      } else if (start >= now) {
        upcoming.push(appt);
      } else {
        past.push(appt);
      }
    });

    upcoming.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    past.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
    cancelled.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());

    return { upcoming, past, cancelled };
  }, [appointments]);

  const nextUpcoming = useMemo(() => {
    return (
      categorizedAppointments.upcoming.find(
        (a) => !["COMPLETED", "CANCELLED", "NO_SHOW"].includes((a.status || "").toUpperCase())
      ) || null
    );
  }, [categorizedAppointments.upcoming]);

  return (
    <CustomerPortalShell tenantInfo={organization} pageTitle={`My Appointments — ${businessName}`}>
      <div style={{ position: "relative", overflowX: "clip", paddingBottom: "80px" }}>
        <FloatingParticles count={10} />

        <div style={{ maxWidth: "1140px", margin: "0 auto", padding: "40px 24px 0", position: "relative", zIndex: 10 }}>
          {/* Header Breadcrumb & Title */}
          <div style={{ marginBottom: "36px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#94a3b8", fontSize: "13px", marginBottom: "12px" }}>
              <Link href={`/${tenant}`} style={{ color: "#38bdf8", textDecoration: "none", fontWeight: 700 }}>
                ← {businessName}
              </Link>
              <span>/</span>
              <span>Customer Account</span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "16px" }}>
              <div>
                <h1 style={{ fontSize: "clamp(2rem, 4vw, 2.8rem)", fontWeight: 850, color: "#f8fafc", letterSpacing: "-0.03em", margin: "0 0 6px" }}>
                  My Appointments
                </h1>
                <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>
                  Manage scheduled visits, download passes, and view booking history.
                </p>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={fetchAppointments}
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
                    cursor: "pointer",
                  }}
                >
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                  <span>Refresh</span>
                </button>

                <Link
                  href={`/${tenant}/book`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 18px",
                    borderRadius: "8px",
                    backgroundColor: accentColor,
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 800,
                    textDecoration: "none",
                    boxShadow: `0 4px 14px ${accentColor}40`,
                  }}
                >
                  <span>Book New</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>

          {/* Action Messages / Notifications */}
          {actionMessage && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "12px 18px",
                borderRadius: "10px",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(52, 211, 153, 0.35)",
                color: "#6ee7b7",
                fontSize: "13.5px",
                fontWeight: 700,
                marginBottom: "24px",
              }}
            >
              <CheckmarkDraw size={24} />
              <span>{actionMessage}</span>
            </div>
          )}

          {error && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "12px 18px",
                borderRadius: "10px",
                backgroundColor: "rgba(244, 63, 94, 0.15)",
                border: "1px solid rgba(244, 63, 94, 0.35)",
                color: "#fca5a5",
                fontSize: "13.5px",
                fontWeight: 700,
                marginBottom: "24px",
              }}
            >
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Active Fast-Pass / Waitlist Offer Alert Banner */}
          {waitlistOffers.length > 0 && (
            <div
              style={{
                marginBottom: "28px",
                padding: "20px 24px",
                borderRadius: "16px",
                background: "linear-gradient(135deg, rgba(245, 158, 11, 0.22) 0%, rgba(217, 119, 6, 0.12) 100%)",
                border: "1px solid rgba(245, 158, 11, 0.45)",
                boxShadow: "0 10px 30px rgba(245, 158, 11, 0.15)",
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    backgroundColor: "rgba(245, 158, 11, 0.25)",
                    border: "1px solid rgba(245, 158, 11, 0.5)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "22px",
                  }}
                >
                  ⚡
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 850,
                        padding: "2px 8px",
                        borderRadius: "9999px",
                        backgroundColor: "#f59e0b",
                        color: "#0f172a",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      PRIORITY FAST-PASS OFFER READY
                    </span>
                    <span style={{ fontSize: "12px", color: "#fbbf24", fontWeight: 700 }}>
                      {waitlistOffers.length === 1 ? "1 Slot Waiting" : `${waitlistOffers.length} Slots Waiting`}
                    </span>
                  </div>
                  <h3 style={{ fontSize: "16px", fontWeight: 850, color: "#fff", margin: 0 }}>
                    {waitlistOffers[0].serviceName || "Specialist Session"} on{" "}
                    {new Date(waitlistOffers[0].offeredStartAt).toLocaleDateString([], {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    at{" "}
                    {new Date(waitlistOffers[0].offeredStartAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </h3>
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <Link
                  href={`/${tenant}/waitlist`}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "10px",
                    backgroundColor: "#f59e0b",
                    color: "#0f172a",
                    fontSize: "13.5px",
                    fontWeight: 850,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    boxShadow: "0 4px 14px rgba(245, 158, 11, 0.4)",
                  }}
                >
                  <span>Claim in Fast-Pass Hub</span>
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          )}

          {/* Next Upcoming Appointment Highlight Banner */}
          {nextUpcoming && (
            <GlassCard
              variant="hero"
              glow="primary"
              depth3D
              style={{
                padding: "28px 32px",
                marginBottom: "36px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "24px",
                alignItems: "center",
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "3px 10px",
                    borderRadius: "9999px",
                    backgroundColor: "rgba(56, 189, 248, 0.15)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    color: "#38bdf8",
                    fontSize: "11.5px",
                    fontWeight: 800,
                    marginBottom: "10px",
                  }}
                >
                  <PulsingDot color="#38bdf8" size={5} />
                  <span>NEXT UPCOMING VISIT</span>
                </div>

                <h2 style={{ fontSize: "22px", fontWeight: 850, color: "#f8fafc", margin: "0 0 8px" }}>
                  {nextUpcoming.service?.name || "Booked Appointment"}
                </h2>

                <div style={{ display: "grid", gap: "6px", color: "#cbd5e1", fontSize: "13.5px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Calendar size={16} color="#38bdf8" />
                    <strong style={{ color: "#f8fafc" }}>
                      {new Intl.DateTimeFormat("en-US", {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }).format(new Date(nextUpcoming.startAt))}
                    </strong>
                    <span>at</span>
                    <strong style={{ color: "#f8fafc" }}>
                      {new Intl.DateTimeFormat("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(nextUpcoming.startAt))}
                    </strong>
                  </div>

                  {nextUpcoming.staff && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <User size={16} color="#38bdf8" />
                      <span>Specialist: {nextUpcoming.staff.displayName}</span>
                    </div>
                  )}

                  {nextUpcoming.location && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <MapPin size={16} color="#38bdf8" />
                      <span>{nextUpcoming.location.name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons for Next Visit */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "flex-start" }}>
                <button
                  onClick={() => setSelectedPassAppt(nextUpcoming)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 18px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(56, 189, 248, 0.2)",
                    border: "1px solid rgba(56, 189, 248, 0.4)",
                    color: "#f8fafc",
                    fontSize: "13.5px",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  <QrCode size={16} color="#38bdf8" />
                  <span>Check-in Pass</span>
                </button>

                <button
                  onClick={() => downloadIcsCalendar(nextUpcoming, businessName)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 16px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#f8fafc",
                    fontSize: "13.5px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <Download size={15} />
                  <span>Add to Calendar</span>
                </button>
              </div>

              {/* Studio Proposed Reschedule Banner in Hero */}
              {nextUpcoming.metadata?.rescheduleProposal?.status === "PENDING_CUSTOMER_CONFIRMATION" && (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    padding: "16px 20px",
                    borderRadius: "12px",
                    backgroundColor: "rgba(245, 158, 11, 0.15)",
                    border: "1px solid rgba(245, 158, 11, 0.4)",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#fbbf24", fontWeight: 850, fontSize: "14px" }}>
                    <span>🗓️</span>
                    <span>Studio Proposed a New Time for This Visit</span>
                  </div>
                  <div style={{ fontSize: "13px", color: "#f8fafc", lineHeight: "1.5" }}>
                    Proposed new time:{" "}
                    <strong style={{ color: "#38bdf8", fontSize: "14px" }}>
                      {new Date(nextUpcoming.metadata.rescheduleProposal.proposedStartAt).toLocaleString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </strong>
                    {nextUpcoming.metadata.rescheduleProposal.proposedStaffName && (
                      <span style={{ color: "#94a3b8" }}> with {nextUpcoming.metadata.rescheduleProposal.proposedStaffName}</span>
                    )}
                    {nextUpcoming.metadata.rescheduleProposal.reason && (
                      <div style={{ fontStyle: "italic", color: "#cbd5e1", marginTop: "4px" }}>
                        "{nextUpcoming.metadata.rescheduleProposal.reason}"
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                    <button
                      onClick={() => handleConfirmProposal(nextUpcoming.id)}
                      style={{
                        padding: "10px 18px",
                        borderRadius: "8px",
                        backgroundColor: "#10b981",
                        color: "#022c22",
                        border: "none",
                        fontWeight: 850,
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      ✓ Accept New Time
                    </button>
                    <button
                      onClick={() => handleDeclineProposal(nextUpcoming.id)}
                      style={{
                        padding: "10px 18px",
                        borderRadius: "8px",
                        backgroundColor: "rgba(255, 255, 255, 0.08)",
                        color: "#94a3b8",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        fontWeight: 700,
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      ✕ Decline
                    </button>
                  </div>
                </div>
              )}
            </GlassCard>
          )}

          {/* Metric Summary Counters */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
              marginBottom: "36px",
            }}
          >
            <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "18px" }}>
              <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
                Upcoming Visits
              </span>
              <strong style={{ fontSize: "28px", color: "#38bdf8", display: "block", marginTop: "4px", fontWeight: 900 }}>
                {categorizedAppointments.upcoming.length}
              </strong>
            </GlassCard>

            <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "18px" }}>
              <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
                Completed Visits
              </span>
              <strong style={{ fontSize: "28px", color: "#34d399", display: "block", marginTop: "4px", fontWeight: 900 }}>
                {categorizedAppointments.past.length}
              </strong>
            </GlassCard>

            <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "18px" }}>
              <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
                Cancelled Records
              </span>
              <strong style={{ fontSize: "28px", color: "#94a3b8", display: "block", marginTop: "4px", fontWeight: 900 }}>
                {categorizedAppointments.cancelled.length}
              </strong>
            </GlassCard>
          </div>

          {/* Segmented Filter Tabs */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              gap: "4px",
              marginBottom: "24px",
            }}
          >
            {[
              { key: "upcoming", label: "Upcoming", count: categorizedAppointments.upcoming.length },
              { key: "past", label: "Completed / Past", count: categorizedAppointments.past.length },
              { key: "cancelled", label: "Cancelled", count: categorizedAppointments.cancelled.length },
              { key: "billing", label: "Billing & Invoices", count: billingData?.transactions?.length ?? 0 },
              { key: "waitlist", label: "Waitlist & Fast-Pass", count: waitlistEntries.length + waitlistOffers.length },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 18px",
                  border: "none",
                  borderBottom: activeTab === tab.key ? `2px solid ${accentColor}` : "2px solid transparent",
                  backgroundColor: "transparent",
                  color: activeTab === tab.key ? "#f8fafc" : "#94a3b8",
                  fontSize: "14px",
                  fontWeight: activeTab === tab.key ? 800 : 600,
                  cursor: "pointer",
                }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 800,
                    padding: "2px 6px",
                    borderRadius: "9999px",
                    backgroundColor: activeTab === tab.key ? `${accentColor}30` : "rgba(255, 255, 255, 0.08)",
                    color: activeTab === tab.key ? accentColor : "#94a3b8",
                  }}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Tab Content Switching */}
          {activeTab === "waitlist" ? (
            <div style={{ display: "grid", gap: "24px" }}>
              {/* Header & Quick Action */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <h3 style={{ fontSize: "18px", fontWeight: 850, color: "#f8fafc", margin: 0 }}>
                    Priority Waitlist & Fast-Pass Requests
                  </h3>
                  <p style={{ fontSize: "13px", color: "#94a3b8", margin: "4px 0 0" }}>
                    Track pending offers, queue seniority, and active slot recovery requests.
                  </p>
                </div>
                <Link
                  href={`/${tenant}/waitlist`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    backgroundColor: "#f59e0b",
                    color: "#0f172a",
                    fontSize: "13px",
                    fontWeight: 850,
                    textDecoration: "none",
                  }}
                >
                  <span>Open Full Waitlist Hub</span>
                  <ArrowRight size={14} />
                </Link>
              </div>

              {/* Active Offers Section */}
              {waitlistOffers.length > 0 && (
                <div style={{ display: "grid", gap: "14px" }}>
                  <div style={{ fontSize: "12px", color: "#fbbf24", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    ⚡ Pending Fast-Pass Offers (Action Required)
                  </div>
                  {waitlistOffers.map((offer) => (
                    <GlassCard
                      key={offer.id}
                      variant="card"
                      glow="accent"
                      depth3D
                      style={{
                        padding: "20px 24px",
                        border: "1px solid rgba(245, 158, 11, 0.4)",
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "16px",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                          <span
                            style={{
                              fontSize: "10.5px",
                              fontWeight: 800,
                              padding: "2px 7px",
                              borderRadius: "4px",
                              backgroundColor: "#f59e0b",
                              color: "#0f172a",
                            }}
                          >
                            SLOT HELD (15M WINDOW)
                          </span>
                          <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                            Expires at {new Date(offer.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </div>
                        <h4 style={{ fontSize: "16px", fontWeight: 800, color: "#f8fafc", margin: "0 0 4px" }}>
                          {offer.serviceName || "Requested Session"}
                        </h4>
                        <div style={{ fontSize: "13px", color: "#cbd5e1" }}>
                          {new Date(offer.offeredStartAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} at{" "}
                          <strong style={{ color: "#38bdf8" }}>
                            {new Date(offer.offeredStartAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </strong>
                          {offer.staffName ? ` with ${offer.staffName}` : ""}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "10px" }}>
                        <Link
                          href={`/${tenant}/waitlist`}
                          style={{
                            padding: "8px 16px",
                            borderRadius: "8px",
                            backgroundColor: "#10b981",
                            color: "#022c22",
                            fontWeight: 850,
                            fontSize: "13px",
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                        >
                          <span>Claim Slot</span>
                          <CheckCircle2 size={14} />
                        </Link>
                        <Link
                          href={`/offers/${offer.token}`}
                          style={{
                            padding: "8px 14px",
                            borderRadius: "8px",
                            backgroundColor: "rgba(255, 255, 255, 0.08)",
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            color: "#cbd5e1",
                            fontWeight: 700,
                            fontSize: "13px",
                            textDecoration: "none",
                          }}
                        >
                          View Direct Offer
                        </Link>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}

              {/* Active Queue Entries */}
              {loadingWaitlist ? (
                <div style={{ display: "grid", placeItems: "center", padding: "40px 0" }}>
                  <ClockSpinner size={28} />
                  <p style={{ color: "#94a3b8", fontSize: "13px", marginTop: "10px" }}>Loading queue position…</p>
                </div>
              ) : waitlistEntries.length === 0 && waitlistOffers.length === 0 ? (
                <GlassCard variant="panel" style={{ padding: "48px 24px", textAlign: "center", border: "1px dashed rgba(255, 255, 255, 0.12)" }}>
                  <CalendarPulse size={44} />
                  <h4 style={{ color: "#f8fafc", fontSize: "16px", fontWeight: 800, margin: "14px 0 6px" }}>
                    No Active Waitlist Requests
                  </h4>
                  <p style={{ color: "#94a3b8", fontSize: "13px", maxWidth: "420px", margin: "0 auto 18px", lineHeight: "1.4" }}>
                    When dates or specialists are fully booked, join the Priority Waitlist. The Schedule Optimizer will instantly offer you openings the moment cancellations occur.
                  </p>
                  <Link
                    href={`/${tenant}/waitlist`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "9px 18px",
                      borderRadius: "8px",
                      backgroundColor: "#f59e0b",
                      color: "#0f172a",
                      fontSize: "13px",
                      fontWeight: 850,
                      textDecoration: "none",
                    }}
                  >
                    <span>Join Priority Waitlist</span>
                    <ArrowRight size={14} />
                  </Link>
                </GlassCard>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Active Queue Registrations ({waitlistEntries.length})
                  </div>
                  {waitlistEntries.map((entry) => (
                    <GlassCard key={entry.id} variant="card" glow="subtle" depth3D style={{ padding: "18px 22px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 800,
                                padding: "2px 7px",
                                borderRadius: "4px",
                                backgroundColor: entry.status === "OFFERED" ? "rgba(245, 158, 11, 0.2)" : "rgba(56, 189, 248, 0.15)",
                                color: entry.status === "OFFERED" ? "#fbbf24" : "#38bdf8",
                                border: `1px solid ${entry.status === "OFFERED" ? "rgba(245, 158, 11, 0.3)" : "rgba(56, 189, 248, 0.25)"}`,
                              }}
                            >
                              {entry.status === "OFFERED" ? "⚡ OFFER DISPATCHED" : "● IN QUEUE"}
                            </span>
                            {entry.preferredTimeWindow && (
                              <span style={{ fontSize: "11.5px", color: "#94a3b8" }}>
                                Window: <strong>{entry.preferredTimeWindow}</strong>
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "15px", fontWeight: 800, color: "#f8fafc" }}>
                            {entry.service?.name || "Service Request"}
                          </div>
                          <div style={{ fontSize: "12.5px", color: "#cbd5e1", marginTop: "4px" }}>
                            Target Window:{" "}
                            <strong>
                              {new Date(entry.requestedStartDate).toLocaleDateString([], { month: "short", day: "numeric" })}
                              {" - "}
                              {new Date(entry.requestedEndDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                            </strong>
                            {entry.staff && <span> • Specialist: {entry.staff.displayName}</span>}
                          </div>
                          {entry.notes && (
                            <div style={{ fontSize: "12px", color: "#94a3b8", fontStyle: "italic", marginTop: "4px" }}>
                              "{entry.notes}"
                            </div>
                          )}
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>Registered</span>
                          <span style={{ fontSize: "12px", color: "#cbd5e1" }}>
                            {new Date(entry.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === "billing" ? (
            <div style={{ display: "grid", gap: "24px" }}>
              {/* Executive Financial Highlights */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "16px",
                }}
              >
                <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "18px 20px" }}>
                  <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                    Lifetime Invested
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: 850, color: "#f8fafc", letterSpacing: "-0.02em" }}>
                    {formatMoney(billingData?.summary?.totalSpentCents ?? 0, billingData?.customer?.currency || "USD")}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                    Gross billed service charges
                  </div>
                </GlassCard>

                <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "18px 20px" }}>
                  <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                    Refunds & Credits
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: 850, color: (billingData?.summary?.totalRefundedCents ?? 0) > 0 ? "#f87171" : "#f8fafc", letterSpacing: "-0.02em" }}>
                    {formatMoney(billingData?.summary?.totalRefundedCents ?? 0, billingData?.customer?.currency || "USD")}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                    {(billingData?.summary?.totalRefundedCents ?? 0) > 0 ? "Credited back to payment method" : "Zero clawbacks / zero disputes"}
                  </div>
                </GlassCard>

                <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "18px 20px" }}>
                  <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                    Net Paid & Settled
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: 850, color: "#34d399", letterSpacing: "-0.02em" }}>
                    {formatMoney(billingData?.summary?.netPaidCents ?? 0, billingData?.customer?.currency || "USD")}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                    Net balance verified in ledger
                  </div>
                </GlassCard>

                <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "18px 20px" }}>
                  <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                    Invoiced Bookings
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: 850, color: "#38bdf8", letterSpacing: "-0.02em" }}>
                    {billingData?.summary?.totalAppointments ?? appointments.length}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                    Total appointments on file
                  </div>
                </GlassCard>
              </div>

              {/* Invoices & Payment Ledger Table */}
              <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", flexWrap: "wrap", gap: "12px" }}>
                  <div>
                    <h3 style={{ fontSize: "17px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                      Official Invoices & Payment Ledger
                    </h3>
                    <p style={{ fontSize: "13px", color: "#94a3b8", margin: "4px 0 0" }}>
                      Cryptographically signed tax invoices, payment records, and studio refund receipts.
                    </p>
                  </div>
                  <button
                    onClick={fetchBilling}
                    disabled={loadingBilling}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "7px 14px",
                      borderRadius: "6px",
                      backgroundColor: "rgba(255, 255, 255, 0.06)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#cbd5e1",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <RefreshCw size={13} className={loadingBilling ? "animate-spin" : ""} />
                    <span>Refresh Ledger</span>
                  </button>
                </div>

                {loadingBilling ? (
                  <div style={{ display: "grid", placeItems: "center", padding: "40px 0" }}>
                    <ClockSpinner size={28} />
                    <p style={{ color: "#94a3b8", fontSize: "13px", marginTop: "10px" }}>Loading financial records…</p>
                  </div>
                ) : !billingData?.transactions || billingData.transactions.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "36px 16px", color: "#94a3b8" }}>
                    <FileText size={36} color="#64748b" style={{ margin: "0 auto 12px" }} />
                    <h4 style={{ color: "#f8fafc", fontSize: "15px", fontWeight: 700, margin: "0 0 6px" }}>
                      No transaction records found
                    </h4>
                    <p style={{ fontSize: "13px", maxWidth: "420px", margin: "0 auto" }}>
                      Completed bookings with online payment or front-desk settlements will generate tax receipts automatically here.
                    </p>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "#94a3b8" }}>
                          <th style={{ padding: "10px 14px", fontWeight: 700 }}>Date</th>
                          <th style={{ padding: "10px 14px", fontWeight: 700 }}>Service & Specialist</th>
                          <th style={{ padding: "10px 14px", fontWeight: 700 }}>Reference</th>
                          <th style={{ padding: "10px 14px", fontWeight: 700 }}>Method</th>
                          <th style={{ padding: "10px 14px", fontWeight: 700 }}>Amount</th>
                          <th style={{ padding: "10px 14px", fontWeight: 700 }}>Status</th>
                          <th style={{ padding: "10px 14px", fontWeight: 700, textAlign: "right" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billingData.transactions.map((tx) => {
                          const totalRefunded = (tx.refunds || []).reduce((acc, r) => acc + (r.amountCents || 0), 0);
                          const isFullRefund = tx.status === "REFUNDED" || (totalRefunded >= tx.amountCents && totalRefunded > 0);
                          const isPartialRefund = !isFullRefund && totalRefunded > 0;

                          return (
                            <tr
                              key={tx.id}
                              style={{
                                borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                                color: "#cbd5e1",
                              }}
                            >
                              <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                                {new Date(tx.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                              </td>
                              <td style={{ padding: "12px 14px" }}>
                                <div style={{ fontWeight: 700, color: "#f8fafc" }}>
                                  {tx.appointment?.service?.name || "Service Appointment"}
                                </div>
                                {tx.appointment?.staff && (
                                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                                    with {tx.appointment.staff.displayName}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: "12px 14px" }}>
                                <code style={{ fontSize: "11px", color: "#38bdf8", backgroundColor: "rgba(56, 189, 248, 0.1)", padding: "2px 6px", borderRadius: "4px" }}>
                                  INV-{tx.id.slice(0, 8).toUpperCase()}
                                </code>
                              </td>
                              <td style={{ padding: "12px 14px", textTransform: "capitalize" }}>
                                {tx.paymentMethod || "Card"}
                              </td>
                              <td style={{ padding: "12px 14px", fontWeight: 700, color: "#f8fafc" }}>
                                <div>{formatMoney(tx.amountCents, tx.currency)}</div>
                                {totalRefunded > 0 && (
                                  <div style={{ fontSize: "11px", color: "#f87171" }}>
                                    -{formatMoney(totalRefunded, tx.currency)} ref.
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: "12px 14px" }}>
                                {isFullRefund ? (
                                  <GlassBadge variant="danger" size="sm">REFUNDED</GlassBadge>
                                ) : isPartialRefund ? (
                                  <GlassBadge variant="warning" size="sm">PARTIAL REFUND</GlassBadge>
                                ) : (
                                  <GlassBadge variant="success" size="sm">PAID</GlassBadge>
                                )}
                              </td>
                              <td style={{ padding: "12px 14px", textAlign: "right" }}>
                                <button
                                  onClick={() => handleOpenInvoiceFromBilling(tx)}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "5px",
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
                                  <FileText size={13} />
                                  <span>Invoice</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </GlassCard>
            </div>
          ) : loading ? (
            <div style={{ display: "grid", placeItems: "center", padding: "60px 0" }}>
              <ClockSpinner size={32} />
              <p style={{ color: "#94a3b8", fontSize: "13px", marginTop: "12px" }}>Loading appointments…</p>
            </div>
          ) : categorizedAppointments[activeTab]?.length > 0 ? (
            <div style={{ display: "grid", gap: "16px" }}>
              {categorizedAppointments[activeTab].map((appt) => {
                const payStatus = getAppointmentPaymentStatus(appt);
                return (
                  <GlassCard key={appt.id} variant="card" glow="subtle" depth3D style={{ padding: "22px 26px" }}>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "16px",
                      }}
                    >
                      <div style={{ display: "grid", gap: "8px", flex: 1, minWidth: "260px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                          <h3 style={{ fontSize: "17px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                            {appt.service?.name || "Service Appointment"}
                          </h3>
                          <GlassBadge
                            variant={
                              appt.status.toUpperCase() === "CONFIRMED"
                                ? "success"
                                : appt.status.toUpperCase() === "CANCELLED"
                                ? "default"
                                : "info"
                            }
                            size="sm"
                          >
                            {appt.status.toUpperCase()}
                          </GlassBadge>
                          <GlassBadge variant={payStatus.variant} size="sm">
                            {payStatus.label}
                          </GlassBadge>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "18px",
                            color: "#cbd5e1",
                            fontSize: "13px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <Calendar size={15} color="#38bdf8" />
                            <span>
                              {new Intl.DateTimeFormat("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }).format(new Date(appt.startAt))}
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <Clock size={15} color="#38bdf8" />
                            <span>
                              {new Intl.DateTimeFormat("en-US", {
                                hour: "numeric",
                                minute: "2-digit",
                              }).format(new Date(appt.startAt))}
                              {" - "}
                              {new Intl.DateTimeFormat("en-US", {
                                hour: "numeric",
                                minute: "2-digit",
                              }).format(new Date(appt.endAt))}
                            </span>
                          </div>

                          {appt.staff && (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <User size={15} color="#38bdf8" />
                              <span>{appt.staff.displayName}</span>
                            </div>
                          )}

                          {appt.location && (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <MapPin size={15} color="#38bdf8" />
                              <span>
                                {appt.location.name}
                                {appt.location.address ? ` — ${appt.location.address}${appt.location.city ? `, ${appt.location.city}` : ""}` : ""}
                              </span>
                            </div>
                          )}
                        </div>

                        <div style={{ fontSize: "12px", color: "#64748b", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
                          <span>Ref: <code style={{ color: "#94a3b8" }}>{appt.id}</code></span>
                          <span>Amount: <strong style={{ color: "#f8fafc" }}>{formatMoney(appt.priceCents, appt.currency)}</strong></span>
                          {payStatus.refundText && (
                            <span style={{ color: payStatus.color, fontWeight: 700 }}>
                              • {payStatus.refundText}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                        <button
                          onClick={() => setSelectedPassAppt(appt)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "7px 12px",
                            borderRadius: "6px",
                            backgroundColor: "rgba(56, 189, 248, 0.12)",
                            border: "1px solid rgba(56, 189, 248, 0.3)",
                            color: "#38bdf8",
                            fontSize: "12.5px",
                            fontWeight: 750,
                            cursor: "pointer",
                          }}
                        >
                          <QrCode size={14} />
                          <span>Pass</span>
                        </button>

                        <button
                          onClick={() => downloadIcsCalendar(appt, businessName)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "7px 12px",
                            borderRadius: "6px",
                            backgroundColor: "rgba(255, 255, 255, 0.06)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            color: "#cbd5e1",
                            fontSize: "12.5px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <Download size={14} />
                          <span>ICS</span>
                        </button>

                        <button
                          onClick={() => handleOpenInvoiceFromAppointment(appt)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "7px 12px",
                            borderRadius: "6px",
                            backgroundColor: "rgba(255, 255, 255, 0.06)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            color: "#cbd5e1",
                            fontSize: "12.5px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <FileText size={14} color="#38bdf8" />
                          <span>Receipt</span>
                        </button>

                        {activeTab === "upcoming" && (
                          <>
                            <button
                              onClick={() => {
                                setRescheduleModalAppt(appt);
                                setRescheduleDate(new Date(appt.startAt).toISOString().split("T")[0]);
                              }}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "7px 12px",
                                borderRadius: "6px",
                                backgroundColor: "rgba(56, 189, 248, 0.1)",
                                border: "1px solid rgba(56, 189, 248, 0.25)",
                                color: "#38bdf8",
                                fontSize: "12.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              <Calendar size={14} />
                              <span>Reschedule</span>
                            </button>

                            <button
                              onClick={() => openCancelModal(appt)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "7px 12px",
                                borderRadius: "6px",
                                backgroundColor: "rgba(244, 63, 94, 0.1)",
                                border: "1px solid rgba(244, 63, 94, 0.25)",
                                color: "#fca5a5",
                                fontSize: "12.5px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              <XCircle size={14} />
                              <span>Cancel</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Studio Proposed Reschedule Interactive Card */}
                    {appt.metadata?.rescheduleProposal?.status === "PENDING_CUSTOMER_CONFIRMATION" && (
                      <div
                        style={{
                          marginTop: "16px",
                          padding: "16px 18px",
                          borderRadius: "12px",
                          backgroundColor: "rgba(245, 158, 11, 0.12)",
                          border: "1px solid rgba(245, 158, 11, 0.4)",
                          display: "grid",
                          gap: "10px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#fbbf24", fontWeight: 800, fontSize: "13.5px" }}>
                          <span>🗓️</span>
                          <span>Studio Proposed a Reschedule for Your Visit</span>
                        </div>
                        <div style={{ fontSize: "13px", color: "#f8fafc", lineHeight: "1.4" }}>
                          Proposed new time:{" "}
                          <strong style={{ color: "#38bdf8", fontSize: "14px" }}>
                            {new Date(appt.metadata.rescheduleProposal.proposedStartAt).toLocaleString([], {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </strong>
                          {appt.metadata.rescheduleProposal.proposedStaffName && (
                            <span style={{ color: "#94a3b8" }}> with {appt.metadata.rescheduleProposal.proposedStaffName}</span>
                          )}
                          {appt.metadata.rescheduleProposal.reason && (
                            <div style={{ fontStyle: "italic", color: "#cbd5e1", marginTop: "4px" }}>
                              "{appt.metadata.rescheduleProposal.reason}"
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                          <button
                            onClick={() => handleConfirmProposal(appt.id)}
                            style={{
                              padding: "9px 16px",
                              borderRadius: "8px",
                              backgroundColor: "#10b981",
                              color: "#022c22",
                              border: "none",
                              fontWeight: 850,
                              fontSize: "13px",
                              cursor: "pointer",
                            }}
                          >
                            ✓ Accept New Time
                          </button>
                          <button
                            onClick={() => handleDeclineProposal(appt.id)}
                            style={{
                              padding: "9px 16px",
                              borderRadius: "8px",
                              backgroundColor: "rgba(255, 255, 255, 0.08)",
                              color: "#94a3b8",
                              border: "1px solid rgba(255, 255, 255, 0.15)",
                              fontWeight: 700,
                              fontSize: "13px",
                              cursor: "pointer",
                            }}
                          >
                            ✕ Decline
                          </button>
                        </div>
                      </div>
                    )}
                  </GlassCard>
                );
              })}
            </div>
          ) : (
            <GlassCard
              variant="panel"
              style={{
                padding: "48px 24px",
                textAlign: "center",
                border: "1px dashed rgba(255, 255, 255, 0.12)",
              }}
            >
              <CalendarPulse size={48} />
              <h3 style={{ color: "#f8fafc", fontSize: "17px", fontWeight: 800, margin: "16px 0 6px" }}>
                No {activeTab} appointments
              </h3>
              <p style={{ color: "#94a3b8", fontSize: "13.5px", margin: "0 0 20px" }}>
                You do not have any appointments recorded under this category.
              </p>
              <Link
                href={`/${tenant}/book`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 20px",
                  borderRadius: "8px",
                  backgroundColor: accentColor,
                  color: "#fff",
                  fontSize: "13.5px",
                  fontWeight: 800,
                  textDecoration: "none",
                }}
              >
                <span>Book Service Now</span>
              </Link>
            </GlassCard>
          )}

          {/* ========================================================================= */}
          {/* STUDIO DEALS & AVAILABLE PERKS */}
          {/* ========================================================================= */}
          {offers.length > 0 && (
            <div style={{ marginTop: "48px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <Tag size={20} color="#38bdf8" />
                <h2 style={{ color: "#f8fafc", fontSize: "19px", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
                  Studio Perks & Active Deals
                </h2>
              </div>
              <p style={{ color: "#94a3b8", fontSize: "13.5px", margin: "0 0 20px" }}>
                Special promotions and discounts offered exclusively by {organization?.name || "this studio"}. Use these codes during checkout or book directly.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "16px",
                }}
              >
                {offers.map((offer) => (
                  <GlassCard
                    key={offer.id}
                    variant="card"
                    glow="subtle"
                    depth3D
                    style={{
                      padding: "20px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      border: "1px solid rgba(56, 189, 248, 0.2)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 800,
                          color: "#38bdf8",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {offer.discountType === "PERCENTAGE" ? `${offer.discountValue}% OFF` : `$${(offer.discountValue / 100).toFixed(2)} OFF`}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          padding: "2px 8px",
                          borderRadius: "9999px",
                          backgroundColor: "rgba(52, 211, 153, 0.12)",
                          color: "#34d399",
                          border: "1px solid rgba(52, 211, 153, 0.3)",
                          fontWeight: 700,
                        }}
                      >
                        Active Deal
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(15, 23, 42, 0.6)", padding: "8px 12px", borderRadius: "8px", border: "1px dashed rgba(56, 189, 248, 0.3)" }}>
                      <strong style={{ fontFamily: "monospace", fontSize: "16px", color: "#f8fafc", letterSpacing: "1px" }}>
                        {offer.code}
                      </strong>
                      <button
                        onClick={() => handleCopyOfferCode(offer.code)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: copiedOfferCode === offer.code ? "#34d399" : "#38bdf8",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "12px",
                          fontWeight: 700,
                        }}
                      >
                        {copiedOfferCode === offer.code ? (
                          <>
                            <Check size={13} /> Copied
                          </>
                        ) : (
                          <>
                            <Copy size={13} /> Copy Code
                          </>
                        )}
                      </button>
                    </div>

                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                      {offer.minSpendCents ? `Min spend $${(offer.minSpendCents / 100).toFixed(2)} · ` : ""}
                      {offer.validTo ? `Expires ${new Date(offer.validTo).toLocaleDateString()}` : "No expiration"}
                    </div>

                    <Link
                      href={`/${tenant}/book?coupon=${encodeURIComponent(offer.code)}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        marginTop: "8px",
                        padding: "8px 14px",
                        borderRadius: "6px",
                        backgroundColor: "rgba(56, 189, 248, 0.15)",
                        border: "1px solid rgba(56, 189, 248, 0.3)",
                        color: "#38bdf8",
                        fontSize: "12.5px",
                        fontWeight: 750,
                        textDecoration: "none",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span>Book with Offer</span>
                      <ArrowRight size={13} />
                    </Link>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* MARKETING & COMMUNICATION PREFERENCES */}
          {/* ========================================================================= */}
          <div style={{ marginTop: "40px" }}>
            <GlassCard
              variant="card"
              glow="subtle"
              depth3D
              style={{
                padding: "24px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
                <div style={{ maxWidth: "680px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                    <Mail size={18} color="#38bdf8" />
                    <h3 style={{ color: "#f8fafc", fontSize: "16px", fontWeight: 800, margin: 0 }}>
                      Communication & Marketing Preferences
                    </h3>
                  </div>
                  <p style={{ color: "#94a3b8", fontSize: "13px", margin: "0 0 12px", lineHeight: 1.6 }}>
                    Manage your email subscription for {organization?.name || "this studio"}. When opted in, you receive exclusive promotional discounts, seasonal perks, and studio announcements. Vital booking confirmations and reminders are always delivered regardless of marketing preferences.
                  </p>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px" }}>
                    <span style={{ color: "#64748b" }}>Status:</span>
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: "9999px",
                        fontSize: "11.5px",
                        fontWeight: 700,
                        backgroundColor: marketingConsent ? "rgba(52, 211, 153, 0.12)" : "rgba(148, 163, 184, 0.12)",
                        color: marketingConsent ? "#34d399" : "#94a3b8",
                        border: `1px solid ${marketingConsent ? "rgba(52, 211, 153, 0.3)" : "rgba(148, 163, 184, 0.3)"}`,
                      }}
                    >
                      {marketingConsent ? "✓ Subscribed to studio deals" : "Promotional emails paused"}
                    </span>
                    {consentUpdatedAt && (
                      <span style={{ color: "#64748b", fontSize: "11px" }}>
                        · Updated {new Date(consentUpdatedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <button
                    onClick={handleToggleMarketingConsent}
                    disabled={updatingConsent}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "9px 18px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: updatingConsent ? "not-allowed" : "pointer",
                      backgroundColor: marketingConsent ? "rgba(239, 68, 68, 0.12)" : "rgba(56, 189, 248, 0.15)",
                      color: marketingConsent ? "#f87171" : "#38bdf8",
                      border: `1px solid ${marketingConsent ? "rgba(239, 68, 68, 0.3)" : "rgba(56, 189, 248, 0.3)"}`,
                      transition: "all 0.15s ease",
                    }}
                  >
                    {updatingConsent
                      ? "Updating…"
                      : marketingConsent
                      ? "Unsubscribe from Deals"
                      : "Subscribe to Exclusive Deals"}
                  </button>
                </div>
              </div>
            </GlassCard>
          </div>
          {selectedPassAppt && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 60,
                backgroundColor: "rgba(0, 0, 0, 0.75)",
                backdropFilter: "blur(12px)",
                display: "grid",
                placeItems: "center",
                padding: "20px",
              }}
              onClick={() => setSelectedPassAppt(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  maxWidth: "420px",
                  width: "100%",
                  backgroundColor: "#0d1522",
                  border: "1px solid rgba(56, 189, 248, 0.35)",
                  borderRadius: "20px",
                  padding: "28px",
                  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.8)",
                  textAlign: "center",
                  position: "relative",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 10px",
                      borderRadius: "9999px",
                      fontSize: "11px",
                      fontWeight: 800,
                      backgroundColor:
                        selectedPassAppt.status === "CHECKED_IN"
                          ? "rgba(16, 185, 129, 0.15)"
                          : passData?.isEligibleNow
                          ? "rgba(56, 189, 248, 0.15)"
                          : "rgba(245, 158, 11, 0.15)",
                      color:
                        selectedPassAppt.status === "CHECKED_IN"
                          ? "#34d399"
                          : passData?.isEligibleNow
                          ? "#38bdf8"
                          : "#fbbf24",
                      border: `1px solid ${
                        selectedPassAppt.status === "CHECKED_IN"
                          ? "rgba(52, 211, 153, 0.3)"
                          : passData?.isEligibleNow
                          ? "rgba(56, 189, 248, 0.3)"
                          : "rgba(245, 158, 11, 0.3)"
                      }`,
                    }}
                  >
                    <PulsingDot
                      color={
                        selectedPassAppt.status === "CHECKED_IN"
                          ? "#34d399"
                          : passData?.isEligibleNow
                          ? "#38bdf8"
                          : "#fbbf24"
                      }
                      size={5}
                    />
                    <span>
                      {selectedPassAppt.status === "CHECKED_IN"
                        ? "CHECKED IN ON-SITE"
                        : passData?.isEligibleNow
                        ? "ARRIVAL WINDOW OPEN"
                        : "UPCOMING ARRIVAL"}
                    </span>
                  </span>

                  <button
                    onClick={() => setSelectedPassAppt(null)}
                    style={{ backgroundColor: "#1e293b", border: "none", color: "#94a3b8", width: "28px", height: "28px", borderRadius: "50%", cursor: "pointer", display: "grid", placeItems: "center" }}
                  >
                    ✕
                  </button>
                </div>

                <h3 style={{ fontSize: "20px", fontWeight: 850, color: "#f8fafc", margin: "0 0 4px" }}>
                  Digital Check-In Pass
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "12.5px", margin: "0 0 18px" }}>
                  Show this digital barcode pass upon arrival at {businessName}.
                </p>

                {/* Scannable Cryptographic QR Barcode */}
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
                  {loadingPass ? (
                    <div style={{ width: "200px", height: "200px", display: "grid", placeItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: "16px" }}>
                      <ClockSpinner size={32} />
                    </div>
                  ) : (
                    <QrDisplay
                      value={passData?.qrToken || `${selectedPassAppt.id}:${organization?.id}`}
                      size={190}
                      alt={`Pass for ${selectedPassAppt.service?.name || "Appointment"}`}
                    />
                  )}
                </div>

                {/* Self Check-in 1-Click Action & Pass Status */}
                {selectedPassAppt.status === "CHECKED_IN" ? (
                  <div
                    style={{
                      padding: "10px",
                      borderRadius: "10px",
                      backgroundColor: "rgba(16, 185, 129, 0.15)",
                      border: "1px solid rgba(52, 211, 153, 0.3)",
                      color: "#34d399",
                      fontWeight: 800,
                      fontSize: "13px",
                      marginBottom: "16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>You are checked in! Specialist notified.</span>
                  </div>
                ) : passData?.isVoid || selectedPassAppt.status === "CANCELLED" ? (
                  <div
                    style={{
                      padding: "10px",
                      borderRadius: "10px",
                      backgroundColor: "rgba(225, 29, 72, 0.15)",
                      border: "1px solid rgba(225, 29, 72, 0.3)",
                      color: "#fda4af",
                      fontWeight: 800,
                      fontSize: "13px",
                      marginBottom: "16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    <span>✕ Pass Void: Appointment Cancelled</span>
                  </div>
                ) : passData?.isExpired || selectedPassAppt.status === "NO_SHOW" ? (
                  <div
                    style={{
                      padding: "10px",
                      borderRadius: "10px",
                      backgroundColor: "rgba(217, 119, 6, 0.15)",
                      border: "1px solid rgba(217, 119, 6, 0.3)",
                      color: "#fcd34d",
                      fontWeight: 800,
                      fontSize: "13px",
                      marginBottom: "16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    <span>⚠️ Pass Expired: 5-Minute Grace Elapsed (No-Show)</span>
                  </div>
                ) : passData?.isEligibleNow ? (
                  <button
                    onClick={handleSelfCheckIn}
                    disabled={selfCheckingIn}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "10px",
                      backgroundColor: "#0284c7",
                      color: "#fff",
                      border: "none",
                      fontWeight: 800,
                      fontSize: "14px",
                      cursor: "pointer",
                      marginBottom: "16px",
                      boxShadow: "0 4px 14px rgba(2, 132, 199, 0.4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    {selfCheckingIn ? (
                      <>
                        <ClockSpinner size={16} />
                        <span>Verifying Arrival…</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>I've Arrived (Self Check-In)</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div
                    style={{
                      padding: "10px",
                      borderRadius: "10px",
                      backgroundColor: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      color: "#94a3b8",
                      fontSize: "12px",
                      marginBottom: "16px",
                    }}
                  >
                    Pass Inactive: Check-in opens 60 minutes before scheduled start time.
                  </div>
                )}

                {/* Session Card Info */}
                <div
                  style={{
                    backgroundColor: "rgba(15, 23, 42, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    padding: "16px",
                    textAlign: "left",
                    display: "grid",
                    gap: "8px",
                    fontSize: "13px",
                    marginBottom: "18px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b", fontSize: "11px" }}>SERVICE</span>
                    <strong style={{ color: "#f8fafc" }}>{selectedPassAppt.service?.name || "Service"}</strong>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b", fontSize: "11px" }}>WHEN</span>
                    <strong style={{ color: "#f8fafc" }}>
                      {new Intl.DateTimeFormat("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(selectedPassAppt.startAt))}
                    </strong>
                  </div>

                  {selectedPassAppt.staff && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#64748b", fontSize: "11px" }}>SPECIALIST</span>
                      <span style={{ color: "#38bdf8", fontWeight: 700 }}>{selectedPassAppt.staff.displayName}</span>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b", fontSize: "11px" }}>BOOKING ID</span>
                    <code style={{ color: "#94a3b8", fontSize: "12px" }}>{selectedPassAppt.id.slice(0, 16)}…</code>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedPassAppt(null)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.14)",
                    color: "#f8fafc",
                    fontSize: "13.5px",
                    fontWeight: 750,
                    cursor: "pointer",
                  }}
                >
                  Close Pass
                </button>
              </div>
            </div>
          )}

          {/* Customer Self-Service Reschedule Modal */}
          {rescheduleModalAppt && (() => {
            const hoursRemaining = (new Date(rescheduleModalAppt.startAt).getTime() - Date.now()) / (1000 * 60 * 60);
            const isPolicyLocked = hoursRemaining < 24;

            return (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 60,
                  backgroundColor: "rgba(0, 0, 0, 0.75)",
                  backdropFilter: "blur(6px)",
                  display: "grid",
                  placeItems: "center",
                  padding: "20px",
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget && !isRescheduling) setRescheduleModalAppt(null);
                }}
              >
                <div
                  style={{
                    maxWidth: "480px",
                    width: "100%",
                    backgroundColor: "#0d1522",
                    border: "1px solid rgba(56, 189, 248, 0.35)",
                    borderRadius: "20px",
                    padding: "28px",
                    boxShadow: "0 24px 60px rgba(0, 0, 0, 0.8)",
                    textAlign: "left",
                    position: "relative",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h3 style={{ fontSize: "18px", fontWeight: 850, color: "#f8fafc", margin: 0 }}>
                      Reschedule Appointment
                    </h3>
                    <button
                      onClick={() => !isRescheduling && setRescheduleModalAppt(null)}
                      style={{ backgroundColor: "#1e293b", border: "none", color: "#94a3b8", width: "28px", height: "28px", borderRadius: "50%", cursor: "pointer" }}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{ fontSize: "13px", color: "#cbd5e1", marginBottom: "14px" }}>
                    Current booking: <strong style={{ color: "#f8fafc" }}>{rescheduleModalAppt.service?.name}</strong> on{" "}
                    <strong>{new Date(rescheduleModalAppt.startAt).toLocaleDateString()}</strong> at{" "}
                    <strong>{new Date(rescheduleModalAppt.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>.
                  </div>

                  {/* Policy notice */}
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: 600,
                      marginBottom: "16px",
                      backgroundColor: isPolicyLocked ? "rgba(245, 158, 11, 0.15)" : "rgba(56, 189, 248, 0.1)",
                      border: `1px solid ${isPolicyLocked ? "rgba(245, 158, 11, 0.3)" : "rgba(56, 189, 248, 0.2)"}`,
                      color: isPolicyLocked ? "#fbbf24" : "#38bdf8",
                    }}
                  >
                    {isPolicyLocked ? (
                      <div>
                        <strong>Notice:</strong> Online self-reschedule is locked within 24 hours of scheduled appointment. Please contact {businessName} directly to request changes.
                      </div>
                    ) : (
                      <div>
                        <strong>Notice:</strong> You can freely select any available authoritative time slot. Please reschedule at least 24 hours prior.
                      </div>
                    )}
                  </div>

                  {!isPolicyLocked && (
                    <>
                      {/* One-Click Fully Automated Reschedule Engine */}
                      <div
                        style={{
                          padding: "12px 14px",
                          borderRadius: "10px",
                          backgroundColor: "rgba(14, 165, 233, 0.12)",
                          border: "1px solid rgba(14, 165, 233, 0.35)",
                          marginBottom: "16px",
                          display: "grid",
                          gap: "8px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "#38bdf8", fontSize: "12.5px", fontWeight: 800 }}>
                            ⚡ Automated Schedule Engine
                          </span>
                          <span style={{ fontSize: "11px", color: "#94a3b8", backgroundColor: "rgba(15, 23, 42, 0.6)", padding: "2px 6px", borderRadius: "4px" }}>
                            Auto-Assign & Queue
                          </span>
                        </div>
                        <p style={{ color: "#cbd5e1", fontSize: "11.5px", margin: 0, lineHeight: "1.4" }}>
                          Automatically scan all qualified specialists to secure the earliest available opening, or automatically reserve your spot in the priority queue.
                        </p>
                        <button
                          type="button"
                          onClick={handleInstantAutoReschedule}
                          disabled={isAutoScanning || isRescheduling}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "8px",
                            backgroundColor: "#0284c7",
                            color: "#ffffff",
                            border: "none",
                            fontSize: "12px",
                            fontWeight: 800,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                          }}
                        >
                          {isAutoScanning ? "Scanning Schedule Engine…" : "⚡ Auto-Reschedule to Next Available Opening"}
                        </button>
                      </div>

                      {/* Specialist Preference Toggle */}
                      <div
                        style={{
                          marginBottom: "14px",
                          padding: "8px 12px",
                          borderRadius: "8px",
                          backgroundColor: "rgba(30, 41, 59, 0.6)",
                          border: "1px solid #334155",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#f8fafc" }}>
                            Auto-Assign Specialist
                          </div>
                          <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                            {autoAssignStaff
                              ? "Searching all qualified practitioners"
                              : `Locked to ${rescheduleModalAppt.staff?.displayName || "current specialist"}`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAutoAssignStaff(!autoAssignStaff)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: "6px",
                            backgroundColor: autoAssignStaff ? "#10b981" : "#334155",
                            color: autoAssignStaff ? "#022c22" : "#cbd5e1",
                            border: "none",
                            fontSize: "11px",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          {autoAssignStaff ? "✓ ANY SPECIALIST" : "LOCKED"}
                        </button>
                      </div>

                      <div style={{ marginBottom: "14px" }}>
                        <label style={{ fontSize: "11.5px", color: "#94a3b8", display: "block", marginBottom: "6px", fontWeight: 700 }}>
                          Or Pick Specific Target Date
                        </label>
                        <input
                          type="date"
                          value={rescheduleDate}
                          min={new Date().toISOString().split("T")[0]}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "1px solid #334155",
                            backgroundColor: "#1e293b",
                            color: "#fff",
                            fontSize: "13px",
                          }}
                        />
                      </div>

                      <div style={{ marginBottom: "20px" }}>
                        <label style={{ fontSize: "11.5px", color: "#94a3b8", display: "block", marginBottom: "6px", fontWeight: 700 }}>
                          Available Live Slots ({rescheduleSlots.filter((s) => s.available).length})
                        </label>
                        {loadingSlots ? (
                          <div style={{ color: "#64748b", fontSize: "12px", padding: "12px 0", textAlign: "center" }}>
                            Checking live slot availability across practitioners…
                          </div>
                        ) : rescheduleSlots.filter((s) => s.available).length === 0 ? (
                          <div
                            style={{
                              padding: "14px 16px",
                              borderRadius: "10px",
                              backgroundColor: "rgba(245, 158, 11, 0.12)",
                              border: "1px solid rgba(245, 158, 11, 0.35)",
                              display: "grid",
                              gap: "10px",
                              margin: "6px 0",
                            }}
                          >
                            <div style={{ color: "#fbbf24", fontSize: "12.5px", fontWeight: 800, display: "flex", alignItems: "center", gap: "6px" }}>
                              <span>⚡</span>
                              <span>Target Date Fully Booked</span>
                            </div>
                            <p style={{ color: "#cbd5e1", fontSize: "12px", margin: 0, lineHeight: "1.4" }}>
                              No live slots open on this date. You can request to reschedule via the <strong>Priority Reschedule Waitlist</strong>. Your current appointment remains completely secure until an opening is matched and confirmed.
                            </p>
                            <button
                              type="button"
                              onClick={handleJoinRescheduleWaitlist}
                              disabled={isJoiningRescheduleWaitlist}
                              style={{
                                padding: "8px 14px",
                                borderRadius: "8px",
                                backgroundColor: "#f59e0b",
                                color: "#0f172a",
                                border: "none",
                                fontSize: "12.5px",
                                fontWeight: 850,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "6px",
                              }}
                            >
                              {isJoiningRescheduleWaitlist ? "Registering Request…" : "⚡ Request Reschedule via Priority Waitlist"}
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "140px", overflowY: "auto" }}>
                            {rescheduleSlots
                              .filter((s) => s.available)
                              .map((slot) => {
                                const timeStr = new Date(slot.slotUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                                const isChosen = selectedRescheduleSlot === slot.slotUtc;
                                return (
                                  <button
                                    key={slot.slotUtc}
                                    type="button"
                                    onClick={() => setSelectedRescheduleSlot(slot.slotUtc)}
                                    style={{
                                      padding: "6px 10px",
                                      borderRadius: "6px",
                                      border: `1px solid ${isChosen ? "#38bdf8" : "#334155"}`,
                                      backgroundColor: isChosen ? "#0284c7" : "#1e293b",
                                      color: "#f8fafc",
                                      fontSize: "12px",
                                      fontWeight: isChosen ? 800 : 600,
                                      cursor: "pointer",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                    }}
                                  >
                                    <span>{timeStr}</span>
                                    {typeof slot.remainingCapacity === "number" && (
                                      <span
                                        style={{
                                          fontSize: "10px",
                                          padding: "1px 4px",
                                          borderRadius: "4px",
                                          backgroundColor: isChosen ? "rgba(255, 255, 255, 0.25)" : "rgba(56, 189, 248, 0.15)",
                                          color: isChosen ? "#fff" : "#38bdf8",
                                          fontWeight: 700,
                                        }}
                                      >
                                        {slot.remainingCapacity} left
                                      </span>
                                    )}
                                    {slot.staffDisplayName && (
                                      <span style={{ fontSize: "10px", opacity: 0.8, marginLeft: "4px" }}>
                                        ({slot.staffDisplayName})
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={() => setRescheduleModalAppt(null)}
                      disabled={isRescheduling}
                      style={{
                        flex: 1,
                        padding: "10px",
                        borderRadius: "8px",
                        backgroundColor: "#1e293b",
                        color: "#94a3b8",
                        border: "1px solid #334155",
                        fontWeight: 700,
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      {isPolicyLocked ? "Close" : "Cancel"}
                    </button>
                    {!isPolicyLocked && (
                      <button
                        onClick={handleCustomerReschedule}
                        disabled={!selectedRescheduleSlot || isRescheduling}
                        style={{
                          flex: 2,
                          padding: "10px",
                          borderRadius: "8px",
                          backgroundColor: "#0284c7",
                          color: "#fff",
                          border: "none",
                          fontWeight: 800,
                          fontSize: "13px",
                          cursor: "pointer",
                          opacity: !selectedRescheduleSlot || isRescheduling ? 0.5 : 1,
                        }}
                      >
                        {isRescheduling ? "Updating…" : "Confirm Reschedule"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Policy-Governed Cancellation Warning & Timezone Modal */}
          <CustomerCancellationModal
            isOpen={!!cancelModalAppt}
            onClose={() => setCancelModalAppt(null)}
            appointment={cancelModalAppt}
            tenantSlug={tenant}
            organizationTimezone={organization?.timezone || "UTC"}
            onCancelled={() => {
              setActionMessage("Appointment successfully cancelled in accordance with organization policy.");
              fetchAppointments();
              setActiveTab("cancelled");
            }}
          />

          {/* Printable Commercial Tax Invoice & Receipt Modal */}
          {selectedInvoiceItem && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px",
                backgroundColor: "rgba(0, 0, 0, 0.8)",
                backdropFilter: "blur(8px)",
              }}
              onClick={() => setSelectedInvoiceItem(null)}
            >
              <div
                style={{
                  maxWidth: "680px",
                  width: "100%",
                  maxHeight: "90vh",
                  overflowY: "auto",
                  backgroundColor: "#0b1120",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "16px",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                  color: "#f8fafc",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Print Control Toolbar (hidden during print) */}
                <div
                  className="no-print"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "16px 24px",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                    backgroundColor: "rgba(255, 255, 255, 0.02)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 700, color: "#38bdf8" }}>
                    <FileText size={16} />
                    <span>Official Tax Receipt & Invoice</span>
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => window.print()}
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
                      }}
                    >
                      <Download size={14} />
                      <span>Print / Download PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedInvoiceItem(null)}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "8px",
                        backgroundColor: "rgba(255, 255, 255, 0.08)",
                        color: "#94a3b8",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Close
                    </button>
                  </div>
                </div>

                {/* Printable Invoice Document Body */}
                <div id="printable-invoice-content" style={{ padding: "32px 36px" }}>
                  {/* Studio Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
                    <div>
                      <h2 style={{ fontSize: "22px", fontWeight: 900, color: "#f8fafc", margin: "0 0 4px" }}>
                        {businessName}
                      </h2>
                      <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                        Digital Commercial Invoice & Payment Receipt
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                        Storefront: {organization?.slug}.bookpro.app
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "18px", fontWeight: 800, color: "#38bdf8", fontFamily: "monospace" }}>
                        {selectedInvoiceItem.invoiceNumber}
                      </div>
                      <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                        Date: {new Date().toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    </div>
                  </div>

                  <div style={{ height: "1px", backgroundColor: "rgba(255, 255, 255, 0.1)", margin: "20px 0" }} />

                  {/* Customer and Merchant Meta */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px", fontSize: "13px" }}>
                    <div>
                      <div style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                        Billed To
                      </div>
                      <div style={{ fontWeight: 700, color: "#f8fafc" }}>
                        {billingData?.customer?.fullName || (billingData?.customer ? `${billingData.customer.firstName || ''} ${billingData.customer.lastName || ''}`.trim() : (user?.fullName || "Valued Guest"))}
                      </div>
                      <div style={{ color: "#94a3b8" }}>
                        {billingData?.customer?.email || user?.email || "customer@example.com"}
                      </div>
                      {billingData?.customer?.phone && (
                        <div style={{ color: "#64748b" }}>{billingData.customer.phone}</div>
                      )}
                    </div>
                    <div>
                      <div style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                        Issued By
                      </div>
                      <div style={{ fontWeight: 700, color: "#f8fafc" }}>{businessName}</div>
                      <div style={{ color: "#94a3b8" }}>BookPro Verified Merchant</div>
                      <div style={{ color: "#64748b" }}>
                        Timezone: {organization?.timezone || "UTC"}
                      </div>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div style={{ border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "10px", overflow: "hidden", marginBottom: "24px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ backgroundColor: "rgba(255, 255, 255, 0.04)", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "#94a3b8" }}>
                          <th style={{ padding: "10px 14px", fontWeight: 700 }}>Description</th>
                          <th style={{ padding: "10px 14px", fontWeight: 700 }}>Scheduled Slot</th>
                          <th style={{ padding: "10px 14px", fontWeight: 700, textAlign: "right" }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ fontWeight: 700, color: "#f8fafc" }}>{selectedInvoiceItem.serviceName}</div>
                            {selectedInvoiceItem.staffName && (
                              <div style={{ fontSize: "12px", color: "#94a3b8" }}>with {selectedInvoiceItem.staffName}</div>
                            )}
                          </td>
                          <td style={{ padding: "12px 14px", color: "#cbd5e1" }}>
                            {selectedInvoiceItem.startAt
                              ? new Date(selectedInvoiceItem.startAt).toLocaleString([], {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })
                              : "Standard Service"}
                          </td>
                          <td style={{ padding: "12px 14px", fontWeight: 700, color: "#f8fafc", textAlign: "right" }}>
                            {formatMoney(selectedInvoiceItem.priceCents || 0, selectedInvoiceItem.currency || "USD")}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Refunds / Deductions If Any */}
                  {(() => {
                    const allRefunds = (selectedInvoiceItem.paymentRecords || []).flatMap((p: any) => p.refunds || []);
                    if (allRefunds.length === 0) return null;
                    return (
                      <div
                        style={{
                          marginBottom: "20px",
                          padding: "12px 16px",
                          borderRadius: "8px",
                          backgroundColor: "rgba(244, 63, 94, 0.08)",
                          border: "1px solid rgba(244, 63, 94, 0.2)",
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: 800, color: "#f87171", textTransform: "uppercase", marginBottom: "6px" }}>
                          Credited Refunds / Adjustments
                        </div>
                        {allRefunds.map((rf: any, idx: number) => (
                          <div key={rf.id || idx} style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", color: "#cbd5e1", margin: "4px 0" }}>
                            <span>
                              Refund on {new Date(rf.createdAt).toLocaleDateString()}{rf.reason ? ` — "${rf.reason}"` : ""}
                            </span>
                            <strong style={{ color: "#f87171" }}>
                              -{formatMoney(rf.amountCents, selectedInvoiceItem.currency || "USD")}
                            </strong>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Summary Totals */}
                  {(() => {
                    const allRefunds = (selectedInvoiceItem.paymentRecords || []).flatMap((p: any) => p.refunds || []);
                    const totalRefunded = allRefunds.reduce((acc: number, r: any) => acc + (r.amountCents || 0), 0);
                    const gross = selectedInvoiceItem.priceCents || 0;
                    const net = Math.max(0, gross - totalRefunded);

                    return (
                      <div style={{ marginLeft: "auto", maxWidth: "260px", marginBottom: "28px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#94a3b8", marginBottom: "6px" }}>
                          <span>Gross Subtotal:</span>
                          <span style={{ color: "#f8fafc", fontWeight: 700 }}>{formatMoney(gross, selectedInvoiceItem.currency || "USD")}</span>
                        </div>
                        {totalRefunded > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#f87171", marginBottom: "6px" }}>
                            <span>Total Refunded:</span>
                            <span style={{ fontWeight: 700 }}>-{formatMoney(totalRefunded, selectedInvoiceItem.currency || "USD")}</span>
                          </div>
                        )}
                        <div style={{ height: "1px", backgroundColor: "rgba(255, 255, 255, 0.1)", margin: "8px 0" }} />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: 850, color: "#f8fafc" }}>
                          <span>Net Paid:</span>
                          <span style={{ color: "#34d399" }}>{formatMoney(net, selectedInvoiceItem.currency || "USD")}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Payment Verification & Compliance Footer */}
                  <div
                    style={{
                      padding: "14px 18px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      fontSize: "12px",
                      color: "#94a3b8",
                      display: "grid",
                      gap: "6px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                      <span>Payment Method: <strong style={{ color: "#f8fafc" }}>{selectedInvoiceItem.paymentMethod || "Credit / Debit Card"}</strong></span>
                      <span>Transaction ID: <code style={{ color: "#38bdf8" }}>{selectedInvoiceItem.transactionId || selectedInvoiceItem.id}</code></span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>
                      Certified Digital Tax Document • Generated by BookPro Cloud Infrastructure. Recorded securely in organization financial ledger.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </CustomerPortalShell>
  );
}

export default function CustomerAccountPage() {
  return (
    <ProtectedRoute allowedActorTypes={[ActorType.CUSTOMER]}>
      <CustomerAccountContent />
    </ProtectedRoute>
  );
}
