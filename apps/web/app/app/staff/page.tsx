/* Hallmark · macrostructure: Staff Roster, Shifts, Breaks & Time-Off Management · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 */
"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Users,
  Clock,
  MapPin,
  Check,
  Building,
  Mail,
  Shield,
  Briefcase,
  Plus,
  Scissors,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Coffee,
  CalendarX,
  Calendar,
  DollarSign,
  Eye,
  EyeOff,
  Sparkles,
  Tag,
  ChevronRight,
  Filter,
  Search,
  X,
} from "../../../components/icons";
import { apiFetch } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { useRealtimeEvents } from "../../../lib/use-realtime-events";
import { PageHeader } from "../../../components/shell/app-shell";
import { GlassCard, GlassBadge } from "../../../components/glass-card";
import { sanitizeErrorMessage, SanitizedError } from "../../../lib/error-utils";
import { SanitizedAlert } from "../../../components/sanitized-alert";
import { motion, AnimatePresence } from "framer-motion";
import {
  SpotlightCard,
  AnimatedGroup,
  MotionAlert,
  CollapsibleDisclosure,
} from "../../../components/motion-primitives";

interface ServiceItem {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  currency?: string;
  category?: string;
}

interface LocationItem {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
}

interface StaffAvailabilityItem {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  locationId?: string | null;
}

interface StaffBreakItem {
  id?: string;
  dayOfWeek?: number | null;
  startTime: string;
  endTime: string;
  label?: string | null;
}

interface StaffLeaveItem {
  id: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  status: string;
  approvedAt?: string | null;
}

interface StaffServiceLinkItem {
  id?: string;
  serviceId: string;
  service?: ServiceItem;
  customPriceCents?: number | null;
  customDurationMin?: number | null;
}

interface StaffItem {
  id: string;
  displayName: string;
  fullName?: string;
  email?: string;
  title?: string;
  bio?: string;
  avatarUrl?: string;
  calendarColor?: string;
  bookingVisible: boolean;
  isActive: boolean;
  skills?: string[] | null;
  membership?: {
    roleCode?: string;
    user?: {
      id: string;
      email: string;
      fullName: string;
      phone?: string;
    };
  };
  staffLocations?: Array<{ locationId: string; location: LocationItem }>;
  staffServices?: StaffServiceLinkItem[];
  availabilities?: StaffAvailabilityItem[];
  breaks?: StaffBreakItem[];
  leaves?: StaffLeaveItem[];
}

interface StaffFormData {
  displayName: string;
  fullName: string;
  email: string;
  title: string;
  bio: string;
  roleCode: "OWNER" | "ADMIN" | "MANAGER" | "RECEPTIONIST" | "STAFF";
  calendarColor: string;
  bookingVisible: boolean;
  isActive: boolean;
  skills: string[];
  locationIds: string[];
  serviceIds: string[];
  serviceOverrides: Record<string, { customPriceDollars?: string; customDurationMin?: string }>;
}

const INITIAL_STAFF_FORM: StaffFormData = {
  displayName: "",
  fullName: "",
  email: "",
  title: "",
  bio: "",
  roleCode: "STAFF",
  calendarColor: "#0284c7",
  bookingVisible: true,
  isActive: true,
  skills: [],
  locationIds: [],
  serviceIds: [],
  serviceOverrides: {},
};

const COLOR_PRESETS = [
  { name: "Sky Blue", hex: "#0284c7" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Rose", hex: "#f43f5e" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Indigo", hex: "#6366f1" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Slate", hex: "#64748b" },
];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface DayScheduleConfig {
  active: boolean;
  start: string;
  end: string;
  locationId: string; // "ALL" or locationId
  breaks: Array<{ startTime: string; endTime: string; label: string }>;
}

type WeekScheduleConfig = Record<number, DayScheduleConfig>;

const DEFAULT_SCHEDULE: WeekScheduleConfig = {
  0: { active: false, start: "10:00", end: "16:00", locationId: "ALL", breaks: [] },
  1: { active: true, start: "09:00", end: "17:00", locationId: "ALL", breaks: [{ startTime: "12:00", endTime: "13:00", label: "Lunch Break" }] },
  2: { active: true, start: "09:00", end: "17:00", locationId: "ALL", breaks: [{ startTime: "12:00", endTime: "13:00", label: "Lunch Break" }] },
  3: { active: true, start: "09:00", end: "17:00", locationId: "ALL", breaks: [{ startTime: "12:00", endTime: "13:00", label: "Lunch Break" }] },
  4: { active: true, start: "09:00", end: "17:00", locationId: "ALL", breaks: [{ startTime: "12:00", endTime: "13:00", label: "Lunch Break" }] },
  5: { active: true, start: "09:00", end: "17:00", locationId: "ALL", breaks: [{ startTime: "12:00", endTime: "13:00", label: "Lunch Break" }] },
  6: { active: false, start: "10:00", end: "16:00", locationId: "ALL", breaks: [] },
};

export default function StaffManagementPage() {
  const { user } = useAuth();
  const [staffList, setStaffList] = useState<StaffItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SanitizedError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showAllStaff, setShowAllStaff] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("ALL");
  const [filterBranch, setFilterBranch] = useState<string>("ALL");
  const [filterBooking, setFilterBooking] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // Staff Profile Modal (Create / Edit)
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<StaffFormData>(INITIAL_STAFF_FORM);
  const [skillInput, setSkillInput] = useState("");
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  // Schedule & Breaks Modal
  const [scheduleStaff, setScheduleStaff] = useState<StaffItem | null>(null);
  const [scheduleConfig, setScheduleConfig] = useState<WeekScheduleConfig>(DEFAULT_SCHEDULE);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Leave / Time-Off Modal
  const [leaveStaff, setLeaveStaff] = useState<StaffItem | null>(null);
  const [newLeaveStart, setNewLeaveStart] = useState("");
  const [newLeaveEnd, setNewLeaveEnd] = useState("");
  const [newLeaveReason, setNewLeaveReason] = useState("");
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  // Live SSE synchronization
  const fetchAll = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const [staffRes, srvRes, locRes] = await Promise.all([
        apiFetch<StaffItem[]>("/staff"),
        apiFetch<ServiceItem[]>("/services"),
        apiFetch<LocationItem[]>("/locations"),
      ]);

      if (staffRes.success && Array.isArray(staffRes.data)) {
        setStaffList(staffRes.data);
      } else {
        setError(sanitizeErrorMessage(staffRes.error?.message, "Failed to load staff roster."));
      }

      if (srvRes.success && Array.isArray(srvRes.data)) {
        setServices(srvRes.data);
      }

      if (locRes.success && Array.isArray(locRes.data)) {
        setLocations(locRes.data);
      }
    } catch (err: any) {
      setError(sanitizeErrorMessage(err.message, "Failed to connect to staff service."));
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll(true);
  }, [fetchAll]);

  // Real-time Event Subscription
  const { isConnected: isRealtimeLive } = useRealtimeEvents(user?.organizationId, {
    onEvent: (hint) => {
      if (hint.type.startsWith("staff.") || hint.type.startsWith("schedule.")) {
        fetchAll(false);
      }
    },
  });

  // KPIs
  const kpis = useMemo(() => {
    const total = staffList.length;
    const onlineBookable = staffList.filter((s) => s.bookingVisible && s.isActive).length;
    let totalWeeklyHours = 0;
    let currentlyOnLeave = 0;
    const now = new Date();

    for (const st of staffList) {
      if (!st.isActive) continue;
      if (st.availabilities) {
        for (const av of st.availabilities) {
          const [sh, sm] = av.startTime.split(":").map(Number);
          const [eh, em] = av.endTime.split(":").map(Number);
          const hrs = eh + em / 60 - (sh + sm / 60);
          if (hrs > 0) totalWeeklyHours += hrs;
        }
      }
      if (st.leaves) {
        const hasActiveLeave = st.leaves.some((l) => {
          const start = new Date(l.startDate);
          const end = new Date(l.endDate);
          return now >= start && now <= end;
        });
        if (hasActiveLeave) currentlyOnLeave++;
      }
    }

    return {
      total,
      onlineBookable,
      totalWeeklyHours: Math.round(totalWeeklyHours),
      currentlyOnLeave,
    };
  }, [staffList]);

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return staffList.filter((st) => {
      // Text search
      if (q) {
        const matchesName = st.displayName.toLowerCase().includes(q) || (st.fullName && st.fullName.toLowerCase().includes(q));
        const matchesTitle = st.title && st.title.toLowerCase().includes(q);
        const matchesEmail = st.email && st.email.toLowerCase().includes(q);
        const matchesSkill = st.skills && st.skills.some((sk) => sk.toLowerCase().includes(q));
        if (!matchesName && !matchesTitle && !matchesEmail && !matchesSkill) return false;
      }

      // Role filter
      if (filterRole !== "ALL") {
        const role = st.membership?.roleCode || "STAFF";
        if (role !== filterRole) return false;
      }

      // Branch filter
      if (filterBranch !== "ALL") {
        const hasBranch = st.staffLocations?.some((sl) => sl.locationId === filterBranch);
        if (!hasBranch) return false;
      }

      // Booking filter
      if (filterBooking === "ONLINE" && !st.bookingVisible) return false;
      if (filterBooking === "INTERNAL" && st.bookingVisible) return false;

      // Status filter
      if (filterStatus === "ACTIVE" && !st.isActive) return false;
      if (filterStatus === "INACTIVE" && st.isActive) return false;

      return true;
    });
  }, [staffList, searchQuery, filterRole, filterBranch, filterBooking, filterStatus]);

  // Profile Modal Handlers
  const openCreateModal = () => {
    setEditingStaffId(null);
    setProfileForm({
      ...INITIAL_STAFF_FORM,
      locationIds: locations.map((l) => l.id),
      serviceIds: services.map((s) => s.id),
      serviceOverrides: {},
    });
    setSkillInput("");
    setProfileErrors({});
    setShowProfileModal(true);
  };

  const openEditModal = (st: StaffItem) => {
    setEditingStaffId(st.id);
    const assignedLocationIds = (st.staffLocations || [])
      .map((sl) => sl.locationId || sl.location?.id)
      .filter((id): id is string => Boolean(id));
    const assignedServiceIds = (st.staffServices || [])
      .map((ss) => ss.serviceId || ss.service?.id)
      .filter((id): id is string => Boolean(id));

    const overrides: Record<string, { customPriceDollars?: string; customDurationMin?: string }> = {};
    if (st.staffServices) {
      for (const ss of st.staffServices) {
        if (ss.customPriceCents !== null && ss.customPriceCents !== undefined) {
          overrides[ss.serviceId] = {
            ...overrides[ss.serviceId],
            customPriceDollars: (ss.customPriceCents / 100).toFixed(2),
          };
        }
        if (ss.customDurationMin !== null && ss.customDurationMin !== undefined) {
          overrides[ss.serviceId] = {
            ...overrides[ss.serviceId],
            customDurationMin: ss.customDurationMin.toString(),
          };
        }
      }
    }

    setProfileForm({
      displayName: st.displayName,
      fullName: st.fullName || st.displayName,
      email: st.email || st.membership?.user?.email || "",
      title: st.title || "",
      bio: st.bio || "",
      roleCode: (st.membership?.roleCode as any) || "STAFF",
      calendarColor: st.calendarColor || "#0284c7",
      bookingVisible: st.bookingVisible !== false,
      isActive: st.isActive !== false,
      skills: Array.isArray(st.skills) ? [...st.skills] : [],
      locationIds: assignedLocationIds,
      serviceIds: assignedServiceIds,
      serviceOverrides: overrides,
    });
    setSkillInput("");
    setProfileErrors({});
    setShowProfileModal(true);
  };

  const handleProfileFieldChange = <K extends keyof StaffFormData>(field: K, value: StaffFormData[K]) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
    if (profileErrors[field]) {
      setProfileErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const toggleLocationSelection = (locId: string) => {
    setProfileForm((prev) => {
      const exists = prev.locationIds.includes(locId);
      const next = exists ? prev.locationIds.filter((id) => id !== locId) : [...prev.locationIds, locId];
      return { ...prev, locationIds: next };
    });
  };

  const toggleServiceSelection = (srvId: string) => {
    setProfileForm((prev) => {
      const exists = prev.serviceIds.includes(srvId);
      const next = exists ? prev.serviceIds.filter((id) => id !== srvId) : [...prev.serviceIds, srvId];
      return { ...prev, serviceIds: next };
    });
  };

  const addSkillTag = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !profileForm.skills.includes(trimmed)) {
      setProfileForm((prev) => ({ ...prev, skills: [...prev.skills, trimmed] }));
      setSkillInput("");
    }
  };

  const removeSkillTag = (tag: string) => {
    setProfileForm((prev) => ({ ...prev, skills: prev.skills.filter((s) => s !== tag) }));
  };

  const validateProfileForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!profileForm.displayName.trim()) errors.displayName = "Practitioner name is required";
    if (!profileForm.email.trim()) errors.email = "Email address is required";
    if (profileForm.bookingVisible) {
      if (profileForm.locationIds.length === 0) {
        errors.locationIds = "At least 1 branch location is required for online booking.";
      }
      if (profileForm.serviceIds.length === 0) {
        errors.serviceIds = "At least 1 bookable service is required for online booking.";
      }
    }
    setProfileErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateProfileForm()) return;

    setSubmitting(true);
    setError(null);

    // Prepare service overrides array
    const serviceOverrides: Array<{ serviceId: string; customPriceCents?: number; customDurationMin?: number }> = [];
    for (const srvId of profileForm.serviceIds) {
      const ov = profileForm.serviceOverrides[srvId];
      if (ov) {
        const priceCents = ov.customPriceDollars ? Math.round(parseFloat(ov.customPriceDollars) * 100) : undefined;
        const durationMin = ov.customDurationMin ? parseInt(ov.customDurationMin, 10) : undefined;
        if (priceCents !== undefined || durationMin !== undefined) {
          serviceOverrides.push({
            serviceId: srvId,
            customPriceCents: isNaN(priceCents as any) ? undefined : priceCents,
            customDurationMin: isNaN(durationMin as any) ? undefined : durationMin,
          });
        }
      }
    }

    const payload = {
      displayName: profileForm.displayName.trim(),
      fullName: profileForm.fullName.trim() || profileForm.displayName.trim(),
      email: profileForm.email.trim().toLowerCase(),
      title: profileForm.title.trim() || undefined,
      bio: profileForm.bio.trim() || undefined,
      roleCode: profileForm.roleCode,
      calendarColor: profileForm.calendarColor,
      bookingVisible: profileForm.bookingVisible,
      isActive: profileForm.isActive,
      skills: profileForm.skills.length > 0 ? profileForm.skills : undefined,
      locationIds: profileForm.locationIds.length > 0 ? profileForm.locationIds : undefined,
      serviceIds: profileForm.serviceIds.length > 0 ? profileForm.serviceIds : undefined,
      serviceOverrides: serviceOverrides.length > 0 ? serviceOverrides : undefined,
    };

    try {
      const res = editingStaffId
        ? await apiFetch(`/staff/${editingStaffId}`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiFetch("/staff", { method: "POST", body: JSON.stringify(payload) });

      if (res.success) {
        setShowProfileModal(false);
        setSuccessMessage(editingStaffId ? "Staff profile updated successfully." : "New practitioner added to roster.");
        setTimeout(() => setSuccessMessage(null), 4000);
        await fetchAll(false);
      } else {
        setError(sanitizeErrorMessage(res.error?.message, "Failed to save practitioner profile."));
      }
    } catch (err: any) {
      setError(sanitizeErrorMessage(err.message, "An unexpected error occurred."));
    } finally {
      setSubmitting(false);
    }
  };

  // Schedule Modal Handlers
  const openScheduleModal = (st: StaffItem) => {
    setScheduleStaff(st);
    setScheduleError(null);

    const initialSchedule: WeekScheduleConfig = JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));

    // Reset to inactive first
    for (let i = 0; i <= 6; i++) {
      initialSchedule[i].active = false;
      initialSchedule[i].breaks = [];
    }

    // Populate from existing availabilities
    if (st.availabilities && st.availabilities.length > 0) {
      for (const av of st.availabilities) {
        if (av.dayOfWeek >= 0 && av.dayOfWeek <= 6) {
          initialSchedule[av.dayOfWeek].active = true;
          initialSchedule[av.dayOfWeek].start = av.startTime;
          initialSchedule[av.dayOfWeek].end = av.endTime;
          initialSchedule[av.dayOfWeek].locationId = av.locationId || "ALL";
        }
      }
    }

    // Populate from existing breaks
    if (st.breaks && st.breaks.length > 0) {
      for (const brk of st.breaks) {
        if (brk.dayOfWeek !== null && brk.dayOfWeek !== undefined && brk.dayOfWeek >= 0 && brk.dayOfWeek <= 6) {
          initialSchedule[brk.dayOfWeek].breaks.push({
            startTime: brk.startTime,
            endTime: brk.endTime,
            label: brk.label || "Break",
          });
        }
      }
    }

    setScheduleConfig(initialSchedule);
  };

  const handleAddBreak = (dayIndex: number) => {
    setScheduleConfig((prev) => {
      const current = prev[dayIndex];
      const newBreak = { startTime: "12:00", endTime: "13:00", label: "Lunch Break" };
      return {
        ...prev,
        [dayIndex]: {
          ...current,
          breaks: [...current.breaks, newBreak],
        },
      };
    });
  };

  const handleRemoveBreak = (dayIndex: number, breakIndex: number) => {
    setScheduleConfig((prev) => {
      const current = prev[dayIndex];
      return {
        ...prev,
        [dayIndex]: {
          ...current,
          breaks: current.breaks.filter((_, idx) => idx !== breakIndex),
        },
      };
    });
  };

  const handleUpdateBreak = (dayIndex: number, breakIndex: number, field: "startTime" | "endTime" | "label", val: string) => {
    setScheduleConfig((prev) => {
      const current = prev[dayIndex];
      const updatedBreaks = current.breaks.map((b, idx) => {
        if (idx === breakIndex) return { ...b, [field]: val };
        return b;
      });
      return {
        ...prev,
        [dayIndex]: { ...current, breaks: updatedBreaks },
      };
    });
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleStaff) return;

    setSubmitting(true);
    setScheduleError(null);

    const activeDays = (Object.entries(scheduleConfig) as Array<[string, DayScheduleConfig]>).filter(([_, s]) => s.active);

    for (const [day, s] of activeDays) {
      const dayName = DAY_NAMES[parseInt(day, 10)];
      if (s.start >= s.end) {
        setScheduleError(`Invalid shift for ${dayName}: End time must be after start time.`);
        setSubmitting(false);
        return;
      }
      for (const b of s.breaks) {
        if (b.startTime >= b.endTime) {
          setScheduleError(`Invalid break for ${dayName}: End time must be after start time.`);
          setSubmitting(false);
          return;
        }
        if (b.startTime < s.start || b.endTime > s.end) {
          setScheduleError(`Break for ${dayName} (${b.startTime}-${b.endTime}) must fall within shift hours (${s.start}-${s.end}).`);
          setSubmitting(false);
          return;
        }
      }
    }

    const availabilities = activeDays.map(([dayStr, s]) => ({
      dayOfWeek: parseInt(dayStr, 10),
      startTime: s.start,
      endTime: s.end,
      locationId: s.locationId === "ALL" ? undefined : s.locationId,
    }));

    const breaks = activeDays.flatMap(([dayStr, s]) =>
      s.breaks.map((b) => ({
        dayOfWeek: parseInt(dayStr, 10),
        startTime: b.startTime,
        endTime: b.endTime,
        label: b.label || "Break",
      }))
    );

    try {
      const res = await apiFetch(`/staff/${scheduleStaff.id}/availability`, {
        method: "PUT",
        body: JSON.stringify({ availabilities, breaks }),
      });

      if (res.success) {
        setScheduleStaff(null);
        setSuccessMessage(`Working shifts and breaks updated for ${scheduleStaff.displayName}.`);
        setTimeout(() => setSuccessMessage(null), 4000);
        await fetchAll(false);
      } else {
        setScheduleError(res.error?.message || "Failed to update practitioner availability.");
      }
    } catch (err: any) {
      setScheduleError(err.message || "Failed to save schedule.");
    } finally {
      setSubmitting(false);
    }
  };

  // Leave / Time-Off Modal Handlers
  const openLeaveModal = (st: StaffItem) => {
    setLeaveStaff(st);
    setLeaveError(null);
    setNewLeaveStart("");
    setNewLeaveEnd("");
    setNewLeaveReason("");
  };

  const handleCreateLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveStaff) return;
    if (!newLeaveStart || !newLeaveEnd) {
      setLeaveError("Please select both start and end dates/times.");
      return;
    }
    if (new Date(newLeaveEnd) <= new Date(newLeaveStart)) {
      setLeaveError("End date must be strictly after start date.");
      return;
    }

    setLeaveSubmitting(true);
    setLeaveError(null);

    try {
      const res = await apiFetch(`/staff/${leaveStaff.id}/leave`, {
        method: "POST",
        body: JSON.stringify({
          startDate: new Date(newLeaveStart).toISOString(),
          endDate: new Date(newLeaveEnd).toISOString(),
          reason: newLeaveReason.trim() || undefined,
        }),
      });

      if (res.success) {
        setSuccessMessage(`Time-off scheduled for ${leaveStaff.displayName}. Availability slots suppressed.`);
        setTimeout(() => setSuccessMessage(null), 4000);
        // Refresh practitioner data
        const updatedStaff = await apiFetch<StaffItem>(`/staff/${leaveStaff.id}`);
        if (updatedStaff.success && updatedStaff.data) {
          setLeaveStaff(updatedStaff.data);
        }
        setNewLeaveStart("");
        setNewLeaveEnd("");
        setNewLeaveReason("");
        await fetchAll(false);
      } else {
        setLeaveError(res.error?.message || "Failed to record staff leave.");
      }
    } catch (err: any) {
      setLeaveError(err.message || "Failed to schedule time-off.");
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const handleDeleteLeave = async (leaveId: string) => {
    if (!leaveStaff) return;
    if (!confirm("Are you sure you want to cancel this scheduled time-off? Slots will become bookable again.")) return;

    try {
      const res = await apiFetch(`/staff/${leaveStaff.id}/leave/${leaveId}`, {
        method: "DELETE",
      });

      if (res.success) {
        setSuccessMessage("Scheduled time-off cancelled.");
        setTimeout(() => setSuccessMessage(null), 4000);
        const updatedStaff = await apiFetch<StaffItem>(`/staff/${leaveStaff.id}`);
        if (updatedStaff.success && updatedStaff.data) {
          setLeaveStaff(updatedStaff.data);
        }
        await fetchAll(false);
      } else {
        setLeaveError(res.error?.message || "Failed to cancel leave.");
      }
    } catch (err: any) {
      setLeaveError(err.message || "An unexpected error occurred.");
    }
  };

  const handleArchive = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to deactivate "${name}"? They will no longer be available for customer bookings.`)) return;
    const res = await apiFetch(`/staff/${id}`, { method: "DELETE" });
    if (res.success) {
      setSuccessMessage(`Practitioner "${name}" deactivated.`);
      setTimeout(() => setSuccessMessage(null), 3000);
      fetchAll(false);
    } else {
      setError(sanitizeErrorMessage(res.error?.message, "Failed to deactivate staff member."));
    }
  };

  return (
    <div>
      <PageHeader
        title="Staff & Practitioners"
        description="Manage team roster, branches, qualified services, recurring weekly shifts, daily breaks, and time-off leaves."
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {isRealtimeLive && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: "9999px",
                  backgroundColor: "rgba(16, 185, 129, 0.12)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  color: "#34d399",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#34d399" }} />
                <span>Live Sync Active</span>
              </div>
            )}
            <button
              onClick={openCreateModal}
              style={{
                padding: "10px 18px",
                borderRadius: "8px",
                border: "none",
                background: "linear-gradient(135deg, #0284c7, #2563eb)",
                color: "#fff",
                fontWeight: 800,
                fontSize: "13.5px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 4px 14px rgba(2, 132, 199, 0.35)",
              }}
            >
              <Plus size={16} /> Add Practitioner
            </button>
          </div>
        }
      />

      {/* KPI Metrics Strip */}
      <AnimatedGroup
        className="staff-kpi-grid"
        stagger={0.06}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <SpotlightCard spotlightColor="rgba(56, 189, 248, 0.15)" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: "rgba(56, 189, 248, 0.15)", display: "grid", placeItems: "center", color: "#38bdf8" }}>
              <Users size={22} />
            </div>
            <div>
              <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700, textTransform: "uppercase" }}>Total Roster</span>
              <strong style={{ color: "#f8fafc", fontSize: "22px", display: "block", fontWeight: 850 }}>{kpis.total}</strong>
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard spotlightColor="rgba(52, 211, 153, 0.15)" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: "rgba(16, 185, 129, 0.15)", display: "grid", placeItems: "center", color: "#34d399" }}>
              <Eye size={22} />
            </div>
            <div>
              <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700, textTransform: "uppercase" }}>Bookable Online</span>
              <strong style={{ color: "#f8fafc", fontSize: "22px", display: "block", fontWeight: 850 }}>{kpis.onlineBookable}</strong>
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard spotlightColor="rgba(168, 85, 247, 0.15)" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: "rgba(124, 58, 237, 0.15)", display: "grid", placeItems: "center", color: "#c084fc" }}>
              <Clock size={22} />
            </div>
            <div>
              <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700, textTransform: "uppercase" }}>Weekly Capacity</span>
              <strong style={{ color: "#f8fafc", fontSize: "22px", display: "block", fontWeight: 850 }}>{kpis.totalWeeklyHours} hrs</strong>
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard spotlightColor="rgba(245, 158, 11, 0.15)" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: kpis.currentlyOnLeave > 0 ? "rgba(245, 158, 11, 0.15)" : "rgba(100, 116, 139, 0.15)", display: "grid", placeItems: "center", color: kpis.currentlyOnLeave > 0 ? "#f59e0b" : "#94a3b8" }}>
              <CalendarX size={22} />
            </div>
            <div>
              <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700, textTransform: "uppercase" }}>Currently On Leave</span>
              <strong style={{ color: "#f8fafc", fontSize: "22px", display: "block", fontWeight: 850 }}>{kpis.currentlyOnLeave}</strong>
            </div>
          </div>
        </SpotlightCard>
      </AnimatedGroup>

      {/* Notifications */}
      <MotionAlert isVisible={Boolean(error)} type="error">
        <div style={{ marginBottom: "20px" }}>
          <SanitizedAlert error={error} onDismiss={() => setError(null)} />
        </div>
      </MotionAlert>

      <MotionAlert isVisible={Boolean(successMessage)} type="success">
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
      </MotionAlert>

      {/* Search & Filter Bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          marginBottom: "24px",
          padding: "14px 18px",
          backgroundColor: "rgba(15, 23, 42, 0.6)",
          borderRadius: "12px",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 240px" }}>
          <input
            type="text"
            placeholder="Search practitioners by name, title, email, skills…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 14px",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              backgroundColor: "rgba(15, 23, 42, 0.8)",
              color: "#fff",
              fontSize: "13.5px",
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
          {/* Role Filter */}
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.1)", backgroundColor: "#0f172a", color: "#cbd5e1", fontSize: "13px" }}
          >
            <option value="ALL">All Roles</option>
            <option value="STAFF">Practitioners</option>
            <option value="MANAGER">Managers</option>
            <option value="OWNER">Owners</option>
            <option value="RECEPTIONIST">Receptionists</option>
          </select>

          {/* Branch Filter */}
          {locations.length > 1 && (
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.1)", backgroundColor: "#0f172a", color: "#cbd5e1", fontSize: "13px" }}
            >
              <option value="ALL">All Branches</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          )}

          {/* Online Booking Filter */}
          <select
            value={filterBooking}
            onChange={(e) => setFilterBooking(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.1)", backgroundColor: "#0f172a", color: "#cbd5e1", fontSize: "13px" }}
          >
            <option value="ALL">All Bookability</option>
            <option value="ONLINE">Bookable Online</option>
            <option value="INTERNAL">Internal Only</option>
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.1)", backgroundColor: "#0f172a", color: "#cbd5e1", fontSize: "13px" }}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      {/* Staff Grid */}
      {loading ? (
        <div style={{ color: "#94a3b8", padding: "48px 0", textAlign: "center" }}>Loading staff roster…</div>
      ) : filteredStaff.length === 0 ? (
        <GlassCard variant="panel" style={{ padding: "48px 24px", textAlign: "center" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "20px",
              backgroundColor: "rgba(56, 189, 248, 0.12)",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 16px",
              color: "#38bdf8",
            }}
          >
            <Users size={32} />
          </div>
          <h3 style={{ color: "#f8fafc", fontSize: "19px", fontWeight: 800, marginBottom: "8px" }}>
            {searchQuery || filterRole !== "ALL" || filterBranch !== "ALL"
              ? "No Matching Staff Members"
              : "No Staff Profiles Configured"}
          </h3>
          <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "460px", margin: "0 auto 24px" }}>
            {searchQuery || filterRole !== "ALL" || filterBranch !== "ALL"
              ? "Try adjusting your search query or filter parameters."
              : "Add practitioners and team members to assign bookable services and manage working shifts."}
          </p>
          {!searchQuery && (
            <button
              onClick={openCreateModal}
              style={{
                padding: "11px 22px",
                borderRadius: "8px",
                border: "none",
                background: "linear-gradient(135deg, #0284c7, #2563eb)",
                color: "#fff",
                fontWeight: 800,
                fontSize: "14px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Plus size={16} /> Add First Practitioner
            </button>
          )}
        </GlassCard>
      ) : (
        <>
          <AnimatedGroup
            className="staff-roster-grid"
            stagger={0.04}
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "20px" }}
          >
            {(showAllStaff ? filteredStaff : filteredStaff.slice(0, 8)).map((st) => {
            const locCount = st.staffLocations?.length || 0;
            const srvCount = st.staffServices?.length || 0;
            const shiftDaysCount = st.availabilities?.length || 0;
            const breaksCount = st.breaks?.length || 0;
            const leavesCount = st.leaves?.length || 0;
            const role = st.membership?.roleCode || "STAFF";
            const color = st.calendarColor || "#0284c7";

            // Check if on leave right now
            const now = new Date();
            const activeLeave = st.leaves?.find((l) => {
              const start = new Date(l.startDate);
              const end = new Date(l.endDate);
              return now >= start && now <= end;
            });

            return (
              <GlassCard
                key={st.id}
                variant="card"
                glow="subtle"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  padding: "24px",
                  borderLeft: `4px solid ${color}`,
                }}
              >
                <div>
                  {/* Top Row: Avatar, Name, Badges & Actions */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div
                        style={{
                          width: "46px",
                          height: "46px",
                          borderRadius: "12px",
                          backgroundColor: `${color}20`,
                          border: `2px solid ${color}`,
                          display: "grid",
                          placeItems: "center",
                          color: color,
                          fontSize: "17px",
                          fontWeight: 850,
                          boxShadow: `0 0 12px ${color}30`,
                        }}
                      >
                        {st.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <strong style={{ color: "#f8fafc", fontSize: "17px" }}>{st.displayName}</strong>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 800,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor:
                                role === "OWNER"
                                  ? "rgba(245, 158, 11, 0.2)"
                                  : role === "MANAGER"
                                  ? "rgba(168, 85, 247, 0.2)"
                                  : "rgba(56, 189, 248, 0.15)",
                              color:
                                role === "OWNER"
                                  ? "#fbbf24"
                                  : role === "MANAGER"
                                  ? "#c084fc"
                                  : "#38bdf8",
                            }}
                          >
                            {role}
                          </span>
                        </div>
                        <span style={{ color: "#94a3b8", fontSize: "12.5px" }}>{st.title || "Specialist"}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <button
                        onClick={() => openEditModal(st)}
                        title="Edit Profile"
                        style={{ padding: "7px", borderRadius: "7px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(255, 255, 255, 0.05)", color: "#cbd5e1", cursor: "pointer" }}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleArchive(st.id, st.displayName)}
                        title="Deactivate Practitioner"
                        style={{ padding: "7px", borderRadius: "7px", border: "1px solid rgba(225, 29, 72, 0.25)", backgroundColor: "rgba(225, 29, 72, 0.08)", color: "#fb7185", cursor: "pointer" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Status Badges Row */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "14px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        fontSize: "11.5px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "9999px",
                        backgroundColor: st.isActive ? "rgba(16, 185, 129, 0.12)" : "rgba(100, 116, 139, 0.15)",
                        color: st.isActive ? "#34d399" : "#94a3b8",
                        border: st.isActive ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(100, 116, 139, 0.3)",
                      }}
                    >
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: st.isActive ? "#34d399" : "#94a3b8" }} />
                      {st.isActive ? "Active Roster" : "Inactive"}
                    </span>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        fontSize: "11.5px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "9999px",
                        backgroundColor: st.bookingVisible ? "rgba(56, 189, 248, 0.12)" : "rgba(100, 116, 139, 0.15)",
                        color: st.bookingVisible ? "#38bdf8" : "#94a3b8",
                        border: st.bookingVisible ? "1px solid rgba(56, 189, 248, 0.3)" : "1px solid rgba(100, 116, 139, 0.3)",
                      }}
                    >
                      {st.bookingVisible ? <Eye size={11} /> : <EyeOff size={11} />}
                      {st.bookingVisible ? "Bookable Online" : "Internal Only"}
                    </span>

                    {activeLeave && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          fontSize: "11.5px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "9999px",
                          backgroundColor: "rgba(245, 158, 11, 0.15)",
                          color: "#f59e0b",
                          border: "1px solid rgba(245, 158, 11, 0.35)",
                        }}
                      >
                        <CalendarX size={11} />
                        Currently On Leave
                      </span>
                    )}
                  </div>

                  {/* Skills tags */}
                  {st.skills && st.skills.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "14px" }}>
                      {st.skills.map((sk, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: "6px",
                            backgroundColor: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            color: "#cbd5e1",
                          }}
                        >
                          #{sk}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Details Grid */}
                  <div style={{ display: "grid", gap: "8px", marginBottom: "16px", fontSize: "13px", color: "#cbd5e1" }}>
                    {st.email && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Mail size={14} color="#94a3b8" />
                        <span style={{ color: "#94a3b8" }}>{st.email}</span>
                      </div>
                    )}

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Clock size={14} color="#38bdf8" />
                      <span>
                        {shiftDaysCount > 0 ? `${shiftDaysCount} working days/week` : "No working shifts assigned"}
                        {breaksCount > 0 && ` (${breaksCount} daily break${breaksCount !== 1 ? "s" : ""})`}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Scissors size={14} color="#34d399" />
                      <span>{srvCount} qualified service{srvCount !== 1 ? "s" : ""}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <MapPin size={14} color="#fbbf24" />
                      <span>{locCount} assigned branch{locCount !== 1 ? "es" : ""}</span>
                    </div>

                    {st.bio && (
                      <p style={{ color: "#94a3b8", fontSize: "12px", margin: "6px 0 0", lineHeight: 1.4 }}>
                        {st.bio}
                      </p>
                    )}
                  </div>
                </div>

                {/* Bottom Action Strip */}
                <div
                  style={{
                    paddingTop: "14px",
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <button
                    onClick={() => openLeaveModal(st)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                      backgroundColor: "rgba(245, 158, 11, 0.08)",
                      color: "#fbbf24",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <CalendarX size={13} /> Time Off {leavesCount > 0 && `(${leavesCount})`}
                  </button>

                  <button
                    onClick={() => openScheduleModal(st)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      border: "1px solid rgba(56, 189, 248, 0.3)",
                      backgroundColor: "rgba(56, 189, 248, 0.1)",
                      color: "#38bdf8",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Clock size={13} /> Shifts & Breaks
                  </button>
                </div>
              </GlassCard>
            );
          })}
        </AnimatedGroup>

        {filteredStaff.length > 8 && (
          <div style={{ textAlign: "center", marginTop: "20px" }}>
            <button
              type="button"
              onClick={() => setShowAllStaff(!showAllStaff)}
              style={{
                padding: "8px 20px",
                backgroundColor: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "8px",
                color: "#38bdf8",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {showAllStaff
                ? "Show fewer practitioners"
                : `Showing 8 of ${filteredStaff.length} practitioners · See all`}
            </button>
          </div>
        )}
      </>
    )}

      {/* Staff Profile Modal (Create / Edit) */}
      <AnimatePresence>
        {showProfileModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              backdropFilter: "blur(10px)",
              display: "grid",
              placeItems: "center",
              padding: "20px",
              overflowY: "auto",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !submitting) setShowProfileModal(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", damping: 26, stiffness: 340 }}
              style={{ width: "100%", maxWidth: "680px", margin: "auto" }}
            >
              <GlassCard variant="elevated" glow="primary" style={{ padding: "28px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", paddingBottom: "14px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}>
                <div>
                  <h3 style={{ fontSize: "20px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                    {editingStaffId ? "Edit Practitioner Profile" : "Add Practitioner to Roster"}
                  </h3>
                  <p style={{ color: "#94a3b8", fontSize: "13px", margin: "4px 0 0" }}>
                    Configure credentials, customer booking visibility, calendar branding, and qualified services.
                  </p>
                </div>
                <button
                  onClick={() => setShowProfileModal(false)}
                  style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleProfileSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Display Name <span style={{ color: "#38bdf8" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.displayName}
                    onChange={(e) => handleProfileFieldChange("displayName", e.target.value)}
                    placeholder="e.g. Dr. Alex Vance / Maya Lin"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: profileErrors.displayName ? "1px solid #fb7185" : "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                  />
                  {profileErrors.displayName && <p style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>{profileErrors.displayName}</p>}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Legal Full Name
                  </label>
                  <input
                    type="text"
                    value={profileForm.fullName}
                    onChange={(e) => handleProfileFieldChange("fullName", e.target.value)}
                    placeholder="Legal full name"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Work Email <span style={{ color: "#38bdf8" }}>*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={profileForm.email}
                    onChange={(e) => handleProfileFieldChange("email", e.target.value)}
                    placeholder="practitioner@yourbusiness.com"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: profileErrors.email ? "1px solid #fb7185" : "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                  />
                  {profileErrors.email && <p style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>{profileErrors.email}</p>}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Professional Title
                  </label>
                  <input
                    type="text"
                    value={profileForm.title}
                    onChange={(e) => handleProfileFieldChange("title", e.target.value)}
                    placeholder="e.g. Master Stylist / Physical Therapist"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Organization Role
                  </label>
                  <select
                    value={profileForm.roleCode}
                    onChange={(e) => handleProfileFieldChange("roleCode", e.target.value as any)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "#0f172a", color: "#fff", fontSize: "13.5px" }}
                  >
                    <option value="STAFF">Practitioner / Staff</option>
                    <option value="MANAGER">Location Manager</option>
                    <option value="OWNER">Owner / Administrator</option>
                    <option value="RECEPTIONIST">Receptionist</option>
                  </select>
                </div>

                {/* Calendar Color Picker */}
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Calendar Color
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="color"
                      value={profileForm.calendarColor}
                      onChange={(e) => handleProfileFieldChange("calendarColor", e.target.value)}
                      style={{ width: "40px", height: "38px", padding: 0, border: "none", borderRadius: "6px", cursor: "pointer", background: "transparent" }}
                    />
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {COLOR_PRESETS.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => handleProfileFieldChange("calendarColor", c.hex)}
                          title={c.name}
                          style={{
                            width: "22px",
                            height: "22px",
                            borderRadius: "50%",
                            backgroundColor: c.hex,
                            border: profileForm.calendarColor === c.hex ? "2px solid #fff" : "1px solid rgba(255, 255, 255, 0.2)",
                            cursor: "pointer",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Booking Visible & Active Toggles */}
                <div style={{ gridColumn: "span 2", display: "flex", gap: "24px", padding: "14px", borderRadius: "8px", backgroundColor: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={profileForm.bookingVisible}
                      onChange={(e) => handleProfileFieldChange("bookingVisible", e.target.checked)}
                      style={{ width: "18px", height: "18px", cursor: "pointer" }}
                    />
                    <div>
                      <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#f8fafc" }}>Bookable Online by Customers</span>
                      <p style={{ color: "#94a3b8", fontSize: "12px", margin: "2px 0 0" }}>Display in customer booking portal and specialist selector.</p>
                    </div>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={profileForm.isActive}
                      onChange={(e) => handleProfileFieldChange("isActive", e.target.checked)}
                      style={{ width: "18px", height: "18px", cursor: "pointer" }}
                    />
                    <div>
                      <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#f8fafc" }}>Active on Roster</span>
                      <p style={{ color: "#94a3b8", fontSize: "12px", margin: "2px 0 0" }}>Decheck to temporarily disable without deleting.</p>
                    </div>
                  </label>
                </div>

                {/* Skills / Specializations Tag Input */}
                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Specialization Tags & Skills
                  </label>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                    <input
                      type="text"
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSkillTag();
                        }
                      }}
                      placeholder="e.g. Balayage, Sports Rehab, Deep Tissue (Press Enter)"
                      style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13px" }}
                    />
                    <button
                      type="button"
                      onClick={addSkillTag}
                      style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid rgba(56, 189, 248, 0.3)", backgroundColor: "rgba(56, 189, 248, 0.1)", color: "#38bdf8", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
                    >
                      Add Tag
                    </button>
                  </div>
                  {profileForm.skills.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {profileForm.skills.map((sk) => (
                        <span
                          key={sk}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            backgroundColor: "rgba(56, 189, 248, 0.12)",
                            border: "1px solid rgba(56, 189, 248, 0.25)",
                            color: "#38bdf8",
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                        >
                          #{sk}
                          <button
                            type="button"
                            onClick={() => removeSkillTag(sk)}
                            style={{ background: "transparent", border: "none", color: "#38bdf8", cursor: "pointer", padding: 0 }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Assigned Locations */}
                {locations.length > 0 && (
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                      Assigned Branch Locations {profileForm.bookingVisible && <span style={{ color: "#38bdf8" }}>*</span>}
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {locations.map((loc) => {
                        const selected = profileForm.locationIds.includes(loc.id);
                        return (
                          <button
                            key={loc.id}
                            type="button"
                            onClick={() => toggleLocationSelection(loc.id)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "8px",
                              border: selected ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.1)",
                              backgroundColor: selected ? "rgba(2, 132, 199, 0.2)" : "rgba(15, 23, 42, 0.6)",
                              color: selected ? "#38bdf8" : "#94a3b8",
                              fontSize: "12.5px",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            {selected && <Check size={12} />}
                            <span>{loc.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    {profileErrors.locationIds && <p style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>{profileErrors.locationIds}</p>}
                  </div>
                )}

                {/* Assigned Services & Custom Overrides */}
                {services.length > 0 && (
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                      Qualified Services {profileForm.bookingVisible && <span style={{ color: "#38bdf8" }}>*</span>}
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", maxHeight: "140px", overflowY: "auto", marginBottom: "10px" }}>
                      {services.map((srv) => {
                        const selected = profileForm.serviceIds.includes(srv.id);
                        return (
                          <button
                            key={srv.id}
                            type="button"
                            onClick={() => toggleServiceSelection(srv.id)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "8px",
                              border: selected ? "1px solid #34d399" : "1px solid rgba(255, 255, 255, 0.1)",
                              backgroundColor: selected ? "rgba(16, 185, 129, 0.18)" : "rgba(15, 23, 42, 0.6)",
                              color: selected ? "#34d399" : "#94a3b8",
                              fontSize: "12.5px",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            {selected && <Check size={12} />}
                            <span>{srv.name} ({srv.durationMin}m)</span>
                          </button>
                        );
                      })}
                    </div>
                    {profileErrors.serviceIds && <p style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>{profileErrors.serviceIds}</p>}
                  </div>
                )}

                {/* Public Bio */}
                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Public Practitioner Bio
                  </label>
                  <textarea
                    rows={2}
                    value={profileForm.bio}
                    onChange={(e) => handleProfileFieldChange("bio", e.target.value)}
                    placeholder="Brief background and expertise displayed on customer booking portal…"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13px", outline: "none", resize: "vertical" }}
                  />
                </div>

                <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px", paddingTop: "14px", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
                  <button
                    type="button"
                    onClick={() => setShowProfileModal(false)}
                    style={{ padding: "10px 18px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "transparent", color: "#94a3b8", fontSize: "13.5px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{ padding: "10px 22px", borderRadius: "8px", border: "none", background: "linear-gradient(135deg, #0284c7, #2563eb)", color: "#fff", fontWeight: 800, fontSize: "13.5px", cursor: submitting ? "not-allowed" : "pointer" }}
                  >
                    {submitting ? "Saving…" : editingStaffId ? "Save Profile" : "Add Practitioner"}
                  </button>
                </div>
              </form>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

      {/* Shifts & Daily Breaks Modal */}
      <AnimatePresence>
        {scheduleStaff && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              backdropFilter: "blur(10px)",
              display: "grid",
              placeItems: "center",
              padding: "20px",
              overflowY: "auto",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !submitting) setScheduleStaff(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", damping: 26, stiffness: 340 }}
              style={{ width: "100%", maxWidth: "680px", margin: "auto" }}
            >
              <GlassCard variant="elevated" glow="primary" style={{ padding: "28px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", paddingBottom: "14px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}>
                <div>
                  <h3 style={{ fontSize: "19px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                    Working Shifts & Breaks: {scheduleStaff.displayName}
                  </h3>
                  <p style={{ color: "#94a3b8", fontSize: "13px", margin: "4px 0 0" }}>
                    Configure recurring weekly availability hours and daily lunch/rest breaks.
                  </p>
                </div>
                <button
                  onClick={() => setScheduleStaff(null)}
                  style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>

              {scheduleError && (
                <div style={{ padding: "10px 14px", backgroundColor: "rgba(225, 29, 72, 0.15)", border: "1px solid rgba(225, 29, 72, 0.4)", borderRadius: "8px", color: "#fb7185", marginBottom: "16px", fontSize: "13px" }}>
                  {scheduleError}
                </div>
              )}

              <form onSubmit={handleSaveSchedule}>
                <div style={{ display: "grid", gap: "12px", marginBottom: "20px", maxHeight: "420px", overflowY: "auto", paddingRight: "4px" }}>
                  {DAY_NAMES.map((name, dayIndex) => {
                    const shift = scheduleConfig[dayIndex];
                    return (
                      <div
                        key={dayIndex}
                        style={{
                          padding: "12px 16px",
                          borderRadius: "10px",
                          backgroundColor: shift.active ? "rgba(15, 23, 42, 0.8)" : "rgba(15, 23, 42, 0.4)",
                          border: shift.active ? "1px solid rgba(56, 189, 248, 0.25)" : "1px solid rgba(255, 255, 255, 0.06)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: shift.active ? "10px" : 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "120px" }}>
                            <input
                              type="checkbox"
                              id={`shift-day-${dayIndex}`}
                              checked={shift.active}
                              onChange={(e) =>
                                setScheduleConfig((prev) => ({
                                  ...prev,
                                  [dayIndex]: { ...prev[dayIndex], active: e.target.checked },
                                }))
                              }
                              style={{ width: "16px", height: "16px", cursor: "pointer" }}
                            />
                            <label htmlFor={`shift-day-${dayIndex}`} style={{ fontSize: "13.5px", fontWeight: 700, color: shift.active ? "#f8fafc" : "#64748b", cursor: "pointer" }}>
                              {name}
                            </label>
                          </div>

                          {shift.active ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <input
                                type="time"
                                value={shift.start}
                                onChange={(e) =>
                                  setScheduleConfig((prev) => ({
                                    ...prev,
                                    [dayIndex]: { ...prev[dayIndex], start: e.target.value },
                                  }))
                                }
                                style={{ padding: "6px 8px", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "#0f172a", color: "#fff", fontSize: "12.5px" }}
                              />
                              <span style={{ color: "#94a3b8", fontSize: "12px" }}>to</span>
                              <input
                                type="time"
                                value={shift.end}
                                onChange={(e) =>
                                  setScheduleConfig((prev) => ({
                                    ...prev,
                                    [dayIndex]: { ...prev[dayIndex], end: e.target.value },
                                  }))
                                }
                                style={{ padding: "6px 8px", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "#0f172a", color: "#fff", fontSize: "12.5px" }}
                              />
                            </div>
                          ) : (
                            <span style={{ fontSize: "12.5px", color: "#64748b", fontStyle: "italic" }}>Off duty</span>
                          )}
                        </div>

                        {/* Breaks subsection */}
                        {shift.active && (
                          <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid rgba(255, 255, 255, 0.06)", paddingLeft: "26px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                              <span style={{ fontSize: "12px", color: "#94a3b8", display: "flex", alignItems: "center", gap: "6px" }}>
                                <Coffee size={12} color="#fbbf24" /> Daily Breaks ({shift.breaks.length})
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAddBreak(dayIndex)}
                                style={{ padding: "3px 8px", borderRadius: "5px", border: "1px solid rgba(245, 158, 11, 0.3)", backgroundColor: "rgba(245, 158, 11, 0.1)", color: "#fbbf24", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                              >
                                + Add Break
                              </button>
                            </div>

                            {shift.breaks.map((brk, bIdx) => (
                              <div key={bIdx} style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                                <input
                                  type="text"
                                  value={brk.label}
                                  onChange={(e) => handleUpdateBreak(dayIndex, bIdx, "label", e.target.value)}
                                  placeholder="Break label (e.g. Lunch)"
                                  style={{ flex: 1, padding: "4px 8px", borderRadius: "5px", border: "1px solid rgba(255, 255, 255, 0.1)", backgroundColor: "#0f172a", color: "#cbd5e1", fontSize: "12px" }}
                                />
                                <input
                                  type="time"
                                  value={brk.startTime}
                                  onChange={(e) => handleUpdateBreak(dayIndex, bIdx, "startTime", e.target.value)}
                                  style={{ padding: "4px 6px", borderRadius: "5px", border: "1px solid rgba(255, 255, 255, 0.1)", backgroundColor: "#0f172a", color: "#fff", fontSize: "12px" }}
                                />
                                <span style={{ color: "#64748b", fontSize: "11px" }}>-</span>
                                <input
                                  type="time"
                                  value={brk.endTime}
                                  onChange={(e) => handleUpdateBreak(dayIndex, bIdx, "endTime", e.target.value)}
                                  style={{ padding: "4px 6px", borderRadius: "5px", border: "1px solid rgba(255, 255, 255, 0.1)", backgroundColor: "#0f172a", color: "#fff", fontSize: "12px" }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBreak(dayIndex, bIdx)}
                                  style={{ background: "transparent", border: "none", color: "#fb7185", cursor: "pointer", fontSize: "14px", padding: "0 4px" }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", paddingTop: "14px", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
                  <button
                    type="button"
                    onClick={() => setScheduleStaff(null)}
                    style={{ padding: "10px 18px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "transparent", color: "#94a3b8", fontSize: "13.5px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{ padding: "10px 22px", borderRadius: "8px", border: "none", background: "linear-gradient(135deg, #0284c7, #2563eb)", color: "#fff", fontWeight: 800, fontSize: "13.5px", cursor: submitting ? "not-allowed" : "pointer" }}
                  >
                    {submitting ? "Saving…" : "Save Shifts & Breaks"}
                  </button>
                </div>
              </form>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

      {/* Time-Off & Leaves Modal */}
      <AnimatePresence>
        {leaveStaff && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              backdropFilter: "blur(10px)",
              display: "grid",
              placeItems: "center",
              padding: "20px",
              overflowY: "auto",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !leaveSubmitting) setLeaveStaff(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", damping: 26, stiffness: 340 }}
              style={{ width: "100%", maxWidth: "600px", margin: "auto" }}
            >
              <GlassCard variant="elevated" glow="primary" style={{ padding: "28px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", paddingBottom: "14px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}>
                <div>
                  <h3 style={{ fontSize: "19px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                    Time Off & Leaves: {leaveStaff.displayName}
                  </h3>
                  <p style={{ color: "#94a3b8", fontSize: "13px", margin: "4px 0 0" }}>
                    Scheduled leaves automatically suppress booking availability on the customer portal.
                  </p>
                </div>
                <button
                  onClick={() => setLeaveStaff(null)}
                  style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>

              {leaveError && (
                <div style={{ padding: "10px 14px", backgroundColor: "rgba(225, 29, 72, 0.15)", border: "1px solid rgba(225, 29, 72, 0.4)", borderRadius: "8px", color: "#fb7185", marginBottom: "16px", fontSize: "13px" }}>
                  {leaveError}
                </div>
              )}

              {/* Existing Leaves List */}
              <div style={{ marginBottom: "24px" }}>
                <h4 style={{ fontSize: "14px", fontWeight: 800, color: "#cbd5e1", marginBottom: "10px" }}>
                  Scheduled Time Off ({leaveStaff.leaves?.length || 0})
                </h4>

                {(!leaveStaff.leaves || leaveStaff.leaves.length === 0) ? (
                  <p style={{ color: "#64748b", fontSize: "13px", fontStyle: "italic", margin: 0 }}>
                    No scheduled time off. Practitioner is available according to standard shifts.
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: "8px", maxHeight: "180px", overflowY: "auto" }}>
                    {leaveStaff.leaves.map((l) => {
                      const startStr = new Date(l.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
                      const endStr = new Date(l.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
                      return (
                        <div
                          key={l.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 14px",
                            borderRadius: "8px",
                            backgroundColor: "rgba(15, 23, 42, 0.7)",
                            border: "1px solid rgba(245, 158, 11, 0.25)",
                          }}
                        >
                          <div>
                            <div style={{ color: "#f8fafc", fontSize: "13px", fontWeight: 700 }}>
                              {l.reason || "Scheduled Time Off"}
                            </div>
                            <div style={{ color: "#94a3b8", fontSize: "12px" }}>
                              {startStr} — {endStr}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteLeave(l.id)}
                            style={{
                              padding: "5px 10px",
                              borderRadius: "6px",
                              border: "1px solid rgba(225, 29, 72, 0.3)",
                              backgroundColor: "rgba(225, 29, 72, 0.1)",
                              color: "#fb7185",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Schedule New Time Off */}
              <form onSubmit={handleCreateLeave} style={{ padding: "16px", borderRadius: "10px", backgroundColor: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                <h4 style={{ fontSize: "14px", fontWeight: 800, color: "#38bdf8", margin: "0 0 12px" }}>
                  + Schedule New Time Off
                </h4>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                      Start Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={newLeaveStart}
                      onChange={(e) => setNewLeaveStart(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "#0f172a", color: "#fff", fontSize: "12.5px" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                      End Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={newLeaveEnd}
                      onChange={(e) => setNewLeaveEnd(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "#0f172a", color: "#fff", fontSize: "12.5px" }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                    Reason / Purpose
                  </label>
                  <input
                    type="text"
                    value={newLeaveReason}
                    onChange={(e) => setNewLeaveReason(e.target.value)}
                    placeholder="e.g. Annual Vacation, Medical Leave, Conference"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "#0f172a", color: "#fff", fontSize: "12.5px" }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="submit"
                    disabled={leaveSubmitting}
                    style={{
                      padding: "8px 18px",
                      borderRadius: "6px",
                      border: "none",
                      background: "linear-gradient(135deg, #0284c7, #2563eb)",
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: "13px",
                      cursor: leaveSubmitting ? "not-allowed" : "pointer",
                    }}
                  >
                    {leaveSubmitting ? "Scheduling…" : "Confirm Time Off"}
                  </button>
                </div>
              </form>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
}
