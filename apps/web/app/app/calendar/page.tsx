/* Hallmark · macrostructure: Visual Calendar & Operations Grid · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 */
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Users,
  Building2,
  Scissors,
  Check,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  X,
  ArrowRight,
  Download,
  AlertTriangle,
  FileText,
  Briefcase,
  ShieldAlert,
  QrCode,
} from "../../../components/icons";
import { CameraQrScanner } from "../../../components/camera-qr-scanner";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch } from "../../../lib/api-client";
import { useRealtimeEvents } from "../../../lib/use-realtime-events";
import { PageHeader } from "../../../components/shell/app-shell";
import { GlassCard, GlassBadge } from "../../../components/glass-card";
import { CancellationDrawer } from "../../../components/cancellation-drawer";
import { compareSystemAndOrgTimezones } from "../../../lib/timezone-utils";
import { sanitizeErrorMessage } from "../../../lib/error-utils";
import { SanitizedAlert } from "../../../components/sanitized-alert";
import { motion, AnimatePresence } from "framer-motion";
import {
  SpotlightCard,
  AnimatedGroup,
  MotionAlert,
  CollapsibleDisclosure,
} from "../../../components/motion-primitives";

// --- Types ---
export type AppointmentStatus =
  | "HOLD"
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export interface AppointmentItem {
  id: string;
  organizationId: string;
  locationId: string;
  serviceId: string;
  staffId?: string | null;
  customerId: string;
  startAt: string;
  endAt: string;
  bookingDate?: string;
  partySize: number;
  status: AppointmentStatus;
  paymentStatus: string;
  bookingSource: string;
  priceCents: number;
  currency: string;
  internalNotes?: string | null;
  overrideReason?: string | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  checkInAt?: string | null;
  metadata?: any;
  service?: {
    id: string;
    name: string;
    durationMin: number;
    priceCents: number;
    currency: string;
  };
  staff?: {
    id: string;
    displayName: string;
    title?: string;
    email?: string;
  } | null;
  customer?: {
    id: string;
    fullName: string;
    email: string;
    phone?: string;
    userId?: string | null;
  };
  location?: {
    id: string;
    name: string;
    address?: string;
    city?: string;
    timezone: string;
  };
  history?: Array<{
    id: string;
    actorType: string;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    reason?: string | null;
    createdAt: string;
  }>;
}

export interface LocationItem {
  id: string;
  name: string;
  address?: string;
  city?: string;
  timezone: string;
  isActive: boolean;
}

export interface StaffItem {
  id: string;
  displayName: string;
  title?: string;
  email?: string;
  isActive: boolean;
}

export interface ServiceItem {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  currency: string;
  category?: string;
  isActive: boolean;
}

export interface CustomerOption {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
}

export interface AvailableSlot {
  slotUtc: string;
  slotLocal: string;
  available: boolean;
  staffId?: string;
}

type ViewMode = "day" | "week" | "month" | "staff" | "queue";

function formatMoney(cents: number = 0, currency: string = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "USD").toUpperCase(),
      minimumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(currency || "USD").toUpperCase()} ${(cents / 100).toFixed(2)}`;
  }
}

function downloadIcs(appt: AppointmentItem, orgName: string) {
  const startDate = new Date(appt.startAt);
  const endDate = new Date(appt.endAt);

  const formatIcsDate = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BookPro//Owner Operations Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:appt-${appt.id}@bookpro.app`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(startDate)}`,
    `DTEND:${formatIcsDate(endDate)}`,
    `SUMMARY:${appt.service?.name || "Service Session"} - ${appt.customer?.fullName || "Client"}`,
    `DESCRIPTION:Specialist: ${appt.staff?.displayName || "Unassigned"}\\nClient: ${appt.customer?.fullName || "Guest"} (${appt.customer?.email || ""})\\nReference: ${appt.id}`,
    `LOCATION:${appt.location?.name || orgName}, ${appt.location?.address || ""}`,
    `STATUS:${appt.status === "CONFIRMED" ? "CONFIRMED" : "CANCELLED"}`,
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

export default function BusinessCalendarPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId || "";

  // View state
  const [selectedDate, setSelectedDate] = useState<string>(
    () => new Date().toISOString().split("T")[0]
  );
  const [viewMode, setViewMode] = useState<ViewMode>("day");

  // Filter state
  const [locationFilter, setLocationFilter] = useState<string>("ALL");
  const [staffFilter, setStaffFilter] = useState<string>("ALL");
  const [serviceFilter, setServiceFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Data state
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [waitlistHolds, setWaitlistHolds] = useState<any[]>([]);
  const [selectedHoldToOverride, setSelectedHoldToOverride] = useState<any | null>(null);
  const [overrideWaitlistHoldFlag, setOverrideWaitlistHoldFlag] = useState<boolean>(false);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [staffList, setStaffList] = useState<StaffItem[]>([]);
  const [servicesList, setServicesList] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Inspection Drawer & Action State
  const [selectedAppt, setSelectedAppt] = useState<AppointmentItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"overview" | "pass" | "reschedule" | "history">("overview");
  const [drawerPassData, setDrawerPassData] = useState<any>(null);
  const [loadingDrawerPass, setLoadingDrawerPass] = useState(false);
  const [isOverrideMode, setIsOverrideMode] = useState(false);
  const [drawerOverrideReason, setDrawerOverrideReason] = useState("");
  const [cancelDrawerOpen, setCancelDrawerOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<string>("");
  const [rescheduleStaffId, setRescheduleStaffId] = useState<string>("");
  const [rescheduleSlots, setRescheduleSlots] = useState<AvailableSlot[]>([]);
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<string>("");
  const [isRescheduleLoading, setIsRescheduleLoading] = useState(false);
  const [rescheduleOverrideReason, setRescheduleOverrideReason] = useState("");

  // Front-Desk QR Scanner Modal State
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [scannerTokenInput, setScannerTokenInput] = useState("");
  const [isVerifyingQr, setIsVerifyingQr] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ type: "success" | "error"; message: string; data?: any } | null>(null);

  // Auto-Settle Batch State
  const [isAutoSettling, setIsAutoSettling] = useState(false);

  // Walk-in / New Appointment Modal State
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newLocationId, setNewLocationId] = useState<string>("");
  const [newServiceId, setNewServiceId] = useState<string>("");
  const [newStaffId, setNewStaffId] = useState<string>("");
  const [newApptDate, setNewApptDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [isSlotsLoading, setIsSlotsLoading] = useState(false);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [existingCustomers, setExistingCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState<string>("");
  const [newCustomerName, setNewCustomerName] = useState<string>("");
  const [newCustomerEmail, setNewCustomerEmail] = useState<string>("");
  const [newCustomerPhone, setNewCustomerPhone] = useState<string>("");
  const [newNotes, setNewNotes] = useState<string>("");
  const [newPaymentStatus, setNewPaymentStatus] = useState<string>("UNPAID");
  const [newOverrideReason, setNewOverrideReason] = useState<string>("");
  const [creatingAppt, setCreatingAppt] = useState(false);
  const [newApptError, setNewApptError] = useState<string | null>(null);
  const [queueShowAll, setQueueShowAll] = useState(false);

  // --- Real-time SSE Live Sync ---
  const { isConnected: isRealtimeLive } = useRealtimeEvents(orgId, {
    onEvent: (hint) => {
      if (
        hint.type.startsWith("appointment.") ||
        hint.type.startsWith("booking_hold.") ||
        hint.type.startsWith("waitlist.") ||
        hint.type.startsWith("calendar.") ||
        hint.type.startsWith("staff.")
      ) {
        fetchAppointments();
      }
    },
  });

  // Calculate Date Range according to View Mode
  const dateRange = useMemo(() => {
    const base = new Date(`${selectedDate}T12:00:00Z`);
    if (isNaN(base.getTime())) {
      const now = new Date();
      return {
        startDate: now.toISOString().split("T")[0],
        endDate: now.toISOString().split("T")[0],
      };
    }

    if (viewMode === "day" || viewMode === "staff" || viewMode === "queue") {
      const d = base.toISOString().split("T")[0];
      return { startDate: d, endDate: d };
    }

    if (viewMode === "week") {
      const dayOfWeek = base.getDay(); // 0 is Sun, 1 is Mon
      const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const mon = new Date(base);
      mon.setDate(base.getDate() + diffToMon);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return {
        startDate: mon.toISOString().split("T")[0],
        endDate: sun.toISOString().split("T")[0],
      };
    }

    // Month view
    const y = base.getFullYear();
    const m = base.getMonth();
    const firstDay = new Date(Date.UTC(y, m, 1));
    const lastDay = new Date(Date.UTC(y, m + 1, 0));
    return {
      startDate: firstDay.toISOString().split("T")[0],
      endDate: lastDay.toISOString().split("T")[0],
    };
  }, [selectedDate, viewMode]);

  // --- Fetch Appointments Authoritatively ---
  const fetchAppointments = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        organizationId: orgId,
        startDate: `${dateRange.startDate}T00:00:00.000Z`,
        endDate: `${dateRange.endDate}T23:59:59.999Z`,
      });

      if (locationFilter !== "ALL") params.append("locationId", locationFilter);
      if (staffFilter !== "ALL") params.append("staffId", staffFilter);
      if (serviceFilter !== "ALL") params.append("serviceId", serviceFilter);
      if (statusFilter !== "ALL") params.append("status", statusFilter);

      const holdParams = new URLSearchParams({
        startDate: `${dateRange.startDate}T00:00:00.000Z`,
        endDate: `${dateRange.endDate}T23:59:59.999Z`,
      });
      if (locationFilter !== "ALL") holdParams.append("locationId", locationFilter);

      const [res, holdsRes] = await Promise.all([
        apiFetch<AppointmentItem[]>(`/appointments?${params.toString()}`, {}, orgId),
        apiFetch<any[]>(
          `/organizations/${orgId}/waitlist/holds?${holdParams.toString()}`,
          {},
          orgId
        ).catch(() => ({ success: false, data: [] })),
      ]);

      if (res.success && Array.isArray(res.data)) {
        setAppointments(res.data);
      } else {
        setAppointments([]);
      }

      if (holdsRes?.success && Array.isArray(holdsRes.data)) {
        setWaitlistHolds(holdsRes.data);
      } else {
        setWaitlistHolds([]);
      }
    } catch {
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, dateRange, locationFilter, staffFilter, serviceFilter, statusFilter]);

  // Load Organization Metadata (Locations, Staff, Services)
  useEffect(() => {
    if (!orgId) return;

    apiFetch<LocationItem[]>("/locations", {}, orgId).then((res) => {
      if (res.success && Array.isArray(res.data)) {
        setLocations(res.data.filter((l) => l.isActive !== false));
        if (res.data.length > 0 && !newLocationId) {
          setNewLocationId(res.data[0].id);
        }
      }
    });

    apiFetch<StaffItem[]>("/staff", {}, orgId).then((res) => {
      if (res.success && Array.isArray(res.data)) {
        setStaffList(res.data.filter((s) => s.isActive !== false));
      }
    });

    apiFetch<ServiceItem[]>("/services", {}, orgId).then((res) => {
      if (res.success && Array.isArray(res.data)) {
        setServicesList(res.data.filter((s) => s.isActive !== false));
        if (res.data.length > 0 && !newServiceId) {
          setNewServiceId(res.data[0].id);
        }
      }
    });
  }, [orgId]);

  // Trigger appointment fetch on range/filter changes
  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Load CRM Customers for walk-in/manual modal
  useEffect(() => {
    if (!orgId || !isNewModalOpen) return;
    apiFetch<any[]>(`/organizations/${orgId}/customers?limit=100`, {}, orgId).then((res) => {
      if (res.success && Array.isArray(res.data)) {
        setExistingCustomers(
          res.data.map((c) => ({
            id: c.id,
            fullName: c.fullName,
            email: c.email,
            phone: c.phone,
          }))
        );
      }
    });
  }, [orgId, isNewModalOpen]);

  // --- Fetch Available Slots for New Appointment Modal ---
  const fetchAvailableSlotsForNew = useCallback(async () => {
    if (!newLocationId || !newServiceId || !newApptDate) return;
    setIsSlotsLoading(true);
    setSelectedSlot("");
    try {
      const params = new URLSearchParams({
        organizationId: orgId,
        locationId: newLocationId,
        serviceId: newServiceId,
        startDate: `${newApptDate}T00:00:00.000Z`,
        endDate: `${newApptDate}T23:59:59.999Z`,
      });
      if (newStaffId && newStaffId !== "UNASSIGNED") {
        params.append("staffId", newStaffId);
      }

      const res = await apiFetch<any>(`/availability/slots?${params.toString()}`, {}, orgId);
      const slotList: AvailableSlot[] = [];
      if (res.success && res.data) {
        // Backend returns slots array or map
        const rawSlots = Array.isArray(res.data) ? res.data : res.data.slots || [];
        rawSlots.forEach((s: any) => {
          slotList.push({
            slotUtc: s.startUtc || s.slotUtc || s.startAt || s,
            slotLocal: s.startLocal || s.slotLocal || s.startAt || s,
            available: s.available !== false,
            staffId: s.staffId,
          });
        });
      }
      setAvailableSlots(slotList);
    } catch {
      setAvailableSlots([]);
    } finally {
      setIsSlotsLoading(false);
    }
  }, [orgId, newLocationId, newServiceId, newStaffId, newApptDate]);

  useEffect(() => {
    if (isNewModalOpen) {
      fetchAvailableSlotsForNew();
    }
  }, [isNewModalOpen, fetchAvailableSlotsForNew]);

  // --- Fetch Available Slots for Reschedule Drawer ---
  const fetchAvailableSlotsForReschedule = useCallback(async () => {
    if (!selectedAppt || !rescheduleDate) return;
    setIsRescheduleLoading(true);
    setSelectedRescheduleSlot("");
    try {
      const params = new URLSearchParams({
        organizationId: orgId,
        locationId: selectedAppt.locationId,
        serviceId: selectedAppt.serviceId,
        startDate: `${rescheduleDate}T00:00:00.000Z`,
        endDate: `${rescheduleDate}T23:59:59.999Z`,
      });
      const staffTarget = rescheduleStaffId || selectedAppt.staffId;
      if (staffTarget) {
        params.append("staffId", staffTarget);
      }

      const res = await apiFetch<any>(`/availability/slots?${params.toString()}`, {}, orgId);
      const slotList: AvailableSlot[] = [];
      if (res.success && res.data) {
        const rawSlots = Array.isArray(res.data) ? res.data : res.data.slots || [];
        rawSlots.forEach((s: any) => {
          slotList.push({
            slotUtc: s.startUtc || s.slotUtc || s.startAt || s,
            slotLocal: s.startLocal || s.slotLocal || s.startAt || s,
            available: s.available !== false,
            staffId: s.staffId,
          });
        });
      }
      setRescheduleSlots(slotList);
    } catch {
      setRescheduleSlots([]);
    } finally {
      setIsRescheduleLoading(false);
    }
  }, [orgId, selectedAppt, rescheduleDate, rescheduleStaffId]);

  useEffect(() => {
    if (isRescheduleOpen && selectedAppt) {
      fetchAvailableSlotsForReschedule();
    }
  }, [isRescheduleOpen, fetchAvailableSlotsForReschedule]);

  // --- Client-Side Filtered Appointments (Search & Text Query) ---
  const filteredAppointments = useMemo(() => {
    return appointments.filter((appt) => {
      // Exclude cancelled bookings from visual active schedule grids unless explicitly filtering for CANCELLED
      if (statusFilter !== "CANCELLED" && appt.status === "CANCELLED") {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const custName = appt.customer?.fullName?.toLowerCase() || "";
      const custEmail = appt.customer?.email?.toLowerCase() || "";
      const srvName = appt.service?.name?.toLowerCase() || "";
      const staffName = appt.staff?.displayName?.toLowerCase() || "";
      const apptId = appt.id.toLowerCase();
      return (
        custName.includes(q) ||
        custEmail.includes(q) ||
        srvName.includes(q) ||
        staffName.includes(q) ||
        apptId.includes(q)
      );
    });
  }, [appointments, searchQuery, statusFilter]);

  // Navigation handlers
  const handleNavDate = (deltaDays: number) => {
    const d = new Date(selectedDate);
    if (viewMode === "month") {
      d.setMonth(d.getMonth() + (deltaDays > 0 ? 1 : -1));
    } else if (viewMode === "week") {
      d.setDate(d.getDate() + (deltaDays > 0 ? 7 : -7));
    } else {
      d.setDate(d.getDate() + deltaDays);
    }
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const handleNavToday = () => {
    setSelectedDate(new Date().toISOString().split("T")[0]);
  };

  // Drawer / Inspection open & QR Pass loading
  const fetchDrawerPass = useCallback(async (apptId: string) => {
    if (!orgId || !apptId) return;
    setLoadingDrawerPass(true);
    try {
      const res = await apiFetch<any>(`/appointments/${apptId}/qr-pass`, {}, orgId);
      if (res.success && res.data) {
        setDrawerPassData(res.data);
      } else {
        setDrawerPassData(null);
      }
    } catch {
      setDrawerPassData(null);
    } finally {
      setLoadingDrawerPass(false);
    }
  }, [orgId]);

  const handleOpenApptDetail = (appt: AppointmentItem) => {
    setSelectedAppt(appt);
    setIsDrawerOpen(true);
    setDrawerTab("overview");
    setIsOverrideMode(false);
    setDrawerOverrideReason("");
    setIsRescheduleOpen(false);
    setRescheduleDate(new Date(appt.startAt).toISOString().split("T")[0]);
    setRescheduleStaffId(appt.staffId || "");
    setSelectedRescheduleSlot("");
    setStatusMessage(null);
    fetchDrawerPass(appt.id);
  };

  // Lifecycle Status Transition with Server Guardrails & Override
  const handleLifecycleAction = async (
    endpoint: "check-in" | "start" | "complete" | "no-show",
    targetStatus: AppointmentStatus,
    overrideReason?: string
  ) => {
    if (!selectedAppt) return;
    setStatusMessage(null);
    try {
      const payload: any = { organizationId: orgId };
      if (overrideReason) {
        payload.overrideReason = overrideReason;
      }

      const res = await apiFetch(`/appointments/${selectedAppt.id}/${endpoint}`, {
        method: "POST",
        body: JSON.stringify(payload),
      }, orgId);

      if (res.success) {
        setStatusMessage({ text: `✓ Appointment transitioned to ${targetStatus}`, type: "success" });
        setAppointments((prev) =>
          prev.map((a) => (a.id === selectedAppt.id ? { ...a, status: targetStatus } : a))
        );
        setSelectedAppt({ ...selectedAppt, status: targetStatus });
        fetchAppointments();
      } else {
        setStatusMessage({ text: `⚠️ Failed: ${sanitizeErrorMessage(res.error, "Invalid state transition").message}`, type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: `⚠️ Network error: ${sanitizeErrorMessage(err, "Request failed").message}`, type: "error" });
    }
  };

  // Auto-Settle Past Ended Sessions Batch Action
  const handleAutoSettle = async () => {
    if (!orgId) return;
    setIsAutoSettling(true);
    setStatusMessage(null);
    try {
      const res = await apiFetch<any>("/appointments/auto-settle", {
        method: "POST",
        body: JSON.stringify({ organizationId: orgId }),
      }, orgId);

      if (res.success) {
        const count = res.data?.settledCount ?? res.data?.completedCount ?? 0;
        setStatusMessage({
          text: `✓ Auto-settled ${count} completed appointment(s) and calculated commissions.`,
          type: "success",
        });
        fetchAppointments();
      } else {
        setStatusMessage({
          text: `⚠️ Auto-settle failed: ${sanitizeErrorMessage(res.error, "Operation failed").message}`,
          type: "error",
        });
      }
    } catch (err: any) {
      setStatusMessage({
        text: `⚠️ Network error: ${sanitizeErrorMessage(err, "Failed to auto-settle").message}`,
        type: "error",
      });
    } finally {
      setIsAutoSettling(false);
    }
  };

  // Front-Desk QR Pass Scanner Submit
  const handleQrScanSubmit = async (e?: React.FormEvent, directToken?: string) => {
    if (e) e.preventDefault();
    const token = (directToken || scannerTokenInput).trim();
    if (!token) return;

    setIsVerifyingQr(true);
    setScanFeedback(null);
    try {
      const res = await apiFetch<any>("/appointments/check-in/qr", {
        method: "POST",
        body: JSON.stringify({ token }),
      }, orgId);

      if (res.success && res.data) {
        const appt = res.data.appointment || res.data;
        setScanFeedback({
          type: "success",
          message: `✓ Check-in verified! ${appt.customer?.fullName || "Client"} (${appt.service?.name || "Service"})`,
          data: appt,
        });
        setScannerTokenInput("");
        fetchAppointments();
        if (selectedAppt && selectedAppt.id === appt.id) {
          setSelectedAppt({ ...selectedAppt, status: "CHECKED_IN", checkInAt: new Date().toISOString() });
        }
      } else {
        setScanFeedback({
          type: "error",
          message: `⚠️ Verification rejected: ${sanitizeErrorMessage(res.error, "Invalid or expired QR pass token").message}`,
        });
      }
    } catch (err: any) {
      setScanFeedback({
        type: "error",
        message: `⚠️ Network error: ${sanitizeErrorMessage(err, "Failed to verify pass").message}`,
      });
    } finally {
      setIsVerifyingQr(false);
    }
  };

  // Authoritative Reschedule Proposal Submit
  const handleRescheduleSubmit = async () => {
    if (!selectedAppt || (!selectedRescheduleSlot && !rescheduleOverrideReason)) return;
    setStatusMessage(null);
    try {
      const durationMin = selectedAppt.service?.durationMin || 30;
      let startIso = selectedRescheduleSlot;

      if (!startIso && rescheduleDate) {
        startIso = `${rescheduleDate}T12:00:00.000Z`;
      }

      const endIso = new Date(new Date(startIso).getTime() + durationMin * 60 * 1000).toISOString();

      const payload: any = {
        organizationId: orgId,
        newStartAt: startIso,
        newEndAt: endIso,
      };
      if (rescheduleStaffId) payload.newStaffId = rescheduleStaffId;
      if (rescheduleOverrideReason.trim()) payload.overrideReason = rescheduleOverrideReason.trim();

      const res = await apiFetch(`/appointments/${selectedAppt.id}/reschedule/propose`, {
        method: "POST",
        body: JSON.stringify(payload),
      }, orgId);

      if (res.success) {
        setStatusMessage({ text: "✓ Reschedule proposal dispatched to customer for portal confirmation.", type: "success" });
        setIsRescheduleOpen(false);
        fetchAppointments();
        setIsDrawerOpen(false);
      } else {
        setStatusMessage({ text: `⚠️ Reschedule failed: ${sanitizeErrorMessage(res.error, "Selected slot unavailable").message}`, type: "error" });
      }
    } catch (err: any) {
      setStatusMessage({ text: `⚠️ Network error: ${sanitizeErrorMessage(err, "Failed to reschedule").message}`, type: "error" });
    }
  };

  // Authoritative Manual / Walk-In Appointment Creation
  const handleCreateNewAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewApptError(null);

    if (!newLocationId || !newServiceId) {
      setNewApptError("Please select an operating location and service offering.");
      return;
    }

    let customerIdToUse = selectedCustomerId;
    let customerNameToUse = newCustomerName;
    let customerEmailToUse = newCustomerEmail;
    let customerPhoneToUse = newCustomerPhone;

    if (customerMode === "existing") {
      const found = existingCustomers.find((c) => c.id === selectedCustomerId);
      if (!found) {
        setNewApptError("Please select an existing client from the directory or switch to New Client.");
        return;
      }
      customerIdToUse = found.id;
      customerNameToUse = found.fullName;
      customerEmailToUse = found.email;
      customerPhoneToUse = found.phone || "";
    } else {
      if (!newCustomerEmail.trim() || !newCustomerName.trim()) {
        setNewApptError("Client full name and valid email are required to register appointment.");
        return;
      }
    }

    let startIso = selectedSlot;
    if (!startIso) {
      if (!newOverrideReason.trim()) {
        setNewApptError("Please select an available booking slot or enter a staff override reason.");
        return;
      }
      // If no slot chosen but override supplied, default to 09:00 local on the date
      startIso = `${newApptDate}T09:00:00.000Z`;
    }

    const srv = servicesList.find((s) => s.id === newServiceId);
    const durationMin = srv?.durationMin || 30;
    const endIso = new Date(new Date(startIso).getTime() + durationMin * 60 * 1000).toISOString();

    setCreatingAppt(true);
    try {
      const payload: any = {
        organizationId: orgId,
        locationId: newLocationId,
        serviceId: newServiceId,
        staffId: newStaffId && newStaffId !== "UNASSIGNED" ? newStaffId : undefined,
        customerId: customerIdToUse || undefined,
        customerName: customerNameToUse,
        customerEmail: customerEmailToUse,
        customerPhone: customerPhoneToUse || undefined,
        startAt: startIso,
        endAt: endIso,
        paymentStatus: newPaymentStatus,
        internalNotes: newNotes.trim() || undefined,
        overrideReason: newOverrideReason.trim() || undefined,
      };

      if (overrideWaitlistHoldFlag) {
        payload.overrideWaitlistHold = true;
      }

      const res = await apiFetch("/appointments", {
        method: "POST",
        body: JSON.stringify(payload),
      }, orgId);

      if (res.success) {
        setIsNewModalOpen(false);
        setNewApptError(null);
        setOverrideWaitlistHoldFlag(false);
        setSelectedHoldToOverride(null);
        // Reset form
        setSelectedSlot("");
        setNewNotes("");
        setNewOverrideReason("");
        setNewCustomerName("");
        setNewCustomerEmail("");
        setNewCustomerPhone("");
        fetchAppointments();
      } else {
        setNewApptError(sanitizeErrorMessage(res.error, "Selected slot unavailable or invalid request").message);
      }
    } catch (err: any) {
      setNewApptError(sanitizeErrorMessage(err, "Failed to create appointment").message);
    } finally {
      setCreatingAppt(false);
    }
  };

  // Status badge styling helper
  const statusBadges: Record<AppointmentStatus, { bg: string; text: string; border: string }> = {
    CONFIRMED: { bg: "rgba(16, 185, 129, 0.15)", text: "#34d399", border: "rgba(16, 185, 129, 0.3)" },
    CHECKED_IN: { bg: "rgba(59, 130, 246, 0.15)", text: "#60a5fa", border: "rgba(59, 130, 246, 0.3)" },
    IN_PROGRESS: { bg: "rgba(168, 85, 247, 0.15)", text: "#c084fc", border: "rgba(168, 85, 247, 0.3)" },
    COMPLETED: { bg: "rgba(148, 163, 184, 0.15)", text: "#cbd5e1", border: "rgba(148, 163, 184, 0.3)" },
    CANCELLED: { bg: "rgba(244, 63, 94, 0.15)", text: "#f87171", border: "rgba(244, 63, 94, 0.3)" },
    NO_SHOW: { bg: "rgba(245, 158, 11, 0.15)", text: "#fbbf24", border: "rgba(245, 158, 11, 0.3)" },
    HOLD: { bg: "rgba(234, 179, 8, 0.15)", text: "#fde047", border: "rgba(234, 179, 8, 0.3)" },
    PENDING_PAYMENT: { bg: "rgba(234, 179, 8, 0.15)", text: "#fde047", border: "rgba(234, 179, 8, 0.3)" },
  };

  // Render sub-views
  const renderDayView = () => {
    // Hour slots from 07:00 to 21:00
    const hours = Array.from({ length: 15 }, (_, i) => i + 7);

    return (
      <div style={{ backgroundColor: "#0f172a", borderRadius: "12px", border: "1px solid #1e293b", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#94a3b8", fontSize: "13px", fontWeight: 700 }}>
            <Clock size={16} color="#38bdf8" />
            <span>Operational Day Timeline ({filteredAppointments.length} Bookings)</span>
          </div>
          <span style={{ fontSize: "12px", color: "#64748b" }}>Click an empty slot to book walk-in</span>
        </div>

        <div style={{ position: "relative", minHeight: "800px", padding: "10px 0" }}>
          {hours.map((hour) => {
            const timeLabel = `${hour.toString().padStart(2, "0")}:00`;
            const apptsInHour = filteredAppointments.filter((a) => {
              const d = new Date(a.startAt);
              return d.getHours() === hour;
            });
            const holdsInHour = waitlistHolds.filter((h) => {
              const d = new Date(h.startAt);
              return d.toISOString().split("T")[0] === selectedDate && d.getHours() === hour;
            });

            return (
              <div
                key={hour}
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr",
                  minHeight: "64px",
                  borderBottom: "1px solid #1e293b",
                  alignItems: "stretch",
                }}
              >
                <div
                  style={{
                    padding: "8px 16px",
                    color: "#64748b",
                    fontSize: "12px",
                    fontWeight: 800,
                    borderRight: "1px solid #1e293b",
                    textAlign: "right",
                  }}
                >
                  {timeLabel}
                </div>

                <div
                  style={{
                    padding: "6px 12px",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px",
                    alignItems: "center",
                    backgroundColor: "transparent",
                    cursor: "pointer",
                  }}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      setNewApptDate(selectedDate);
                      setIsNewModalOpen(true);
                    }
                  }}
                >
                  {/* Waitlist Hold Blocks */}
                  {holdsInHour.map((hold) => {
                    const minutesLeft = Math.max(0, Math.round((new Date(hold.expiresAt).getTime() - Date.now()) / 60000));
                    return (
                      <div
                        key={hold.holdId}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedHoldToOverride(hold);
                        }}
                        style={{
                          backgroundColor: "rgba(245, 158, 11, 0.12)",
                          backgroundImage: "repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.08), rgba(245, 158, 11, 0.08) 10px, transparent 10px, transparent 20px)",
                          border: "1px dashed rgba(245, 158, 11, 0.6)",
                          borderLeft: "4px solid #f59e0b",
                          borderRadius: "8px",
                          padding: "8px 14px",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          minWidth: "260px",
                          boxShadow: "0 2px 8px rgba(245, 158, 11, 0.15)",
                        }}
                        onMouseEnter={(el) => (el.currentTarget.style.transform = "translateY(-1px)")}
                        onMouseLeave={(el) => (el.currentTarget.style.transform = "translateY(0)")}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 800, color: "#fbbf24" }}>
                            {new Date(hold.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                            {new Date(hold.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 850,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor: "#f59e0b",
                              color: "#0f172a",
                            }}
                          >
                            ⏳ HOLD ({minutesLeft}m)
                          </span>
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "#f8fafc", marginTop: "4px" }}>
                          Hold: {hold.customerName || "Waitlist Guest"}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px", fontSize: "12px", color: "#94a3b8" }}>
                          <span>{hold.serviceName}</span>
                          <span style={{ color: "#fbbf24", fontWeight: 700 }}>Override →</span>
                        </div>
                      </div>
                    );
                  })}

                  {apptsInHour.map((appt) => {
                    const badge = statusBadges[appt.status] || { bg: "#334155", text: "#fff", border: "#475569" };
                    return (
                      <div
                        key={appt.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenApptDetail(appt);
                        }}
                        style={{
                          backgroundColor: "#1e293b",
                          border: `1px solid ${badge.border}`,
                          borderLeft: `4px solid ${badge.text}`,
                          borderRadius: "8px",
                          padding: "8px 14px",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          minWidth: "260px",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                        }}
                        onMouseEnter={(el) => (el.currentTarget.style.transform = "translateY(-1px)")}
                        onMouseLeave={(el) => (el.currentTarget.style.transform = "translateY(0)")}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 800, color: "#38bdf8" }}>
                            {new Date(appt.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                            {new Date(appt.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span
                            style={{
                              fontSize: "10.5px",
                              fontWeight: 800,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor: badge.bg,
                              color: badge.text,
                            }}
                          >
                            {appt.status}
                          </span>
                        </div>

                        <div style={{ fontSize: "14px", fontWeight: 700, color: "#f8fafc", marginTop: "4px" }}>
                          {appt.service?.name || "Service"}
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px", fontSize: "12px", color: "#94a3b8" }}>
                          <span>Client: <strong style={{ color: "#e2e8f0" }}>{appt.customer?.fullName || "Guest"}</strong></span>
                          <span>Staff: <strong style={{ color: "#cbd5e1" }}>{appt.staff?.displayName || "Unassigned"}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const mon = new Date(`${dateRange.startDate}T12:00:00Z`);

    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "12px" }}>
        {days.map((dayName, idx) => {
          const currentDay = new Date(mon);
          currentDay.setDate(mon.getDate() + idx);
          const dateStr = currentDay.toISOString().split("T")[0];
          const isToday = dateStr === new Date().toISOString().split("T")[0];

          const dayAppts = filteredAppointments.filter(
            (a) => new Date(a.startAt).toISOString().split("T")[0] === dateStr
          );
          const dayHolds = waitlistHolds.filter(
            (h) => new Date(h.startAt).toISOString().split("T")[0] === dateStr
          );

          return (
            <div
              key={dateStr}
              style={{
                backgroundColor: "#0f172a",
                borderRadius: "10px",
                border: isToday ? "1.5px solid #38bdf8" : "1px solid #1e293b",
                display: "flex",
                flexDirection: "column",
                minHeight: "480px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px",
                  borderBottom: "1px solid #1e293b",
                  backgroundColor: isToday ? "rgba(56, 189, 248, 0.08)" : "#131c31",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "12px", color: isToday ? "#38bdf8" : "#94a3b8", fontWeight: 800, textTransform: "uppercase" }}>
                  {dayName}
                </div>
                <div style={{ fontSize: "18px", fontWeight: 900, color: "#f8fafc", marginTop: "2px" }}>
                  {currentDay.getDate()}
                </div>
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                  {dayAppts.length} bookings {dayHolds.length > 0 ? `• ${dayHolds.length} holds` : ""}
                </div>
              </div>

              <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "8px", flex: 1, overflowY: "auto" }}>
                {/* Holds in Week View */}
                {dayHolds.map((hold) => {
                  const minutesLeft = Math.max(0, Math.round((new Date(hold.expiresAt).getTime() - Date.now()) / 60000));
                  return (
                    <div
                      key={hold.holdId}
                      onClick={() => setSelectedHoldToOverride(hold)}
                      style={{
                        backgroundColor: "rgba(245, 158, 11, 0.15)",
                        backgroundImage: "repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.08), rgba(245, 158, 11, 0.08) 6px, transparent 6px, transparent 12px)",
                        border: "1px dashed rgba(245, 158, 11, 0.6)",
                        borderLeft: "3px solid #f59e0b",
                        borderRadius: "6px",
                        padding: "8px",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, color: "#fbbf24" }}>
                        <span>{new Date(hold.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        <span style={{ fontSize: "9.5px", color: "#f59e0b" }}>HOLD ({minutesLeft}m)</span>
                      </div>
                      <div style={{ fontWeight: 700, color: "#f8fafc", margin: "2px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {hold.customerName}
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {hold.serviceName}
                      </div>
                    </div>
                  );
                })}

                {dayAppts.length === 0 && dayHolds.length === 0 ? (
                  <div style={{ color: "#475569", fontSize: "12px", textAlign: "center", marginTop: "24px" }}>
                    No bookings
                  </div>
                ) : (
                  dayAppts.map((appt) => {
                    const badge = statusBadges[appt.status] || { bg: "#334155", text: "#fff", border: "#475569" };
                    return (
                      <div
                        key={appt.id}
                        onClick={() => handleOpenApptDetail(appt)}
                        style={{
                          backgroundColor: "#1e293b",
                          border: `1px solid ${badge.border}`,
                          borderLeft: `3px solid ${badge.text}`,
                          borderRadius: "6px",
                          padding: "8px",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, color: "#38bdf8" }}>
                          <span>{new Date(appt.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          <span style={{ fontSize: "10px", color: badge.text }}>{appt.status}</span>
                        </div>
                        <div style={{ fontWeight: 700, color: "#f8fafc", margin: "2px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {appt.service?.name || "Service"}
                        </div>
                        <div style={{ color: "#94a3b8", fontSize: "11px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {appt.customer?.fullName || "Guest"}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMonthView = () => {
    const base = new Date(`${selectedDate}T12:00:00Z`);
    const y = base.getFullYear();
    const m = base.getMonth();
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getDate();
    const firstDayIndex = (new Date(Date.UTC(y, m, 1)).getDay() + 6) % 7; // Monday = 0

    const totalCells = Math.ceil((daysInMonth + firstDayIndex) / 7) * 7;
    const cells = [];

    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - firstDayIndex + 1;
      if (dayNum > 0 && dayNum <= daysInMonth) {
        const dStr = `${y}-${(m + 1).toString().padStart(2, "0")}-${dayNum.toString().padStart(2, "0")}`;
        const dayAppts = filteredAppointments.filter(
          (a) => new Date(a.startAt).toISOString().split("T")[0] === dStr
        );
        cells.push({ dateStr: dStr, dayNum, appts: dayAppts });
      } else {
        cells.push(null);
      }
    }

    const dayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    return (
      <div style={{ backgroundColor: "#0f172a", borderRadius: "12px", border: "1px solid #1e293b", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #1e293b", backgroundColor: "#131c31" }}>
          {dayHeaders.map((dh) => (
            <div key={dh} style={{ padding: "12px", textAlign: "center", fontSize: "12px", fontWeight: 800, color: "#94a3b8" }}>
              {dh}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {cells.map((cell, idx) => {
            if (!cell) {
              return <div key={`empty-${idx}`} style={{ minHeight: "100px", borderBottom: "1px solid #1e293b", borderRight: "1px solid #1e293b", backgroundColor: "rgba(15, 23, 42, 0.4)" }} />;
            }
            const isSelected = cell.dateStr === selectedDate;
            const isToday = cell.dateStr === new Date().toISOString().split("T")[0];

            return (
              <div
                key={cell.dateStr}
                onClick={() => {
                  setSelectedDate(cell.dateStr);
                  setViewMode("day");
                }}
                style={{
                  minHeight: "110px",
                  borderBottom: "1px solid #1e293b",
                  borderRight: "1px solid #1e293b",
                  padding: "8px",
                  cursor: "pointer",
                  backgroundColor: isSelected ? "rgba(56, 189, 248, 0.08)" : isToday ? "rgba(16, 185, 129, 0.04)" : "transparent",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(el) => (el.currentTarget.style.backgroundColor = "rgba(56, 189, 248, 0.12)")}
                onMouseLeave={(el) => (el.currentTarget.style.backgroundColor = isSelected ? "rgba(56, 189, 248, 0.08)" : isToday ? "rgba(16, 185, 129, 0.04)" : "transparent")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: isToday ? 900 : 700,
                      color: isToday ? "#38bdf8" : "#cbd5e1",
                      width: "24px",
                      height: "24px",
                      display: "grid",
                      placeItems: "center",
                      borderRadius: "50%",
                      backgroundColor: isToday ? "rgba(56, 189, 248, 0.2)" : "transparent",
                    }}
                  >
                    {cell.dayNum}
                  </span>
                  {cell.appts.length > 0 && (
                    <span style={{ fontSize: "11px", fontWeight: 800, padding: "1px 6px", borderRadius: "9999px", backgroundColor: "#0284c7", color: "#fff" }}>
                      {cell.appts.length}
                    </span>
                  )}
                </div>

                <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {cell.appts.slice(0, 3).map((a) => (
                    <div
                      key={a.id}
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        backgroundColor: "#1e293b",
                        color: "#f8fafc",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {new Date(a.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} {a.service?.name}
                    </div>
                  ))}
                  {cell.appts.length > 3 && (
                    <span style={{ fontSize: "10.5px", color: "#94a3b8", fontWeight: 700 }}>
                      +{cell.appts.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderStaffColumnsView = () => {
    // Show active staff members + Unassigned column
    const columns: Array<{ id: string; name: string; title?: string }> = [
      ...staffList.map((s) => ({ id: s.id, name: s.displayName, title: s.title })),
      { id: "UNASSIGNED", name: "Unassigned Queue", title: "Shared / Pending Staff" },
    ];

    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns.length}, minmax(240px, 1fr))`, gap: "14px", overflowX: "auto", paddingBottom: "16px" }}>
        {columns.map((col) => {
          const colAppts = filteredAppointments.filter((a) => {
            if (col.id === "UNASSIGNED") return !a.staffId;
            return a.staffId === col.id;
          });
          const colHolds = waitlistHolds.filter((h) => {
            const d = new Date(h.startAt);
            const dateMatches = d.toISOString().split("T")[0] === selectedDate;
            if (!dateMatches) return false;
            if (col.id === "UNASSIGNED") return !h.staffId;
            return h.staffId === col.id;
          });

          return (
            <div
              key={col.id}
              style={{
                backgroundColor: "#0f172a",
                borderRadius: "10px",
                border: "1px solid #1e293b",
                display: "flex",
                flexDirection: "column",
                minHeight: "520px",
              }}
            >
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e293b", backgroundColor: "#131c31" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <User size={16} color="#38bdf8" />
                  <span style={{ fontSize: "14px", fontWeight: 800, color: "#f8fafc" }}>{col.name}</span>
                </div>
                {col.title && <div style={{ fontSize: "11.5px", color: "#94a3b8", marginTop: "2px" }}>{col.title}</div>}
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                  {colAppts.length} bookings {colHolds.length > 0 ? `• ${colHolds.length} holds` : ""}
                </div>
              </div>

              <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px", flex: 1, overflowY: "auto" }}>
                {/* Hold blocks for staff */}
                {colHolds.map((hold) => {
                  const minutesLeft = Math.max(0, Math.round((new Date(hold.expiresAt).getTime() - Date.now()) / 60000));
                  return (
                    <div
                      key={hold.holdId}
                      onClick={() => setSelectedHoldToOverride(hold)}
                      style={{
                        backgroundColor: "rgba(245, 158, 11, 0.15)",
                        backgroundImage: "repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.08), rgba(245, 158, 11, 0.08) 6px, transparent 6px, transparent 12px)",
                        border: "1px dashed rgba(245, 158, 11, 0.6)",
                        borderLeft: "4px solid #f59e0b",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        cursor: "pointer",
                        boxShadow: "0 2px 6px rgba(245, 158, 11, 0.2)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", fontWeight: 800, color: "#fbbf24" }}>
                          {new Date(hold.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span style={{ fontSize: "10px", fontWeight: 850, padding: "2px 6px", borderRadius: "4px", backgroundColor: "#f59e0b", color: "#0f172a" }}>
                          HOLD ({minutesLeft}m)
                        </span>
                      </div>
                      <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#f8fafc", marginTop: "4px" }}>
                        Hold: {hold.customerName || "Waitlist Guest"}
                      </div>
                      <div style={{ fontSize: "11.5px", color: "#94a3b8", marginTop: "2px" }}>
                        {hold.serviceName}
                      </div>
                      <div style={{ textAlign: "right", marginTop: "6px", fontSize: "11px", color: "#fbbf24", fontWeight: 700 }}>
                        Click to Override →
                      </div>
                    </div>
                  );
                })}

                {colAppts.length === 0 && colHolds.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#475569", fontSize: "13px", marginTop: "36px" }}>
                    No bookings for this specialist
                  </div>
                ) : (
                  colAppts.map((appt) => {
                    const badge = statusBadges[appt.status] || { bg: "#334155", text: "#fff", border: "#475569" };
                    return (
                      <div
                        key={appt.id}
                        onClick={() => handleOpenApptDetail(appt)}
                        style={{
                          backgroundColor: "#1e293b",
                          border: `1px solid ${badge.border}`,
                          borderLeft: `4px solid ${badge.text}`,
                          borderRadius: "8px",
                          padding: "10px 12px",
                          cursor: "pointer",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "12px", fontWeight: 800, color: "#38bdf8" }}>
                            {new Date(appt.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "2px 6px", borderRadius: "4px", backgroundColor: badge.bg, color: badge.text }}>
                            {appt.status}
                          </span>
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "#f8fafc", marginTop: "4px" }}>
                          {appt.service?.name || "Service"}
                        </div>
                        <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                          Client: <strong style={{ color: "#e2e8f0" }}>{appt.customer?.fullName || "Guest"}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "12px", color: "#4ade80", fontWeight: 800 }}>
                          <span>{formatMoney(appt.priceCents, appt.currency)}</span>
                          <span style={{ color: "#38bdf8", fontSize: "11px" }}>Inspect →</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderQueueView = () => {
    const displayedQueue = queueShowAll ? filteredAppointments : filteredAppointments.slice(0, 10);

    return (
      <div style={{ display: "grid", gap: "16px" }}>
        {filteredAppointments.length === 0 ? (
          <div style={{ backgroundColor: "#0f172a", borderRadius: "12px", border: "1px solid #1e293b", padding: "48px", textAlign: "center", color: "#94a3b8" }}>
            <CalendarIcon size={32} color="#64748b" style={{ margin: "0 auto 12px auto" }} />
            <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#f8fafc", margin: "0 0 4px 0" }}>No Appointments in Selected Filter</h3>
            <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>Try changing dates, status filters, or search terms.</p>
          </div>
        ) : (
          <>
            {displayedQueue.map((appt) => {
              const badge = statusBadges[appt.status] || { bg: "#334155", text: "#fff", border: "#475569" };
              return (
                <GlassCard
                  key={appt.id}
                  variant="card"
                  glow="subtle"
                  depth3D
                  style={{ padding: "20px 24px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "16px" }}
                >
                  <div style={{ display: "grid", gap: "6px", minWidth: "280px", flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "15px", fontWeight: 850, color: "#38bdf8" }}>
                        ⏱ {new Date(appt.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span style={{ fontSize: "11.5px", fontWeight: 800, padding: "3px 8px", borderRadius: "4px", backgroundColor: badge.bg, color: badge.text, border: `1px solid ${badge.border}` }}>
                        {appt.status}
                      </span>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>Ref: {appt.id.slice(0, 8)}</span>
                    </div>

                    <h3 style={{ fontSize: "17px", fontWeight: 800, margin: 0, color: "#f8fafc" }}>
                      {appt.service?.name || "Service Session"}
                    </h3>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", color: "#cbd5e1", fontSize: "13px" }}>
                      <span>Client: <strong style={{ color: "#f8fafc" }}>{appt.customer?.fullName || "Guest Customer"}</strong> ({appt.customer?.email || "No email"})</span>
                      <span>Staff: <strong style={{ color: "#f8fafc" }}>{appt.staff?.displayName || "Unassigned"}</strong></span>
                      <span>Location: <strong style={{ color: "#f8fafc" }}>{appt.location?.name || "Main Location"}</strong></span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "16px", fontWeight: 900, color: "#4ade80" }}>
                        {formatMoney(appt.priceCents, appt.currency)}
                      </div>
                      <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase" }}>
                        Payment: {appt.paymentStatus}
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenApptDetail(appt)}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "8px",
                        backgroundColor: "#1e293b",
                        color: "#38bdf8",
                        border: "1px solid #334155",
                        fontWeight: 700,
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      Control & Inspect →
                    </button>
                  </div>
                </GlassCard>
              );
            })}

            {filteredAppointments.length > 10 && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setQueueShowAll((prev) => !prev)}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(56, 189, 248, 0.08)",
                    border: "1px solid rgba(56, 189, 248, 0.25)",
                    color: "#38bdf8",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {queueShowAll
                    ? `Show fewer queue items (top 10 of ${filteredAppointments.length})`
                    : `Showing 10 of ${filteredAppointments.length} queue items · Show all (${filteredAppointments.length - 10} more)`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      {/* PAGE HEADER */}
      <PageHeader
        title="Operations Schedule & Visual Calendar"
        description={`Live appointment management, multi-view schedule, and authoritative booking coordination for ${user?.organizationName || "Workspace"}.`}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {/* Real-time SSE Live Indicator */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: 800,
                backgroundColor: isRealtimeLive ? "rgba(16, 185, 129, 0.12)" : "rgba(245, 158, 11, 0.12)",
                border: `1px solid ${isRealtimeLive ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
                color: isRealtimeLive ? "#34d399" : "#fbbf24",
              }}
            >
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  backgroundColor: isRealtimeLive ? "#10b981" : "#f59e0b",
                  boxShadow: isRealtimeLive ? "0 0 8px #10b981" : "none",
                }}
              />
              <span>{isRealtimeLive ? "Live Sync Active" : "Reconnecting..."}</span>
            </div>

            <button
              onClick={() => fetchAppointments()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "8px",
                backgroundColor: "#1e293b",
                border: "1px solid #334155",
                color: "#94a3b8",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>

            {/* Front-Desk QR Pass Scanner */}
            <button
              onClick={() => {
                setIsScannerModalOpen(true);
                setScanFeedback(null);
                setScannerTokenInput("");
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "8px",
                backgroundColor: "rgba(56, 189, 248, 0.12)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                color: "#38bdf8",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              title="Open QR scanner modal to check in client pass"
            >
              <QrCode size={15} />
              <span>Scan QR Pass</span>
            </button>

            {/* Auto-Settle Ended Sessions Batch Action */}
            <button
              onClick={handleAutoSettle}
              disabled={isAutoSettling}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "8px",
                backgroundColor: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#34d399",
                fontSize: "13px",
                fontWeight: 700,
                cursor: isAutoSettling ? "not-allowed" : "pointer",
                opacity: isAutoSettling ? 0.6 : 1,
                transition: "all 0.2s ease",
              }}
              title="Automatically marks elapsed sessions as completed and records commission snapshots"
            >
              <CheckCircle2 size={15} />
              <span>{isAutoSettling ? "Settling..." : "Auto-Settle Ended"}</span>
            </button>

            <button
              onClick={() => {
                setNewApptDate(selectedDate);
                setNewApptError(null);
                setIsNewModalOpen(true);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 18px",
                borderRadius: "8px",
                backgroundColor: "#0284c7",
                color: "#fff",
                border: "none",
                fontSize: "13.5px",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(2, 132, 199, 0.35)",
              }}
            >
              <Plus size={16} />
              <span>+ New Appointment</span>
            </button>
          </div>
        }
      />

      {/* CONTROLS BAR: Views + Date Navigator + Filters */}
      <div
        style={{
          backgroundColor: "#0f172a",
          borderRadius: "12px",
          border: "1px solid #1e293b",
          padding: "16px 20px",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
        }}
      >
        {/* Left: View Switcher */}
        <div style={{ display: "flex", backgroundColor: "#1e293b", padding: "3px", borderRadius: "8px", border: "1px solid #334155" }}>
          {(
            [
              { id: "day", label: "Day" },
              { id: "week", label: "Week" },
              { id: "month", label: "Month" },
              { id: "staff", label: "Staff Roster" },
              { id: "queue", label: "Queue / All" },
            ] as Array<{ id: ViewMode; label: string }>
          ).map((vm) => {
            const isActive = viewMode === vm.id;
            return (
              <button
                key={vm.id}
                onClick={() => setViewMode(vm.id)}
                style={{
                  position: "relative",
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "transparent",
                  color: isActive ? "#fff" : "#94a3b8",
                  fontSize: "13px",
                  fontWeight: isActive ? 800 : 600,
                  cursor: "pointer",
                  transition: "color 0.15s ease",
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId="calendar-view-pill"
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "6px",
                      backgroundColor: "#0284c7",
                      boxShadow: "0 2px 8px rgba(2, 132, 199, 0.4)",
                      zIndex: 1,
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span style={{ position: "relative", zIndex: 2 }}>{vm.label}</span>
              </button>
            );
          })}
        </div>

        {/* Center: Date Navigator */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => handleNavDate(-1)}
            style={{ padding: "6px 10px", borderRadius: "6px", backgroundColor: "#1e293b", border: "1px solid #334155", color: "#f8fafc", cursor: "pointer" }}
            title="Previous"
          >
            <ChevronLeft size={16} />
          </button>

          <button
            onClick={handleNavToday}
            style={{ padding: "6px 12px", borderRadius: "6px", backgroundColor: "#1e293b", border: "1px solid #334155", color: "#f8fafc", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}
          >
            Today
          </button>

          <button
            onClick={() => handleNavDate(1)}
            style={{ padding: "6px 10px", borderRadius: "6px", backgroundColor: "#1e293b", border: "1px solid #334155", color: "#f8fafc", cursor: "pointer" }}
            title="Next"
          >
            <ChevronRight size={16} />
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid #334155",
              backgroundColor: "#1e293b",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 700,
            }}
          />

          <span style={{ fontSize: "13px", color: "#38bdf8", fontWeight: 700, marginLeft: "4px" }}>
            {new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            }).format(new Date(`${selectedDate}T12:00:00Z`))}
          </span>
        </div>

        {/* Right: Quick Search */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "220px" }}>
          <div style={{ position: "relative", width: "100%" }}>
            <Search size={14} color="#64748b" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="text"
              placeholder="Search customer, staff, service..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 12px 6px 32px",
                borderRadius: "6px",
                border: "1px solid #334155",
                backgroundColor: "#1e293b",
                color: "#fff",
                fontSize: "12.5px",
              }}
            />
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS ROW */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "12px",
          backgroundColor: "#0b1120",
          padding: "12px 16px",
          borderRadius: "8px",
          border: "1px solid #1e293b",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#94a3b8", fontSize: "12.5px", fontWeight: 700 }}>
          <Filter size={14} color="#38bdf8" />
          <span>Filters:</span>
        </div>

        {/* Location Filter */}
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: "6px", backgroundColor: "#1e293b", color: "#f8fafc", border: "1px solid #334155", fontSize: "12.5px" }}
        >
          <option value="ALL">All Locations ({locations.length})</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>

        {/* Staff Filter */}
        <select
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: "6px", backgroundColor: "#1e293b", color: "#f8fafc", border: "1px solid #334155", fontSize: "12.5px" }}
        >
          <option value="ALL">All Specialists ({staffList.length})</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>

        {/* Service Filter */}
        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: "6px", backgroundColor: "#1e293b", color: "#f8fafc", border: "1px solid #334155", fontSize: "12.5px" }}
        >
          <option value="ALL">All Services ({servicesList.length})</option>
          {servicesList.map((srv) => (
            <option key={srv.id} value={srv.id}>
              {srv.name} ({srv.durationMin}m)
            </option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: "6px", backgroundColor: "#1e293b", color: "#f8fafc", border: "1px solid #334155", fontSize: "12.5px" }}
        >
          <option value="ALL">All Statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CHECKED_IN">Checked In</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="NO_SHOW">No-Show</option>
        </select>

        {(locationFilter !== "ALL" || staffFilter !== "ALL" || serviceFilter !== "ALL" || statusFilter !== "ALL" || searchQuery) && (
          <button
            onClick={() => {
              setLocationFilter("ALL");
              setStaffFilter("ALL");
              setServiceFilter("ALL");
              setStatusFilter("ALL");
              setSearchQuery("");
            }}
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              backgroundColor: "rgba(244, 63, 94, 0.15)",
              color: "#fca5a5",
              border: "1px solid rgba(244, 63, 94, 0.3)",
              fontSize: "11.5px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* MAIN VIEW CONTENT */}
      <main>
        {loading ? (
          <div style={{ backgroundColor: "#0f172a", borderRadius: "12px", border: "1px solid #1e293b", padding: "64px", textAlign: "center", color: "#94a3b8" }}>
            <RefreshCw size={28} className="animate-spin" style={{ margin: "0 auto 12px auto", color: "#38bdf8" }} />
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#f8fafc" }}>Loading live operations schedule…</div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={viewMode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {viewMode === "day"
                ? renderDayView()
                : viewMode === "week"
                ? renderWeekView()
                : viewMode === "month"
                ? renderMonthView()
                : viewMode === "staff"
                ? renderStaffColumnsView()
                : renderQueueView()}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* APPOINTMENT CONTROL DRAWER (HALLMARK MIDNIGHT) */}
      <AnimatePresence>
        {isDrawerOpen && selectedAppt && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsDrawerOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0, 0, 0, 0.72)",
                backdropFilter: "blur(4px)",
                zIndex: 99,
              }}
              aria-label="Close appointment details"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              style={{
                position: "fixed",
                top: 0,
                right: 0,
                bottom: 0,
                width: "540px",
                maxWidth: "100vw",
                backgroundColor: "#090d16",
                boxShadow: "-16px 0 60px rgba(0,0,0,0.85)",
                borderLeft: "1px solid #1e293b",
                display: "flex",
                flexDirection: "column",
                zIndex: 100,
                overflowY: "auto",
              }}
            >
          {/* Sticky Drawer Header */}
          <div
            style={{
              padding: "24px 28px 16px 28px",
              borderBottom: "1px solid #1e293b",
              backgroundColor: "rgba(9, 13, 22, 0.95)",
              backdropFilter: "blur(12px)",
              position: "sticky",
              top: 0,
              zIndex: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      backgroundColor: "rgba(2, 132, 199, 0.2)",
                      border: "1px solid rgba(2, 132, 199, 0.5)",
                      color: "#38bdf8",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontSize: "10.5px",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    Appointment Control
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "4px",
                      backgroundColor: statusBadges[selectedAppt.status]?.bg || "#334155",
                      color: statusBadges[selectedAppt.status]?.text || "#fff",
                    }}
                  >
                    {selectedAppt.status}
                  </span>
                </div>
                <h2 style={{ fontSize: "20px", fontWeight: 850, margin: "8px 0 2px 0", color: "#f8fafc" }}>
                  {selectedAppt.service?.name || "Service Session"}
                </h2>
                <div style={{ fontSize: "12px", color: "#64748b" }}>
                  ID: <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>{selectedAppt.id}</span> · Source: <strong style={{ color: "#cbd5e1" }}>{selectedAppt.bookingSource}</strong>
                </div>
              </div>

              <button
                onClick={() => setIsDrawerOpen(false)}
                style={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  color: "#94a3b8",
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Status Alert Banner */}
            {statusMessage && (
              <div
                style={{
                  marginTop: "14px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  backgroundColor: statusMessage.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)",
                  color: statusMessage.type === "success" ? "#6ee7b7" : "#fca5a5",
                  border: `1px solid ${statusMessage.type === "success" ? "rgba(52, 211, 153, 0.3)" : "rgba(244, 63, 94, 0.3)"}`,
                }}
              >
                {statusMessage.text}
              </div>
            )}
          </div>

          {/* Drawer Body */}
          <div style={{ padding: "20px 28px", display: "grid", gap: "20px", flex: 1 }}>
            {/* 1. INTERACTIVE LIFECYCLE STEPPER */}
            <div
              style={{
                backgroundColor: "#0f172a",
                borderRadius: "12px",
                border: "1px solid #1e293b",
                padding: "16px",
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "14px" }}>
                Lifecycle Pipeline State
              </div>

              {selectedAppt.status === "CANCELLED" ? (
                <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: "rgba(244, 63, 94, 0.12)", border: "1px solid rgba(244, 63, 94, 0.3)", color: "#fca5a5", fontSize: "13px", fontWeight: 700 }}>
                  ✕ Appointment Cancelled. Terminal state locked.
                </div>
              ) : selectedAppt.status === "NO_SHOW" ? (
                <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: "rgba(217, 119, 6, 0.12)", border: "1px solid rgba(217, 119, 6, 0.3)", color: "#fcd34d", fontSize: "13px", fontWeight: 700 }}>
                  ⚠️ Client marked No-Show. Slot released. Terminal state locked.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                  {[
                    { id: "CONFIRMED", label: "Confirmed", step: 1 },
                    { id: "CHECKED_IN", label: "Checked-In", step: 2 },
                    { id: "IN_PROGRESS", label: "In-Progress", step: 3 },
                    { id: "COMPLETED", label: "Completed", step: 4 },
                  ].map((st, idx) => {
                    const statusOrder = ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"];
                    const currentIdx = statusOrder.indexOf(selectedAppt.status);
                    const isPassed = currentIdx > idx;
                    const isCurrent = currentIdx === idx;

                    return (
                      <div
                        key={st.id}
                        style={{
                          textAlign: "center",
                          padding: "8px 4px",
                          borderRadius: "8px",
                          backgroundColor: isCurrent
                            ? "rgba(2, 132, 199, 0.15)"
                            : isPassed
                            ? "rgba(16, 185, 129, 0.08)"
                            : "rgba(30, 41, 59, 0.5)",
                          border: `1px solid ${
                            isCurrent
                              ? "#0284c7"
                              : isPassed
                              ? "rgba(16, 185, 129, 0.3)"
                              : "#1e293b"
                          }`,
                        }}
                      >
                        <div
                          style={{
                            width: "20px",
                            height: "20px",
                            borderRadius: "50%",
                            margin: "0 auto 4px auto",
                            display: "grid",
                            placeItems: "center",
                            fontSize: "10px",
                            fontWeight: 800,
                            backgroundColor: isCurrent
                              ? "#0284c7"
                              : isPassed
                              ? "#10b981"
                              : "#334155",
                            color: "#fff",
                          }}
                        >
                          {isPassed ? "✓" : st.step}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: isCurrent ? 800 : 600,
                            color: isCurrent ? "#38bdf8" : isPassed ? "#34d399" : "#64748b",
                          }}
                        >
                          {st.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. CONTEXTUAL OPERATIONAL ACTION BAR WITH TEMPORAL GUARDRAILS */}
            {(() => {
              const nowMs = Date.now();
              const startMs = new Date(selectedAppt.startAt).getTime();
              const graceCutoffMs = startMs + 5 * 60 * 1000;
              const isBeforeStart = nowMs < startMs;
              const isWithinGrace = nowMs < graceCutoffMs;
              const isTerminal = ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(selectedAppt.status);

              return (
                <div
                  style={{
                    backgroundColor: "#0f172a",
                    borderRadius: "12px",
                    border: "1px solid #1e293b",
                    padding: "16px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Operational Actions
                    </div>

                    {/* Staff Override Toggle */}
                    {!isTerminal && (
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#94a3b8", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={isOverrideMode}
                          onChange={(e) => setIsOverrideMode(e.target.checked)}
                          style={{ accentColor: "#0284c7" }}
                        />
                        <span>Staff Override Mode</span>
                      </label>
                    )}
                  </div>

                  {/* Override Reason Field when enabled */}
                  {isOverrideMode && !isTerminal && (
                    <div style={{ marginBottom: "12px" }}>
                      <input
                        type="text"
                        placeholder="Required override reason (e.g., manager exception, early walkout)..."
                        value={drawerOverrideReason}
                        onChange={(e) => setDrawerOverrideReason(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d97706",
                          backgroundColor: "#1e293b",
                          color: "#f8fafc",
                          fontSize: "12px",
                        }}
                      />
                    </div>
                  )}

                  {/* Operational Action Buttons by Current State */}
                  {isTerminal ? (
                    <div style={{ fontSize: "12.5px", color: "#64748b", textAlign: "center", padding: "8px" }}>
                      ✓ State is terminal ({selectedAppt.status}). No further operational transitions permitted.
                    </div>
                  ) : selectedAppt.status === "CONFIRMED" ? (
                    <div style={{ display: "grid", gap: "10px" }}>
                      <div
                        style={{
                          padding: "12px 14px",
                          borderRadius: "10px",
                          backgroundColor: "rgba(14, 165, 233, 0.1)",
                          border: "1px solid rgba(14, 165, 233, 0.25)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: 800, color: "#38bdf8" }}>
                            Automated QR Check-In Active
                          </div>
                          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                            Client must scan mobile pass at front desk camera [opens 60m before slot, closes 5m after slot time].
                          </div>
                        </div>
                        <button
                          onClick={() => setIsScannerModalOpen(true)}
                          style={{
                            padding: "8px 14px",
                            borderRadius: "8px",
                            backgroundColor: "#0284c7",
                            color: "#fff",
                            border: "none",
                            fontWeight: 800,
                            fontSize: "12px",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            boxShadow: "0 2px 8px rgba(2, 132, 199, 0.4)",
                          }}
                        >
                          📷 Open Scanner
                        </button>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        <button
                          onClick={() => handleLifecycleAction("start", "IN_PROGRESS")}
                          style={{
                            padding: "10px 14px",
                            borderRadius: "8px",
                            backgroundColor: "#1e293b",
                            color: "#38bdf8",
                            border: "1px solid #38bdf8",
                            fontWeight: 700,
                            fontSize: "13px",
                            cursor: "pointer",
                          }}
                        >
                          ▶ Start Early
                        </button>

                        <button
                          onClick={() => handleLifecycleAction("no-show", "NO_SHOW")}
                          disabled={isWithinGrace && !isOverrideMode}
                          title={isWithinGrace ? `Grace window active until ${new Date(graceCutoffMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                          style={{
                            padding: "10px 14px",
                            borderRadius: "8px",
                            backgroundColor: "#78350f",
                            color: "#fde68a",
                            border: "1px solid #d97706",
                            fontWeight: 700,
                            fontSize: "12.5px",
                            cursor: isWithinGrace && !isOverrideMode ? "not-allowed" : "pointer",
                            opacity: isWithinGrace && !isOverrideMode ? 0.45 : 1,
                          }}
                        >
                          ⚠️ Mark No-Show
                        </button>
                      </div>
                    </div>
                  ) : selectedAppt.status === "CHECKED_IN" ? (
                    <div>
                      <button
                        onClick={() => handleLifecycleAction("start", "IN_PROGRESS")}
                        style={{
                          width: "100%",
                          padding: "12px",
                          borderRadius: "8px",
                          backgroundColor: "#0284c7",
                          color: "#fff",
                          border: "none",
                          fontWeight: 800,
                          fontSize: "13.5px",
                          cursor: "pointer",
                          boxShadow: "0 4px 12px rgba(2, 132, 199, 0.35)",
                        }}
                      >
                        ▶ Start Service Session (Advance to In-Progress)
                      </button>
                    </div>
                  ) : (
                    <div>
                      <button
                        onClick={() => handleLifecycleAction("complete", "COMPLETED", drawerOverrideReason)}
                        style={{
                          width: "100%",
                          padding: "12px",
                          borderRadius: "8px",
                          backgroundColor: "#065f46",
                          color: "#fff",
                          border: "none",
                          fontWeight: 800,
                          fontSize: "13.5px",
                          cursor: "pointer",
                          boxShadow: "0 4px 14px rgba(6, 95, 70, 0.4)",
                        }}
                      >
                        ★ Complete & Settle Service Session
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 3. THREE HALLMARK TABS NAVIGATION (Customer pass privacy enforced) */}
            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "4px",
                  borderBottom: "1px solid #1e293b",
                  paddingBottom: "8px",
                }}
              >
                {[
                  { id: "overview", label: "Overview" },
                  { id: "reschedule", label: "Reschedule" },
                  { id: "history", label: "Timeline" },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setDrawerTab(t.id as any);
                      if (t.id === "reschedule") {
                        setIsRescheduleOpen(true);
                        fetchAvailableSlotsForReschedule();
                      }
                    }}
                    style={{
                      padding: "8px 4px",
                      borderRadius: "6px",
                      border: "none",
                      backgroundColor: drawerTab === t.id ? "#1e293b" : "transparent",
                      color: drawerTab === t.id ? "#38bdf8" : "#64748b",
                      fontWeight: drawerTab === t.id ? 800 : 600,
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* TAB 1: OVERVIEW & CLIENT PROFILE */}
              {drawerTab === "overview" && (
                <div style={{ paddingTop: "16px", display: "grid", gap: "14px" }}>
                  {/* Client Card */}
                  <div style={{ backgroundColor: "#0f172a", borderRadius: "10px", padding: "16px", border: "1px solid #1e293b" }}>
                    <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: "10px" }}>
                      Customer Profile
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: "15px", fontWeight: 800, color: "#f8fafc" }}>
                          {selectedAppt.customer?.fullName || "Guest Customer"}
                        </div>
                        <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                          {selectedAppt.customer?.email || "No email"} {selectedAppt.customer?.phone ? `· ${selectedAppt.customer.phone}` : ""}
                        </div>
                      </div>
                      {selectedAppt.customerId && (
                        <a
                          href={`/app/crm?customer=${selectedAppt.customerId}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: "11.5px",
                            fontWeight: 700,
                            padding: "4px 8px",
                            borderRadius: "6px",
                            backgroundColor: "#1e293b",
                            color: "#38bdf8",
                            border: "1px solid #334155",
                            textDecoration: "none",
                          }}
                        >
                          CRM Profile ↗
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Service & Specialist Details */}
                  <div style={{ backgroundColor: "#0f172a", borderRadius: "10px", padding: "16px", border: "1px solid #1e293b", display: "grid", gap: "10px", fontSize: "13px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>Specialist:</span>
                      <span style={{ fontWeight: 700, color: "#38bdf8" }}>{selectedAppt.staff?.displayName || "Unassigned"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>Scheduled Window:</span>
                      <span style={{ fontWeight: 700, color: "#f8fafc" }}>
                        {new Date(selectedAppt.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {new Date(selectedAppt.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>Facility Location:</span>
                      <span style={{ color: "#cbd5e1" }}>{selectedAppt.location?.name || "Main Facility"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>Price & Balance:</span>
                      <span style={{ fontWeight: 900, color: "#4ade80" }}>
                        {formatMoney(selectedAppt.priceCents, selectedAppt.currency)} ({selectedAppt.paymentStatus})
                      </span>
                    </div>
                    {selectedAppt.checkInAt && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#94a3b8" }}>Check-In Timestamp:</span>
                        <span style={{ color: "#34d399", fontWeight: 700 }}>
                          {new Date(selectedAppt.checkInAt).toLocaleTimeString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: PROPOSE RESCHEDULE */}
              {drawerTab === "reschedule" && (
                <div style={{ paddingTop: "16px" }}>
                  <div style={{ backgroundColor: "#0f172a", padding: "16px", borderRadius: "10px", border: "1px solid #1e293b", display: "grid", gap: "12px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#38bdf8" }}>
                      Propose Reschedule (Requires Customer Confirmation)
                    </div>

                    {(selectedAppt.metadata as any)?.rescheduleProposal?.status === "PENDING_CUSTOMER_CONFIRMATION" && (
                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "8px",
                          backgroundColor: "rgba(245, 158, 11, 0.15)",
                          border: "1px solid rgba(245, 158, 11, 0.4)",
                          color: "#fcd34d",
                          fontSize: "12px",
                          lineHeight: "1.4",
                        }}
                      >
                        <strong>Proposal Pending:</strong> Proposed for{" "}
                        {new Date((selectedAppt.metadata as any).rescheduleProposal.proposedStartAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.
                        Awaiting confirmation on Customer Portal.
                      </div>
                    )}

                    <div>
                      <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>New Target Date</label>
                      <input
                        type="date"
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "12px" }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Specialist Assignment</label>
                      <select
                        value={rescheduleStaffId}
                        onChange={(e) => setRescheduleStaffId(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "12px" }}
                      >
                        <option value="">Keep current ({selectedAppt.staff?.displayName || "Unassigned"})</option>
                        {staffList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.displayName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
                        Authoritative Available Slots ({rescheduleSlots.filter((s) => s.available).length})
                      </label>
                      {isRescheduleLoading ? (
                        <div style={{ fontSize: "12px", color: "#64748b" }}>Checking calendar collisions...</div>
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
                                  }}
                                >
                                  {timeStr}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
                        Reason for Reschedule Proposal (Communicated to Customer)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Specialist schedule adjustment, earlier time open"
                        value={rescheduleOverrideReason}
                        onChange={(e) => setRescheduleOverrideReason(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "12px" }}
                      />
                    </div>

                    <button
                      onClick={handleRescheduleSubmit}
                      disabled={!selectedRescheduleSlot && !rescheduleOverrideReason}
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: "8px",
                        backgroundColor: "#0284c7",
                        color: "#fff",
                        border: "none",
                        fontWeight: 800,
                        fontSize: "13px",
                        cursor: !selectedRescheduleSlot && !rescheduleOverrideReason ? "not-allowed" : "pointer",
                        opacity: !selectedRescheduleSlot && !rescheduleOverrideReason ? 0.5 : 1,
                      }}
                    >
                      Propose Reschedule to Customer
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 4: AUDIT HISTORY TIMELINE */}
              {drawerTab === "history" && (
                <div style={{ paddingTop: "16px" }}>
                  <div style={{ backgroundColor: "#0f172a", padding: "16px", borderRadius: "10px", border: "1px solid #1e293b" }}>
                    <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: "12px" }}>
                      Chronological Audit Trail
                    </div>
                    {selectedAppt.history && selectedAppt.history.length > 0 ? (
                      <div style={{ display: "grid", gap: "8px", maxHeight: "280px", overflowY: "auto" }}>
                        {selectedAppt.history.map((hist) => (
                          <div key={hist.id} style={{ fontSize: "12px", padding: "8px 12px", borderRadius: "6px", backgroundColor: "#131c31", border: "1px solid #1e293b" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", color: "#38bdf8", fontWeight: 700 }}>
                              <span>{hist.action}</span>
                              <span style={{ fontSize: "11px", color: "#64748b" }}>{new Date(hist.createdAt).toLocaleTimeString()}</span>
                            </div>
                            <div style={{ color: "#94a3b8", fontSize: "11.5px", marginTop: "2px" }}>
                              By <strong style={{ color: "#cbd5e1" }}>{hist.actorType}</strong> {hist.fromStatus ? `(${hist.fromStatus} → ${hist.toStatus})` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: "#64748b", fontSize: "12px", textAlign: "center", padding: "16px" }}>
                        No audit events recorded yet.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sticky Drawer Footer: .ics download & Cancellation */}
          <div
            style={{
              padding: "16px 28px",
              borderTop: "1px solid #1e293b",
              backgroundColor: "rgba(9, 13, 22, 0.95)",
              backdropFilter: "blur(12px)",
              position: "sticky",
              bottom: 0,
              display: "grid",
              gap: "8px",
            }}
          >
            <button
              onClick={() => downloadIcs(selectedAppt, user?.organizationName || "BookPro")}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "8px",
                backgroundColor: "#1e293b",
                color: "#cbd5e1",
                border: "1px solid #334155",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <Download size={15} />
              <span>Download .ics Calendar Pass</span>
            </button>

            {selectedAppt.status !== "CANCELLED" && selectedAppt.status !== "COMPLETED" && (() => {
              const hoursUntilStart = (new Date(selectedAppt.startAt).getTime() - Date.now()) / (1000 * 60 * 60);
              const isLockedUnder3Hours = hoursUntilStart < 3;
              return (
                <button
                  onClick={() => {
                    if (isLockedUnder3Hours) return;
                    setIsDrawerOpen(false);
                    setCancelDrawerOpen(true);
                  }}
                  disabled={isLockedUnder3Hours}
                  title={isLockedUnder3Hours ? "Studio cancellation locked: less than 3 hours remaining before slot start." : "Cancel Booking (100% Full Refund Guarantee)"}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    backgroundColor: isLockedUnder3Hours ? "rgba(75, 85, 99, 0.2)" : "rgba(225, 29, 72, 0.12)",
                    color: isLockedUnder3Hours ? "#9ca3af" : "#f43f5e",
                    border: `1px solid ${isLockedUnder3Hours ? "rgba(75, 85, 99, 0.3)" : "rgba(225, 29, 72, 0.3)"}`,
                    fontWeight: 800,
                    fontSize: "13px",
                    cursor: isLockedUnder3Hours ? "not-allowed" : "pointer",
                    opacity: isLockedUnder3Hours ? 0.6 : 1,
                  }}
                >
                  {isLockedUnder3Hours
                    ? "✕ Cancellation Locked (< 3h Left)"
                    : "Cancel Booking (100% Full Refund)"}
                </button>
              );
            })()}
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>

      {/* CANCELLATION DRAWER (POLICY-GOVERNED) */}
      {selectedAppt && (
        <CancellationDrawer
          isOpen={cancelDrawerOpen}
          onClose={() => setCancelDrawerOpen(false)}
          appointmentId={selectedAppt.id}
          organizationId={orgId}
          onCancelled={() => {
            fetchAppointments();
            setSelectedAppt(null);
          }}
        />
      )}

      {/* WALK-IN / "+ NEW APPOINTMENT" MODAL */}
      <AnimatePresence>
        {isNewModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(6px)",
              display: "grid",
              placeItems: "center",
              zIndex: 110,
              padding: "20px",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !creatingAppt) setIsNewModalOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", damping: 26, stiffness: 340 }}
              style={{
                backgroundColor: "#0f172a",
                borderRadius: "14px",
                border: "1px solid #1e293b",
                width: "100%",
                maxWidth: "600px",
                maxHeight: "90vh",
                overflowY: "auto",
                padding: "28px",
                boxShadow: "0 20px 60px rgba(0, 0, 0, 0.9)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <div>
                  <span style={{ fontSize: "11px", fontWeight: 800, color: "#38bdf8", textTransform: "uppercase" }}>
                    DIRECT BOOKING ENGINE
                  </span>
                  <h2 style={{ fontSize: "20px", fontWeight: 850, color: "#f8fafc", margin: "4px 0 0 0" }}>
                    Create Manual / Walk-In Appointment
                  </h2>
                </div>
                <button
                  onClick={() => !creatingAppt && setIsNewModalOpen(false)}
                  style={{ backgroundColor: "#1e293b", border: "none", color: "#94a3b8", width: "32px", height: "32px", borderRadius: "50%", cursor: "pointer", display: "grid", placeItems: "center" }}
                >
                  <X size={16} />
                </button>
              </div>

              <MotionAlert isVisible={Boolean(newApptError)} type="error">
                <SanitizedAlert
                  error={newApptError}
                  onDismiss={() => setNewApptError(null)}
                  style={{ marginBottom: "16px" }}
                />
              </MotionAlert>

            <form onSubmit={handleCreateNewAppointment} style={{ display: "grid", gap: "16px" }}>
              {/* Location Selector */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1", display: "block", marginBottom: "6px" }}>
                  Operating Location *
                </label>
                <select
                  value={newLocationId}
                  onChange={(e) => setNewLocationId(e.target.value)}
                  required
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} {loc.city ? `(${loc.city})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Service & Staff Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1", display: "block", marginBottom: "6px" }}>
                    Service Offering *
                  </label>
                  <select
                    value={newServiceId}
                    onChange={(e) => setNewServiceId(e.target.value)}
                    required
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                  >
                    {servicesList.map((srv) => (
                      <option key={srv.id} value={srv.id}>
                        {srv.name} ({srv.durationMin}m · {formatMoney(srv.priceCents, srv.currency)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1", display: "block", marginBottom: "6px" }}>
                    Specialist Assignment
                  </label>
                  <select
                    value={newStaffId}
                    onChange={(e) => setNewStaffId(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                  >
                    <option value="">Any Specialist / Unassigned</option>
                    {staffList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName} {s.title ? `(${s.title})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Target Date & Available Slots */}
              <div style={{ backgroundColor: "#131c31", padding: "14px", borderRadius: "8px", border: "1px solid #1e293b" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#38bdf8" }}>
                    Date & Live Authoritative Availability
                  </label>
                  <input
                    type="date"
                    value={newApptDate}
                    onChange={(e) => setNewApptDate(e.target.value)}
                    style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "12px" }}
                  />
                </div>

                {isSlotsLoading ? (
                  <div style={{ color: "#94a3b8", fontSize: "12px", padding: "12px 0", textAlign: "center" }}>
                    Evaluating operating schedule, staff breaks, and overlaps…
                  </div>
                ) : availableSlots.filter((s) => s.available).length === 0 ? (
                  <div style={{ color: "#fbbf24", fontSize: "12px", padding: "8px 0" }}>
                    ⚠️ No regular slots available on this date. You can provide a Staff Override Reason below to force booking.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "120px", overflowY: "auto", marginTop: "6px" }}>
                    {availableSlots
                      .filter((s) => s.available)
                      .map((slot) => {
                        const timeStr = new Date(slot.slotUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                        const isChosen = selectedSlot === slot.slotUtc;
                        return (
                          <button
                            key={slot.slotUtc}
                            type="button"
                            onClick={() => setSelectedSlot(slot.slotUtc)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "6px",
                              border: `1px solid ${isChosen ? "#38bdf8" : "#334155"}`,
                              backgroundColor: isChosen ? "#0284c7" : "#1e293b",
                              color: "#f8fafc",
                              fontSize: "12px",
                              fontWeight: isChosen ? 800 : 600,
                              cursor: "pointer",
                            }}
                          >
                            {timeStr}
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Customer Mode: Existing vs New */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Client Identity</label>
                  <div style={{ display: "flex", gap: "4px", backgroundColor: "#1e293b", padding: "2px", borderRadius: "6px" }}>
                    <button
                      type="button"
                      onClick={() => setCustomerMode("existing")}
                      style={{
                        padding: "3px 10px",
                        borderRadius: "4px",
                        border: "none",
                        backgroundColor: customerMode === "existing" ? "#0284c7" : "transparent",
                        color: customerMode === "existing" ? "#fff" : "#94a3b8",
                        fontSize: "11.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Existing Directory
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerMode("new")}
                      style={{
                        padding: "3px 10px",
                        borderRadius: "4px",
                        border: "none",
                        backgroundColor: customerMode === "new" ? "#0284c7" : "transparent",
                        color: customerMode === "new" ? "#fff" : "#94a3b8",
                        fontSize: "11.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      + New / Walk-In
                    </button>
                  </div>
                </div>

                {customerMode === "existing" ? (
                  <div>
                    <input
                      type="text"
                      placeholder="Filter directory by client name or email..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "12px", marginBottom: "6px" }}
                    />
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                    >
                      <option value="">Select a registered client…</option>
                      {existingCustomers
                        .filter(
                          (c) =>
                            !customerSearch.trim() ||
                            c.fullName.toLowerCase().includes(customerSearch.toLowerCase()) ||
                            c.email.toLowerCase().includes(customerSearch.toLowerCase())
                        )
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.fullName} ({c.email})
                          </option>
                        ))}
                    </select>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <input
                        type="text"
                        placeholder="Full Name *"
                        required
                        value={newCustomerName}
                        onChange={(e) => setNewCustomerName(e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                      />
                    </div>
                    <div>
                      <input
                        type="email"
                        placeholder="Email Address *"
                        required
                        value={newCustomerEmail}
                        onChange={(e) => setNewCustomerEmail(e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                      />
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <input
                        type="tel"
                        placeholder="Phone Number (Optional)"
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Payment & Internal Notes */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1", display: "block", marginBottom: "6px" }}>
                    Payment Status
                  </label>
                  <select
                    value={newPaymentStatus}
                    onChange={(e) => setNewPaymentStatus(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                  >
                    <option value="UNPAID">UNPAID</option>
                    <option value="PAID">PAID</option>
                    <option value="PENDING">PENDING</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1", display: "block", marginBottom: "6px" }}>
                    Internal Operational Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. VIP client, preferred station, walk-in"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                  />
                </div>
              </div>

              {/* Override Reason (Required if no slot selected) */}
              {!selectedSlot && (
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#f59e0b", display: "block", marginBottom: "4px" }}>
                    Staff Override Reason (Required if forcing custom slot)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Owner direct override, client walk-in squeeze"
                    value={newOverrideReason}
                    onChange={(e) => setNewOverrideReason(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #d97706", backgroundColor: "#1e293b", color: "#fff", fontSize: "13px" }}
                  />
                </div>
              )}

              {/* Submit Buttons */}
              <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  disabled={creatingAppt}
                  style={{ flex: 1, padding: "12px", borderRadius: "8px", backgroundColor: "#1e293b", color: "#94a3b8", border: "1px solid #334155", fontWeight: 700, fontSize: "13.5px", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingAppt}
                  style={{
                    flex: 2,
                    padding: "12px",
                    borderRadius: "8px",
                    backgroundColor: "#0284c7",
                    color: "#fff",
                    border: "none",
                    fontWeight: 800,
                    fontSize: "14px",
                    cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(2, 132, 199, 0.4)",
                  }}
                >
                  {creatingAppt ? "Authorizing & Booking…" : "Confirm & Create Appointment"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

      {/* FRONT DESK LIVE CAMERA QR SCANNER MODAL */}
      <AnimatePresence>
        {isScannerModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.85)",
              backdropFilter: "blur(12px)",
              display: "grid",
              placeItems: "center",
              zIndex: 120,
              padding: "20px",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !isVerifyingQr) {
                setIsScannerModalOpen(false);
                setScanFeedback(null);
              }
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              style={{
                backgroundColor: "var(--color-paper, #0b111b)",
                backgroundImage: "radial-gradient(ellipse 80% 50% at 50% -20%, oklch(24% 0.04 260 / 40%) 0%, transparent 100%)",
                borderRadius: "24px",
                border: "1px solid var(--color-border, #1e293b)",
                boxShadow: "0 32px 80px -16px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)",
                width: "100%",
                maxWidth: "620px",
                padding: "24px",
                display: "grid",
                gap: "18px",
                position: "relative",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "12px",
                      backgroundColor: "rgba(56, 189, 248, 0.12)",
                      border: "1px solid rgba(56, 189, 248, 0.3)",
                      color: "#38bdf8",
                      display: "grid",
                      placeItems: "center",
                      boxShadow: "0 0 16px rgba(56, 189, 248, 0.15)",
                    }}
                  >
                    <QrCode size={22} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <h3 style={{ fontSize: "17px", fontWeight: 800, color: "#f8fafc", margin: 0, letterSpacing: "-0.01em" }}>
                        Front-Desk Pass Scanner
                      </h3>
                      <span
                        style={{
                          fontSize: "10px",
                          fontFamily: "var(--font-mono, monospace)",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "6px",
                          backgroundColor: "rgba(52, 211, 153, 0.15)",
                          color: "#34d399",
                          border: "1px solid rgba(52, 211, 153, 0.3)",
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                        }}
                      >
                        HMAC Live
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                      Scan mobile client pass or enter cryptographic token
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsScannerModalOpen(false);
                    setScanFeedback(null);
                  }}
                  disabled={isVerifyingQr}
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: "#94a3b8",
                    width: "32px",
                    height: "32px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                    transition: "all 0.15s ease",
                  }}
                >
                  <X size={15} />
                </button>
              </div>

              {/* Live Camera Scanner Viewfinder & Workstation */}
              <CameraQrScanner
                active={isScannerModalOpen}
                isVerifying={isVerifyingQr}
                scanFeedback={scanFeedback}
                onClearFeedback={() => setScanFeedback(null)}
                onScan={(token) => handleQrScanSubmit(undefined, token)}
                onClose={() => {
                  setIsScannerModalOpen(false);
                  setScanFeedback(null);
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Staff Manual Override Confirmation Modal */}
      <AnimatePresence>
        {selectedHoldToOverride && (() => {
          const minutesLeft = Math.max(0, Math.round((new Date(selectedHoldToOverride.expiresAt).getTime() - Date.now()) / 60000));
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 150,
                backgroundColor: "rgba(0,0,0,0.8)",
                backdropFilter: "blur(8px)",
                display: "grid",
                placeItems: "center",
                padding: "20px",
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelectedHoldToOverride(null);
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ type: "spring", damping: 25, stiffness: 350 }}
                style={{
                  maxWidth: "500px",
                  width: "100%",
                  backgroundColor: "#0d1522",
                  border: "1px solid rgba(245, 158, 11, 0.5)",
                  borderRadius: "16px",
                  padding: "28px",
                  boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
                  color: "#f8fafc",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      backgroundColor: "rgba(245, 158, 11, 0.2)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "20px",
                    }}
                  >
                    ⏳
                  </div>
                  <div>
                    <h3 style={{ fontSize: "17px", fontWeight: 850, margin: 0 }}>
                      Waitlist Fast-Pass Hold Active
                    </h3>
                    <span style={{ fontSize: "12px", color: "#fbbf24", fontWeight: 700 }}>
                      Held for {selectedHoldToOverride.customerName} (Expires in {minutesLeft}m)
                    </span>
                  </div>
                </div>

                <div style={{ backgroundColor: "#1e293b", borderRadius: "10px", padding: "14px", fontSize: "13px", display: "grid", gap: "6px", marginBottom: "16px" }}>
                  <div><strong>Service:</strong> {selectedHoldToOverride.serviceName}</div>
                  <div>
                    <strong>Slot Window:</strong>{" "}
                    {new Date(selectedHoldToOverride.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                    {new Date(selectedHoldToOverride.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  {selectedHoldToOverride.staffName && (
                    <div><strong>Specialist:</strong> {selectedHoldToOverride.staffName}</div>
                  )}
                  {selectedHoldToOverride.score !== undefined && (
                    <div><strong>Optimizer Match Score:</strong> <span style={{ color: "#38bdf8", fontWeight: 800 }}>{selectedHoldToOverride.score}%</span></div>
                  )}
                </div>

                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(245, 158, 11, 0.1)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    fontSize: "12.5px",
                    color: "#cbd5e1",
                    marginBottom: "20px",
                    lineHeight: "1.4",
                  }}
                >
                  <strong>Staff Protocol:</strong> Overriding this hold will immediately cancel the pending offer, release the database lock, and safely return <strong>{selectedHoldToOverride.customerName}</strong> to <strong>Priority #1</strong> in the waitlist queue so they are offered the next upcoming opening.
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setSelectedHoldToOverride(null)}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: "8px",
                      backgroundColor: "#1e293b",
                      border: "1px solid #334155",
                      color: "#94a3b8",
                      fontWeight: 700,
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewApptDate(new Date(selectedHoldToOverride.startAt).toISOString().split("T")[0]);
                      setSelectedSlot(selectedHoldToOverride.startAt);
                      if (selectedHoldToOverride.serviceId) setNewServiceId(selectedHoldToOverride.serviceId);
                      if (selectedHoldToOverride.staffId) setNewStaffId(selectedHoldToOverride.staffId);
                      setOverrideWaitlistHoldFlag(true);
                      setNewOverrideReason("Staff calendar manual override");
                      setIsNewModalOpen(true);
                    }}
                    style={{
                      flex: 2,
                      padding: "10px",
                      borderRadius: "8px",
                      backgroundColor: "#f59e0b",
                      color: "#0f172a",
                      border: "none",
                      fontWeight: 850,
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    ⚡ Override & Book Walk-In
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
