/* Hallmark · macrostructure: Multi-Location Enterprise Management · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 */
"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Building,
  MapPin,
  Clock,
  Globe,
  Check,
  Users,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  Calendar,
  Sparkles,
  ExternalLink,
  Search,
  X,
  ChevronRight,
  Info,
} from "../../../components/icons";
import { apiFetch } from "../../../lib/api-client";
import { PageHeader } from "../../../components/shell/app-shell";
import { GlassCard, GlassBadge } from "../../../components/glass-card";
import { useReferenceData } from "../../onboarding/_hooks/use-reference-data";
import { useRealtimeEvents } from "../../../lib/use-realtime-events";
import { ClockSpinner } from "../../../components/animated-svgs";
import { sanitizeErrorMessage, SanitizedError } from "../../../lib/error-utils";
import { SanitizedAlert } from "../../../components/sanitized-alert";
import { useAuth } from "../../../lib/auth-context";

interface AssignedStaff {
  staff: {
    id: string;
    displayName: string;
    title?: string | null;
    avatarUrl?: string | null;
    roleCode?: string;
    bookingVisible?: boolean;
  };
}

interface LocationHoliday {
  id: string;
  date: string;
  name: string;
  isClosed: boolean;
}

interface LocationItem {
  id: string;
  name: string;
  slug: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone: string;
  taxRatePct?: number | null;
  operatingHours?: any;
  instructions?: string | null;
  parkingAccess?: string | null;
  staffLocations?: AssignedStaff[];
  resources?: Array<{ id: string; name: string; type: string }>;
  locationHolidays?: LocationHoliday[];
  _count?: {
    staffLocations: number;
    resources: number;
    appointments: number;
  };
  createdAt?: string;
}

interface StaffMember {
  id: string;
  displayName: string;
  fullName?: string;
  title?: string | null;
  avatarUrl?: string | null;
  roleCode?: string;
  bookingVisible?: boolean;
}

interface OrganizationData {
  id: string;
  name: string;
  country: string;
  timezone: string;
  currency: string;
  slug: string;
}

interface DaySchedule {
  active: boolean;
  open: string;
  close: string;
}

type WeeklyHours = {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
};

const DEFAULT_HOURS: WeeklyHours = {
  monday: { active: true, open: "09:00", close: "18:00" },
  tuesday: { active: true, open: "09:00", close: "18:00" },
  wednesday: { active: true, open: "09:00", close: "18:00" },
  thursday: { active: true, open: "09:00", close: "18:00" },
  friday: { active: true, open: "09:00", close: "18:00" },
  saturday: { active: false, open: "10:00", close: "16:00" },
  sunday: { active: false, open: "10:00", close: "16:00" },
};

interface LocationFormData {
  name: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  timezone: string;
  taxRatePct: string;
  instructions: string;
  parkingAccess: string;
  operatingHours: WeeklyHours;
  staffIds: string[];
}

const INITIAL_FORM_STATE: LocationFormData = {
  name: "",
  slug: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
  phone: "",
  email: "",
  timezone: "UTC",
  taxRatePct: "0",
  instructions: "",
  parkingAccess: "",
  operatingHours: DEFAULT_HOURS,
  staffIds: [],
};

function formatCurrentLocalTime(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());
  } catch {
    return "";
  }
}

function getTodayOperatingStatus(rawHours: any, tz: string): { isOpen: boolean; text: string } {
  if (!rawHours || typeof rawHours !== "object") return { isOpen: false, text: "Hours unconfigured" };
  try {
    const dayKey = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "UTC",
      weekday: "long",
    }).format(new Date()).toLowerCase();

    const sched = rawHours[dayKey];
    if (!sched) return { isOpen: false, text: "Closed today" };

    if (Array.isArray(sched)) {
      if (sched.length === 0) return { isOpen: false, text: "Closed today" };
      const first = sched[0];
      if (first?.start && first?.end) return { isOpen: true, text: `Open today: ${first.start} – ${first.end}` };
      return { isOpen: false, text: "Closed today" };
    }

    if (typeof sched === "object" && sched !== null) {
      if (sched.active === false) return { isOpen: false, text: "Closed today" };
      const start = sched.open || sched.start || "09:00";
      const end = sched.close || sched.end || "18:00";
      return { isOpen: true, text: `Open today: ${start} – ${end}` };
    }

    return { isOpen: false, text: "Schedule active" };
  } catch {
    return { isOpen: false, text: "Schedule configured" };
  }
}

export default function LocationsPage() {
  const { timezones, countries } = useReferenceData();

  const { user } = useAuth();
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [org, setOrg] = useState<OrganizationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SanitizedError | null>(null);
  const [locationModalError, setLocationModalError] = useState<SanitizedError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showAllLocations, setShowAllLocations] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Create / Edit Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState<"general" | "hours" | "staff">("general");
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [formData, setFormData] = useState<LocationFormData>(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Holiday Closures Modal State
  const [holidayModalLoc, setHolidayModalLoc] = useState<LocationItem | null>(null);
  const [holidayForm, setHolidayForm] = useState({ date: "", name: "" });
  const [holidaySubmitting, setHolidaySubmitting] = useState(false);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const orgId = org?.id || user?.organizationId;
    try {
      const [locRes, orgRes, staffRes] = await Promise.all([
        apiFetch<LocationItem[]>("/locations", {}, orgId),
        apiFetch<OrganizationData>("/organization/current", {}, orgId),
        apiFetch<StaffMember[]>("/staff", {}, orgId),
      ]);

      if (locRes.success && Array.isArray(locRes.data)) {
        setLocations(locRes.data);
      } else {
        setError(sanitizeErrorMessage(locRes.error?.message, "Failed to load branch locations."));
      }

      if (orgRes.success && orgRes.data) {
        setOrg(orgRes.data);
      }

      if (staffRes.success && Array.isArray(staffRes.data)) {
        setStaffMembers(staffRes.data);
      }
    } catch (err: any) {
      setError(sanitizeErrorMessage(err.message, "Failed to connect to location services."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Live real-time SSE listener
  useRealtimeEvents(org?.id, {
    onEvent: (hint) => {
      if (
        hint.type.startsWith("location.") ||
        hint.type.startsWith("staff.") ||
        hint.type.startsWith("schedule.") ||
        hint.type.startsWith("appointment.")
      ) {
        fetchAllData();
      }
    },
  });

  const filteredLocations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return locations;
    return locations.filter(
      (loc) =>
        loc.name.toLowerCase().includes(q) ||
        (loc.city && loc.city.toLowerCase().includes(q)) ||
        (loc.address && loc.address.toLowerCase().includes(q)) ||
        (loc.slug && loc.slug.toLowerCase().includes(q))
    );
  }, [locations, searchQuery]);

  // Metrics
  const totalBranches = locations.length;
  const totalStaffAssigned = useMemo(() => {
    const uniqueStaff = new Set<string>();
    locations.forEach((loc) => {
      loc.staffLocations?.forEach((sl) => {
        if (sl.staff?.id) uniqueStaff.add(sl.staff.id);
      });
    });
    return uniqueStaff.size;
  }, [locations]);

  const totalAppointmentsHosted = useMemo(() => {
    return locations.reduce((sum, loc) => sum + (loc._count?.appointments || 0), 0);
  }, [locations]);

  const parseOperatingHoursFromDb = (rawHours: any): WeeklyHours => {
    const hours: WeeklyHours = JSON.parse(JSON.stringify(DEFAULT_HOURS));
    if (!rawHours || typeof rawHours !== "object") return hours;

    for (const [dayKey, intervals] of Object.entries(rawHours)) {
      const k = dayKey.toLowerCase() as keyof WeeklyHours;
      if (!hours[k]) continue;

      if (Array.isArray(intervals) && intervals.length > 0 && intervals[0]?.start && intervals[0]?.end) {
        hours[k] = { active: true, open: intervals[0].start, close: intervals[0].end };
      } else if (Array.isArray(intervals) && intervals.length === 0) {
        hours[k] = { active: false, open: "09:00", close: "18:00" };
      } else if (typeof intervals === "object" && intervals !== null) {
        const obj = intervals as any;
        hours[k] = {
          active: obj.active !== false,
          open: obj.open || obj.start || "09:00",
          close: obj.close || obj.end || "18:00",
        };
      }
    }
    return hours;
  };

  const openCreateModal = () => {
    setEditingLocationId(null);
    setFormData({
      ...INITIAL_FORM_STATE,
      country: org?.country || "US",
      timezone: org?.timezone || "UTC",
      staffIds: staffMembers.map((s) => s.id), // default assign all staff
    });
    setFormErrors({});
    setLocationModalError(null);
    setModalTab("general");
    setShowModal(true);
  };

  const openEditModal = (loc: LocationItem, tab: "general" | "hours" | "staff" = "general") => {
    setEditingLocationId(loc.id);
    const assignedStaffIds = loc.staffLocations?.map((sl) => sl.staff.id) || [];
    setFormData({
      name: loc.name,
      slug: loc.slug || "",
      address: loc.address || "",
      city: loc.city || "",
      state: loc.state || "",
      postalCode: loc.postalCode || "",
      country: loc.country || org?.country || "US",
      phone: loc.phone || "",
      email: loc.email || "",
      timezone: loc.timezone || org?.timezone || "UTC",
      taxRatePct: loc.taxRatePct !== null && loc.taxRatePct !== undefined ? String(loc.taxRatePct) : "0",
      instructions: loc.instructions || "",
      parkingAccess: loc.parkingAccess || "",
      operatingHours: parseOperatingHoursFromDb(loc.operatingHours),
      staffIds: assignedStaffIds,
    });
    setFormErrors({});
    setLocationModalError(null);
    setModalTab(tab);
    setShowModal(true);
  };

  const handleFormFieldChange = <K extends keyof LocationFormData>(field: K, value: LocationFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === "name" && !editingLocationId) {
      const baseSlug = String(value)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      
      let candidateSlug = baseSlug;
      let counter = 2;
      while (locations.some((l) => l.slug === candidateSlug)) {
        candidateSlug = `${baseSlug}-${counter}`;
        counter++;
      }
      setFormData((prev) => ({ ...prev, slug: candidateSlug }));
    }
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleDayHourChange = (
    day: keyof WeeklyHours,
    field: keyof DaySchedule,
    value: any
  ) => {
    setFormData((prev) => ({
      ...prev,
      operatingHours: {
        ...prev.operatingHours,
        [day]: {
          ...prev.operatingHours[day],
          [field]: value,
        },
      },
    }));
  };

  const toggleStaffAssignment = (staffId: string) => {
    setFormData((prev) => {
      const exists = prev.staffIds.includes(staffId);
      return {
        ...prev,
        staffIds: exists ? prev.staffIds.filter((id) => id !== staffId) : [...prev.staffIds, staffId],
      };
    });
  };

  const applyWeekdaySchedule = (open: string = "09:00", close: string = "18:00") => {
    setFormData((prev) => ({
      ...prev,
      operatingHours: {
        ...prev.operatingHours,
        monday: { active: true, open, close },
        tuesday: { active: true, open, close },
        wednesday: { active: true, open, close },
        thursday: { active: true, open, close },
        friday: { active: true, open, close },
      },
    }));
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = "Branch location name is required";
    if (!formData.timezone) errors.timezone = "Time zone is required";
    if (!formData.slug.trim()) errors.slug = "Branch URL slug is required";

    // Validate operating hours: error only if start and end are identical (0-duration shift)
    for (const [dayKey, schedule] of Object.entries(formData.operatingHours)) {
      if (schedule.active && schedule.open && schedule.close && schedule.open === schedule.close) {
        errors.hours = `Invalid hours on ${dayKey.toUpperCase()}: Opening and closing time cannot be identical.`;
        break;
      }
    }

    if (errors.name || errors.timezone || errors.slug) {
      setModalTab("general");
    } else if (errors.hours) {
      setModalTab("hours");
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    setLocationModalError(null);

    const transformedHours: Record<string, Array<{ start: string; end: string }>> = {};
    for (const [dayKey, dayVal] of Object.entries(formData.operatingHours)) {
      if (dayVal.active && dayVal.open && dayVal.close && dayVal.open !== dayVal.close) {
        transformedHours[dayKey.toLowerCase()] = [{ start: dayVal.open, end: dayVal.close }];
      } else {
        transformedHours[dayKey.toLowerCase()] = [];
      }
    }

    const payload = {
      name: formData.name.trim(),
      slug: formData.slug || formData.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      address: formData.address.trim() || undefined,
      city: formData.city.trim() || undefined,
      state: formData.state.trim() || undefined,
      postalCode: formData.postalCode.trim() || undefined,
      country: formData.country || org?.country || "US",
      phone: formData.phone.trim() || undefined,
      email: formData.email.trim() || undefined,
      timezone: formData.timezone,
      taxRatePct: parseFloat(formData.taxRatePct) || 0,
      operatingHours: transformedHours,
      instructions: formData.instructions.trim() || undefined,
      parkingAccess: formData.parkingAccess.trim() || undefined,
      staffIds: formData.staffIds,
    };

    try {
      const orgId = org?.id || user?.organizationId;
      const res = editingLocationId
        ? await apiFetch(`/locations/${editingLocationId}`, { method: "PUT", body: JSON.stringify(payload) }, orgId)
        : await apiFetch("/locations", { method: "POST", body: JSON.stringify(payload) }, orgId);

      if (res.success) {
        setShowModal(false);
        setSuccessMessage(editingLocationId ? "Branch location updated successfully." : "New branch location configured successfully.");
        setTimeout(() => setSuccessMessage(null), 4000);
        await fetchAllData();
      } else {
        setLocationModalError(sanitizeErrorMessage(res.error?.message, "Failed to save branch location."));
      }
    } catch (err: any) {
      setLocationModalError(sanitizeErrorMessage(err.message, "An unexpected error occurred."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (id: string, name: string) => {
    if (locations.length <= 1) {
      setError(
        sanitizeErrorMessage(
          "Organizations must maintain at least one active branch location to accept customer appointments. Create a replacement branch before archiving this one."
        )
      );
      return;
    }

    if (!confirm(`Are you sure you want to archive "${name}"? Customer bookings for this branch will be disabled.`)) return;

    try {
      const res = await apiFetch(`/locations/${id}`, { method: "DELETE" });
      if (res.success) {
        setSuccessMessage(`Branch "${name}" has been archived.`);
        setTimeout(() => setSuccessMessage(null), 3000);
        fetchAllData();
      } else {
        setError(sanitizeErrorMessage(res.error?.message, "Failed to archive location."));
      }
    } catch (err: any) {
      setError(sanitizeErrorMessage(err.message, "Failed to archive location."));
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayModalLoc || !holidayForm.date || !holidayForm.name.trim()) return;

    setHolidaySubmitting(true);
    try {
      const res = await apiFetch(`/locations/${holidayModalLoc.id}/holidays`, {
        method: "POST",
        body: JSON.stringify({
          date: holidayForm.date,
          name: holidayForm.name.trim(),
          isClosed: true,
        }),
      });

      if (res.success) {
        setHolidayForm({ date: "", name: "" });
        await fetchAllData();
        // Update current modal loc
        const updated = await apiFetch<LocationItem>(`/locations/${holidayModalLoc.id}`);
        if (updated.success && updated.data) {
          setHolidayModalLoc(updated.data);
        }
      } else {
        setError(sanitizeErrorMessage(res.error?.message, "Failed to add holiday closure."));
      }
    } catch (err: any) {
      setError(sanitizeErrorMessage(err.message, "Failed to add holiday closure."));
    } finally {
      setHolidaySubmitting(false);
    }
  };

  const handleDeleteHoliday = async (holidayId: string) => {
    if (!holidayModalLoc) return;
    try {
      const res = await apiFetch(`/locations/${holidayModalLoc.id}/holidays/${holidayId}`, {
        method: "DELETE",
      });

      if (res.success) {
        await fetchAllData();
        const updated = await apiFetch<LocationItem>(`/locations/${holidayModalLoc.id}`);
        if (updated.success && updated.data) {
          setHolidayModalLoc(updated.data);
        }
      } else {
        setError(sanitizeErrorMessage(res.error?.message, "Failed to remove holiday closure."));
      }
    } catch (err: any) {
      setError(sanitizeErrorMessage(err.message, "Failed to remove holiday closure."));
    }
  };

  const days: Array<{ key: keyof WeeklyHours; label: string }> = [
    { key: "monday", label: "Monday" },
    { key: "tuesday", label: "Tuesday" },
    { key: "wednesday", label: "Wednesday" },
    { key: "thursday", label: "Thursday" },
    { key: "friday", label: "Friday" },
    { key: "saturday", label: "Saturday" },
    { key: "sunday", label: "Sunday" },
  ];

  return (
    <div>
      <PageHeader
        title="Locations & Branches"
        description="Configure physical studios, day-by-day operating schedules, assigned specialists, timezone offsets, and customer arrival instructions."
        actions={
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
            <Plus size={16} /> Add Location
          </button>
        }
      />

      {/* Notifications */}
      {error && (
        <div style={{ marginBottom: "20px" }}>
          <SanitizedAlert error={error} onDismiss={() => setError(null)} />
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

      {/* Top Operational KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "18px 20px" }}>
          <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Active Branches
          </span>
          <strong style={{ fontSize: "28px", color: "#38bdf8", display: "block", marginTop: "4px", fontWeight: 900 }}>
            {totalBranches}
          </strong>
          <span style={{ fontSize: "12px", color: "#64748b" }}>Physical studios available</span>
        </GlassCard>

        <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "18px 20px" }}>
          <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Assigned Specialists
          </span>
          <strong style={{ fontSize: "28px", color: "#34d399", display: "block", marginTop: "4px", fontWeight: 900 }}>
            {totalStaffAssigned}
          </strong>
          <span style={{ fontSize: "12px", color: "#64748b" }}>Specialists across branches</span>
        </GlassCard>

        <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "18px 20px" }}>
          <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Total Appointments
          </span>
          <strong style={{ fontSize: "28px", color: "#818cf8", display: "block", marginTop: "4px", fontWeight: 900 }}>
            {totalAppointmentsHosted}
          </strong>
          <span style={{ fontSize: "12px", color: "#64748b" }}>Completed & upcoming visits</span>
        </GlassCard>

        <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "18px 20px" }}>
          <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Customer Sync Status
          </span>
          <strong style={{ fontSize: "16px", color: "#38bdf8", display: "block", marginTop: "8px", fontWeight: 800 }}>
            Live SSE Connected
          </strong>
          <span style={{ fontSize: "12px", color: "#34d399" }}>Instant customer sync</span>
        </GlassCard>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "14px",
          marginBottom: "24px",
          padding: "12px 16px",
          backgroundColor: "rgba(15, 23, 42, 0.6)",
          borderRadius: "12px",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
          <Search size={16} color="#94a3b8" style={{ position: "absolute", left: "12px" }} />
          <input
            type="text"
            placeholder="Search branches by name, city, address, or slug…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px 10px 38px",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              backgroundColor: "rgba(15, 23, 42, 0.8)",
              color: "#fff",
              fontSize: "13.5px",
              outline: "none",
            }}
          />
        </div>
        <span style={{ color: "#94a3b8", fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap" }}>
          {filteredLocations.length} branch{filteredLocations.length !== 1 ? "es" : ""}
        </span>
      </div>

      {/* Locations Cards */}
      {loading ? (
        <div style={{ color: "#94a3b8", padding: "48px 0", textAlign: "center" }}>
          <ClockSpinner size={32} />
          <p style={{ marginTop: "12px", fontSize: "14px" }}>Synchronizing branch locations from database…</p>
        </div>
      ) : filteredLocations.length === 0 ? (
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
            <Building size={32} />
          </div>
          <h3 style={{ color: "#f8fafc", fontSize: "19px", fontWeight: 800, marginBottom: "8px" }}>
            {searchQuery ? "No Matching Locations" : "No Location Branches Configured"}
          </h3>
          <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "460px", margin: "0 auto 24px" }}>
            {searchQuery
              ? "Try adjusting your search query to locate your branch."
              : "Set up physical branches and operating schedules to enable in-studio customer bookings."}
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
              <Plus size={16} /> Configure First Location
            </button>
          )}
        </GlassCard>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "20px" }}>
            {(showAllLocations ? filteredLocations : filteredLocations.slice(0, 6)).map((loc, index) => {
            const staffCount = loc._count?.staffLocations ?? (loc.staffLocations?.length || 0);
            const resourceCount = loc._count?.resources ?? (loc.resources?.length || 0);
            const apptCount = loc._count?.appointments ?? 0;
            const holidaysCount = loc.locationHolidays?.length || 0;
            const isPrimary = index === 0;
            const localTime = formatCurrentLocalTime(loc.timezone);
            const operatingStatus = getTodayOperatingStatus(loc.operatingHours, loc.timezone);
            const fullAddress = [loc.address, loc.city, loc.state, loc.postalCode, loc.country].filter(Boolean).join(", ");

            return (
              <GlassCard
                key={loc.id}
                variant="card"
                glow="subtle"
                depth3D
                style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "24px" }}
              >
                <div>
                  {/* Top Branch Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "12px",
                          backgroundColor: isPrimary ? "rgba(56, 189, 248, 0.18)" : "rgba(148, 163, 184, 0.12)",
                          border: isPrimary ? "1px solid rgba(56, 189, 248, 0.35)" : "1px solid rgba(148, 163, 184, 0.2)",
                          display: "grid",
                          placeItems: "center",
                          color: isPrimary ? "#38bdf8" : "#94a3b8",
                        }}
                      >
                        <Building size={22} />
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <strong style={{ color: "#f8fafc", fontSize: "17px" }}>{loc.name}</strong>
                          {isPrimary && (
                            <span
                              style={{
                                fontSize: "10.5px",
                                fontWeight: 800,
                                padding: "2px 7px",
                                borderRadius: "6px",
                                backgroundColor: "rgba(56, 189, 248, 0.15)",
                                border: "1px solid rgba(56, 189, 248, 0.3)",
                                color: "#38bdf8",
                              }}
                            >
                              PRIMARY HQ
                            </span>
                          )}
                        </div>
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>/{loc.slug}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <button
                        onClick={() => openEditModal(loc, "general")}
                        title="Edit Branch Location"
                        style={{
                          padding: "7px",
                          borderRadius: "7px",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          backgroundColor: "rgba(255, 255, 255, 0.05)",
                          color: "#cbd5e1",
                          cursor: "pointer",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleArchive(loc.id, loc.name)}
                        title="Archive Branch"
                        disabled={locations.length <= 1}
                        style={{
                          padding: "7px",
                          borderRadius: "7px",
                          border: locations.length <= 1 ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(225, 29, 72, 0.25)",
                          backgroundColor: locations.length <= 1 ? "rgba(255, 255, 255, 0.02)" : "rgba(225, 29, 72, 0.08)",
                          color: locations.length <= 1 ? "#64748b" : "#fb7185",
                          cursor: locations.length <= 1 ? "not-allowed" : "pointer",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Branch Details Grid */}
                  <div style={{ display: "grid", gap: "9px", marginBottom: "16px", fontSize: "13px", color: "#cbd5e1" }}>
                    {fullAddress && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                        <MapPin size={15} color="#38bdf8" style={{ marginTop: "2px", flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{fullAddress}</span>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            `${loc.name} ${fullAddress}`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Open in Google Maps"
                          style={{ color: "#38bdf8", display: "inline-flex", alignItems: "center" }}
                        >
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    )}

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Globe size={15} color="#94a3b8" />
                      <span>
                        Timezone: <strong>{loc.timezone}</strong> {localTime && <span style={{ color: "#94a3b8" }}>({localTime})</span>}
                      </span>
                    </div>

                    {(loc.phone || loc.email) && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", color: "#94a3b8", fontSize: "12.5px" }}>
                        {loc.phone && (
                          <a href={`tel:${loc.phone}`} style={{ display: "flex", alignItems: "center", gap: "5px", color: "#cbd5e1", textDecoration: "none" }}>
                            <Phone size={13} color="#38bdf8" />
                            <span>{loc.phone}</span>
                          </a>
                        )}
                        {loc.email && (
                          <a href={`mailto:${loc.email}`} style={{ display: "flex", alignItems: "center", gap: "5px", color: "#cbd5e1", textDecoration: "none" }}>
                            <Mail size={13} color="#38bdf8" />
                            <span>{loc.email}</span>
                          </a>
                        )}
                      </div>
                    )}

                    {/* Operating Status Pill */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
                      <Clock size={15} color={operatingStatus.isOpen ? "#34d399" : "#fb7185"} />
                      <span style={{ fontWeight: 600, color: operatingStatus.isOpen ? "#34d399" : "#94a3b8" }}>
                        {operatingStatus.text}
                      </span>
                      {loc.taxRatePct !== null && loc.taxRatePct !== undefined && Number(loc.taxRatePct) > 0 && (
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>· Tax: {loc.taxRatePct}%</span>
                      )}
                    </div>

                    {loc.instructions && (
                      <p style={{ color: "#94a3b8", fontSize: "12px", margin: "4px 0 0", lineHeight: 1.4 }}>
                        {loc.instructions}
                      </p>
                    )}

                    {loc.parkingAccess && (
                      <div style={{ fontSize: "12px", color: "#38bdf8", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>🚗 Parking: {loc.parkingAccess}</span>
                      </div>
                    )}
                  </div>

                  {/* Assigned Staff Preview */}
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(15, 23, 42, 0.5)",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      marginBottom: "16px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>
                        Assigned Specialists ({staffCount})
                      </span>
                      <button
                        onClick={() => openEditModal(loc, "staff")}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#38bdf8",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Manage Staff →
                      </button>
                    </div>

                    {loc.staffLocations && loc.staffLocations.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {loc.staffLocations.slice(0, 4).map((sl) => (
                          <span
                            key={sl.staff.id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              padding: "3px 8px",
                              borderRadius: "6px",
                              backgroundColor: "rgba(255, 255, 255, 0.05)",
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                              fontSize: "12px",
                              color: "#f8fafc",
                            }}
                          >
                            <Users size={12} color="#38bdf8" />
                            <span>{sl.staff.displayName}</span>
                          </span>
                        ))}
                        {loc.staffLocations.length > 4 && (
                          <span
                            style={{
                              fontSize: "11.5px",
                              color: "#94a3b8",
                              alignSelf: "center",
                              paddingLeft: "4px",
                            }}
                          >
                            +{loc.staffLocations.length - 4} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <p style={{ color: "#64748b", fontSize: "12px", margin: 0, fontStyle: "italic" }}>
                        No specialists assigned yet. Click Manage Staff to assign providers.
                      </p>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions & Stats */}
                <div
                  style={{
                    paddingTop: "14px",
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", color: "#94a3b8" }}>
                    <span>{apptCount} visits hosted</span>
                    <span>·</span>
                    <button
                      onClick={() => setHolidayModalLoc(loc)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: holidaysCount > 0 ? "#fbbf24" : "#94a3b8",
                        fontSize: "12px",
                        cursor: "pointer",
                        padding: 0,
                        textDecoration: "underline",
                      }}
                    >
                      {holidaysCount} closure{holidaysCount !== 1 ? "s" : ""}
                    </button>
                  </div>

                  <GlassBadge variant="success" size="sm">
                    Live Bookable Branch
                  </GlassBadge>
                </div>
              </GlassCard>
            );
          })}
        </div>

        {filteredLocations.length > 6 && (
          <div style={{ textAlign: "center", marginTop: "20px" }}>
            <button
              type="button"
              onClick={() => setShowAllLocations(!showAllLocations)}
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
              {showAllLocations
                ? "Show fewer locations"
                : `Showing 6 of ${filteredLocations.length} locations · See all`}
            </button>
          </div>
        )}
      </>
    )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div
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
        >
          <div style={{ width: "100%", maxWidth: "720px", margin: "auto" }}>
            <GlassCard variant="elevated" glow="primary" style={{ padding: "28px" }}>
              {/* Modal Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", paddingBottom: "14px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}>
                <div>
                  <h3 style={{ fontSize: "20px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                    {editingLocationId ? "Edit Branch Location" : "Configure New Branch Location"}
                  </h3>
                  <p style={{ color: "#94a3b8", fontSize: "13px", margin: "4px 0 0" }}>
                    Configure address, local timezone, weekly operating schedule, and assigned staff specialists.
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>

              {locationModalError && (
                <div style={{ marginBottom: "16px" }}>
                  <SanitizedAlert error={locationModalError} onDismiss={() => setLocationModalError(null)} />
                </div>
              )}

              {/* Modal Navigation Tabs */}
              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  marginBottom: "20px",
                  padding: "4px",
                  backgroundColor: "rgba(15, 23, 42, 0.8)",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setModalTab("general")}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: modalTab === "general" ? "rgba(56, 189, 248, 0.2)" : "transparent",
                    color: modalTab === "general" ? "#38bdf8" : "#94a3b8",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  1. Details & Address
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab("hours")}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: modalTab === "hours" ? "rgba(56, 189, 248, 0.2)" : "transparent",
                    color: modalTab === "hours" ? "#38bdf8" : "#94a3b8",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  2. Operating Schedule
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab("staff")}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: modalTab === "staff" ? "rgba(56, 189, 248, 0.2)" : "transparent",
                    color: modalTab === "staff" ? "#38bdf8" : "#94a3b8",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  3. Assigned Staff ({formData.staffIds.length})
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                {/* TAB 1: General Info & Address */}
                {modalTab === "general" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                        Location Name <span style={{ color: "#38bdf8" }}>*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => handleFormFieldChange("name", e.target.value)}
                        placeholder="e.g. Downtown Studio / Flagship Clinic"
                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: formErrors.name ? "1px solid #fb7185" : "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13.5px" }}
                      />
                      {formErrors.name && <p style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>{formErrors.name}</p>}
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                        Branch URL Slug <span style={{ color: "#38bdf8" }}>*</span>
                      </label>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ color: "#64748b", fontSize: "13px", fontFamily: "monospace" }}>/locations/</span>
                        <input
                          type="text"
                          required
                          value={formData.slug}
                          onChange={(e) => handleFormFieldChange("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                          placeholder="e.g. downtown-studio"
                          style={{ flex: 1, padding: "10px 14px", borderRadius: "8px", border: formErrors.slug ? "1px solid #fb7185" : "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13px" }}
                        />
                      </div>
                      {formErrors.slug && <p style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>{formErrors.slug}</p>}
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                        Time Zone <span style={{ color: "#38bdf8" }}>*</span>
                      </label>
                      <select
                        value={formData.timezone}
                        onChange={(e) => handleFormFieldChange("timezone", e.target.value)}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "#0f172a", color: "#fff", fontSize: "13px" }}
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
                        Local Sales Tax Rate (%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={formData.taxRatePct}
                        onChange={(e) => handleFormFieldChange("taxRatePct", e.target.value)}
                        placeholder="0.00"
                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13px" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                        Contact Phone
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => handleFormFieldChange("phone", e.target.value)}
                        placeholder="+1 (555) 123-4567"
                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13px" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                        Contact Email
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleFormFieldChange("email", e.target.value)}
                        placeholder="branch@yourcompany.com"
                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13px" }}
                      />
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                        Street Address
                      </label>
                      <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => handleFormFieldChange("address", e.target.value)}
                        placeholder="123 Market Street, Suite 400"
                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13px" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                        City
                      </label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => handleFormFieldChange("city", e.target.value)}
                        placeholder="San Francisco"
                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13px" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                        State / Region
                      </label>
                      <input
                        type="text"
                        value={formData.state}
                        onChange={(e) => handleFormFieldChange("state", e.target.value)}
                        placeholder="CA"
                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13px" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                        Postal Code / ZIP
                      </label>
                      <input
                        type="text"
                        value={formData.postalCode}
                        onChange={(e) => handleFormFieldChange("postalCode", e.target.value)}
                        placeholder="e.g. 94103"
                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13px" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                        Country
                      </label>
                      <select
                        value={formData.country}
                        onChange={(e) => handleFormFieldChange("country", e.target.value)}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "#0f172a", color: "#fff", fontSize: "13px" }}
                      >
                        {countries.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name} ({c.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                        Parking Access Information
                      </label>
                      <input
                        type="text"
                        value={formData.parkingAccess}
                        onChange={(e) => handleFormFieldChange("parkingAccess", e.target.value)}
                        placeholder="e.g. Free validated parking in rear garage level P2"
                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13px" }}
                      />
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                        Arrival & Entry Instructions
                      </label>
                      <textarea
                        rows={2}
                        value={formData.instructions}
                        onChange={(e) => handleFormFieldChange("instructions", e.target.value)}
                        placeholder="e.g. Buzz #400 at the glass entrance. Have a seat in reception."
                        style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.8)", color: "#fff", fontSize: "13px", resize: "vertical" }}
                      />
                    </div>
                  </div>
                )}

                {/* TAB 2: Operating Schedule */}
                {modalTab === "hours" && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <span style={{ fontSize: "13px", color: "#94a3b8" }}>
                        Set hours when customers can book appointments at this facility.
                      </span>
                      <button
                        type="button"
                        onClick={() => applyWeekdaySchedule("09:00", "18:00")}
                        style={{
                          background: "rgba(56, 189, 248, 0.15)",
                          border: "1px solid rgba(56, 189, 248, 0.3)",
                          color: "#38bdf8",
                          padding: "5px 10px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Set Mon–Fri Standard (9am–6pm)
                      </button>
                    </div>

                    {formErrors.hours && <p style={{ color: "#fb7185", fontSize: "12px", marginBottom: "8px" }}>{formErrors.hours}</p>}

                    <div style={{ display: "grid", gap: "8px", backgroundColor: "rgba(15, 23, 42, 0.6)", padding: "14px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                      {days.map(({ key, label }) => {
                        const daySchedule = formData.operatingHours[key];
                        return (
                          <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "120px" }}>
                              <input
                                type="checkbox"
                                id={`check-${key}`}
                                checked={daySchedule.active}
                                onChange={(e) => handleDayHourChange(key, "active", e.target.checked)}
                                style={{ width: "16px", height: "16px", cursor: "pointer" }}
                              />
                              <label htmlFor={`check-${key}`} style={{ fontSize: "13px", fontWeight: 600, color: daySchedule.active ? "#f8fafc" : "#64748b", cursor: "pointer" }}>
                                {label}
                              </label>
                            </div>

                            {daySchedule.active ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <input
                                  type="time"
                                  value={daySchedule.open}
                                  onChange={(e) => handleDayHourChange(key, "open", e.target.value)}
                                  style={{ padding: "6px 8px", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.9)", color: "#fff", fontSize: "12.5px" }}
                                />
                                <span style={{ color: "#94a3b8", fontSize: "12px" }}>to</span>
                                <input
                                  type="time"
                                  value={daySchedule.close}
                                  onChange={(e) => handleDayHourChange(key, "close", e.target.value)}
                                  style={{ padding: "6px 8px", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "rgba(15, 23, 42, 0.9)", color: "#fff", fontSize: "12.5px" }}
                                />
                              </div>
                            ) : (
                              <span style={{ fontSize: "12.5px", color: "#64748b", fontStyle: "italic" }}>Closed</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TAB 3: Staff Assignment */}
                {modalTab === "staff" && (
                  <div>
                    <div style={{ marginBottom: "14px" }}>
                      <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#f8fafc", margin: "0 0 4px" }}>
                        Assign Specialists to this Branch
                      </h4>
                      <p style={{ color: "#94a3b8", fontSize: "12.5px", margin: 0 }}>
                        Select the team members who work at this branch. Customers booking this studio will only be offered appointments with assigned specialists.
                      </p>
                    </div>

                    {staffMembers.length === 0 ? (
                      <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                        No staff profiles registered. Add staff members in the Staff tab first.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px", maxHeight: "320px", overflowY: "auto", paddingRight: "4px" }}>
                        {staffMembers.map((st) => {
                          const isAssigned = formData.staffIds.includes(st.id);
                          return (
                            <div
                              key={st.id}
                              onClick={() => toggleStaffAssignment(st.id)}
                              style={{
                                padding: "10px 12px",
                                borderRadius: "8px",
                                border: isAssigned ? "1px solid rgba(56, 189, 248, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)",
                                backgroundColor: isAssigned ? "rgba(56, 189, 248, 0.12)" : "rgba(15, 23, 42, 0.6)",
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isAssigned}
                                onChange={() => {}} // handled by parent div
                                style={{ cursor: "pointer" }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <strong style={{ display: "block", fontSize: "13px", color: isAssigned ? "#f8fafc" : "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {st.displayName}
                                </strong>
                                <span style={{ fontSize: "11.5px", color: "#94a3b8" }}>
                                  {st.title || st.roleCode || "Practitioner"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Modal Footer */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "20px", paddingTop: "14px", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                    {formData.staffIds.length} specialist{formData.staffIds.length !== 1 ? "s" : ""} selected
                  </span>

                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      style={{ padding: "10px 18px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.12)", backgroundColor: "transparent", color: "#94a3b8", fontSize: "13.5px", fontWeight: 600, cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      style={{ padding: "10px 22px", borderRadius: "8px", border: "none", background: "linear-gradient(135deg, #0284c7, #2563eb)", color: "#fff", fontWeight: 800, fontSize: "13.5px", cursor: submitting ? "not-allowed" : "pointer" }}
                    >
                      {submitting ? "Saving Branch…" : editingLocationId ? "Save Branch Changes" : "Create Branch Location"}
                    </button>
                  </div>
                </div>
              </form>
            </GlassCard>
          </div>
        </div>
      )}

      {/* Holiday Closures Modal */}
      {holidayModalLoc && (
        <div
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
        >
          <div style={{ width: "100%", maxWidth: "560px", margin: "auto" }}>
            <GlassCard variant="elevated" glow="primary" style={{ padding: "26px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}>
                <div>
                  <h3 style={{ fontSize: "19px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                    Holiday Closures: {holidayModalLoc.name}
                  </h3>
                  <p style={{ color: "#94a3b8", fontSize: "12.5px", margin: "3px 0 0" }}>
                    Scheduled dates when this branch is closed. Customer online booking will be blocked on these dates.
                  </p>
                </div>
                <button
                  onClick={() => setHolidayModalLoc(null)}
                  style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>

              {/* Add Holiday Form */}
              <form onSubmit={handleAddHoliday} style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
                <input
                  type="date"
                  required
                  value={holidayForm.date}
                  onChange={(e) => setHolidayForm((prev) => ({ ...prev, date: e.target.value }))}
                  style={{
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    backgroundColor: "rgba(15, 23, 42, 0.8)",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
                <input
                  type="text"
                  required
                  placeholder="Closure reason (e.g. Renovation, Holiday)"
                  value={holidayForm.name}
                  onChange={(e) => setHolidayForm((prev) => ({ ...prev, name: e.target.value }))}
                  style={{
                    flex: 1,
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    backgroundColor: "rgba(15, 23, 42, 0.8)",
                    color: "#fff",
                    fontSize: "13px",
                  }}
                />
                <button
                  type="submit"
                  disabled={holidaySubmitting}
                  style={{
                    padding: "9px 16px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#0284c7",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: holidaySubmitting ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {holidaySubmitting ? "Adding…" : "Add Closure"}
                </button>
              </form>

              {/* Scheduled Closures List */}
              <div style={{ maxHeight: "240px", overflowY: "auto", display: "grid", gap: "8px" }}>
                {holidayModalLoc.locationHolidays && holidayModalLoc.locationHolidays.length > 0 ? (
                  holidayModalLoc.locationHolidays.map((h) => (
                    <div
                      key={h.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        backgroundColor: "rgba(15, 23, 42, 0.6)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Calendar size={15} color="#fbbf24" />
                        <div>
                          <strong style={{ color: "#f8fafc", fontSize: "13px", display: "block" }}>{h.name}</strong>
                          <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                            {new Date(h.date).toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteHoliday(h.id)}
                        title="Delete Closure"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#fb7185",
                          cursor: "pointer",
                          padding: "6px",
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                    No upcoming holiday closures scheduled for this branch.
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
                <button
                  type="button"
                  onClick={() => setHolidayModalLoc(null)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    backgroundColor: "transparent",
                    color: "#f8fafc",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Done
                </button>
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
}
