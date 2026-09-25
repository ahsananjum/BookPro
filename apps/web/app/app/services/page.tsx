/* Hallmark · macrostructure: Service Catalog & Pricing · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 */
"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Plus,
  Scissors,
  Trash2,
  Edit2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Users,
  Check,
  Sparkles,
  ExternalLink,
  Copy,
  Layers,
  FileText,
  DollarSign,
  Tag,
  Search,
  Filter,
  RefreshCw,
  Info,
} from "../../../components/icons";
import { apiFetch } from "../../../lib/api-client";
import { PageHeader } from "../../../components/shell/app-shell";
import { GlassCard, GlassBadge } from "../../../components/glass-card";
import { formatCurrency, getCurrencySymbol } from "../../../lib/currency-utils";
import { sanitizeErrorMessage, SanitizedError } from "../../../lib/error-utils";
import { SanitizedAlert } from "../../../components/sanitized-alert";
import { motion, AnimatePresence } from "framer-motion";
import {
  SpotlightCard,
  AnimatedGroup,
  MotionAlert,
  CollapsibleDisclosure,
} from "../../../components/motion-primitives";

interface StaffItem {
  id: string;
  displayName: string;
  title?: string;
  email?: string;
}

interface ResourcePool {
  id: string;
  name: string;
  category?: string;
}

interface IntakeFormItem {
  id: string;
  name: string;
  description?: string;
  isGlobal?: boolean;
}

interface ServiceItem {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  durationMin: number;
  preBufferMin?: number;
  postBufferMin?: number;
  priceCents: number;
  currency: string;
  depositType?: "NONE" | "PERCENTAGE" | "FIXED";
  depositValue?: number;
  taxBehavior?: "EXCLUSIVE" | "INCLUSIVE" | "NONE";
  capacity?: number;
  minParticipants?: number;
  maxParticipants?: number;
  preparationInstructions?: string | null;
  isActive: boolean;
  _count?: {
    appointments?: number;
  };
  staffServices?: Array<{
    staffId: string;
    customPriceCents?: number | null;
    customDurationMin?: number | null;
    staff?: StaffItem;
  }>;
  serviceResources?: Array<{
    resourcePoolId: string;
    quantityRequired: number;
    resourcePool?: ResourcePool;
  }>;
  serviceIntakeForms?: Array<{
    intakeFormId: string;
    sortOrder: number;
    isRequired: boolean;
    intakeForm?: IntakeFormItem;
  }>;
}

interface OrganizationData {
  id: string;
  name: string;
  slug: string;
  currency?: string;
}

interface ServiceFormData {
  name: string;
  category: string;
  description: string;
  imageUrl: string;
  durationMin: number;
  preBufferMin: number;
  postBufferMin: number;
  price: string;
  depositType: "NONE" | "PERCENTAGE" | "FIXED";
  depositValue: string;
  taxBehavior: "EXCLUSIVE" | "INCLUSIVE" | "NONE";
  capacity: number;
  minParticipants: number;
  maxParticipants: number;
  preparationInstructions: string;
  isActive: boolean;
  selectedStaffIds: string[];
  selectedIntakeFormIds: string[];
  requiredResourcePools: Array<{ poolId: string; quantity: number }>;
}

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];
const BUFFER_PRESETS = [0, 5, 10, 15, 30];

const INITIAL_FORM_STATE: ServiceFormData = {
  name: "",
  category: "",
  description: "",
  imageUrl: "",
  durationMin: 45,
  preBufferMin: 0,
  postBufferMin: 0,
  price: "45.00",
  depositType: "NONE",
  depositValue: "0",
  taxBehavior: "EXCLUSIVE",
  capacity: 1,
  minParticipants: 1,
  maxParticipants: 1,
  preparationInstructions: "",
  isActive: true,
  selectedStaffIds: [],
  selectedIntakeFormIds: [],
  requiredResourcePools: [],
};

type ModalTab = "general" | "timing" | "pricing" | "dependencies" | "instructions";

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [staffList, setStaffList] = useState<StaffItem[]>([]);
  const [resourcePools, setResourcePools] = useState<ResourcePool[]>([]);
  const [intakeForms, setIntakeForms] = useState<IntakeFormItem[]>([]);
  const [org, setOrg] = useState<OrganizationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SanitizedError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showAllServices, setShowAllServices] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [sortBy, setSortBy] = useState<"name" | "price_asc" | "price_desc" | "duration" | "popular">("popular");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState<ModalTab>("general");
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ServiceFormData>(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const orgCurrency = org?.currency || "USD";
  const orgSlug = org?.slug || "";

  // Load Authoritative Database Information
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    const [servicesRes, orgRes, staffRes, poolsRes, formsRes] = await Promise.all([
      apiFetch<ServiceItem[]>("/services"),
      apiFetch<OrganizationData>("/organization/current"),
      apiFetch<StaffItem[]>("/staff"),
      apiFetch<ResourcePool[]>("/resources/pools"),
      apiFetch<IntakeFormItem[]>("/intake-forms"),
    ]);

    if (servicesRes.success && Array.isArray(servicesRes.data)) {
      setServices(servicesRes.data);
    } else {
      setError(sanitizeErrorMessage(servicesRes.error?.message, "Failed to load service catalog."));
    }

    if (orgRes.success && orgRes.data) {
      setOrg(orgRes.data);
    }

    if (staffRes.success && Array.isArray(staffRes.data)) {
      setStaffList(staffRes.data);
    }

    if (poolsRes.success && Array.isArray(poolsRes.data)) {
      setResourcePools(poolsRes.data);
    }

    if (formsRes.success && Array.isArray(formsRes.data)) {
      setIntakeForms(formsRes.data);
    }

    if (!silent) setLoading(false);
  };

  useEffect(() => {
    loadData();

    // Auto-revalidate when window regains focus to keep synced with customer actions
    const handleFocus = () => loadData(true);
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  // Distinct Dynamic Categories for Filter Pills
  const availableCategories = useMemo(() => {
    const map = new Map<string, number>();
    services.forEach((s) => {
      const cat = (s.category && s.category.trim()) || "Unassigned";
      map.set(cat, (map.get(cat) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [services]);

  // Filtered & Sorted Services
  const filteredServices = useMemo(() => {
    return services
      .filter((s) => {
        const matchesSearch =
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (s.category && s.category.toLowerCase().includes(searchQuery.toLowerCase()));

        const sCat = s.category && s.category.trim() ? s.category.trim() : "Unassigned";
        const matchesCategory =
          selectedCategoryFilter === "ALL" || sCat === selectedCategoryFilter;

        const matchesStatus =
          statusFilter === "ALL" ||
          (statusFilter === "ACTIVE" && s.isActive) ||
          (statusFilter === "INACTIVE" && !s.isActive);

        return matchesSearch && matchesCategory && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "price_asc") return a.priceCents - b.priceCents;
        if (sortBy === "price_desc") return b.priceCents - a.priceCents;
        if (sortBy === "duration") return a.durationMin - b.durationMin;
        if (sortBy === "popular") return (b._count?.appointments || 0) - (a._count?.appointments || 0);
        return 0;
      });
  }, [services, searchQuery, selectedCategoryFilter, statusFilter, sortBy]);

  // Summary Metrics from Authoritative Database Records
  const stats = useMemo(() => {
    const total = services.length;
    const active = services.filter((s) => s.isActive).length;
    const totalAppointments = services.reduce((acc, s) => acc + (s._count?.appointments || 0), 0);
    const avgDuration =
      total > 0 ? Math.round(services.reduce((acc, s) => acc + s.durationMin, 0) / total) : 0;
    const avgPriceCents =
      total > 0 ? Math.round(services.reduce((acc, s) => acc + s.priceCents, 0) / total) : 0;

    return { total, active, totalAppointments, avgDuration, avgPriceCents };
  }, [services]);

  const openCreateModal = () => {
    setEditingServiceId(null);
    setModalTab("general");
    setFormData({
      ...INITIAL_FORM_STATE,
      selectedStaffIds: staffList.map((st) => st.id),
      selectedIntakeFormIds: [],
      requiredResourcePools: [],
    });
    setFormErrors({});
    setShowModal(true);
  };

  const openEditModal = (service: ServiceItem) => {
    setEditingServiceId(service.id);
    setModalTab("general");
    const assignedStaff = (service.staffServices || []).map((ss) => ss.staffId);
    const assignedForms = (service.serviceIntakeForms || []).map((sf) => sf.intakeFormId);
    const assignedPools = (service.serviceResources || []).map((sr) => ({
      poolId: sr.resourcePoolId,
      quantity: sr.quantityRequired || 1,
    }));

    // Authoritative Deposit value formatting:
    // If FIXED, depositValue is in cents in the DB; format to major currency units (e.g. 1500 cents -> "15.00")
    // If PERCENTAGE, depositValue is 1-100; format as string (e.g. "25")
    let depValStr = "0";
    if (service.depositType === "FIXED" && service.depositValue) {
      depValStr = (service.depositValue / 100).toFixed(2);
    } else if (service.depositType === "PERCENTAGE" && service.depositValue) {
      depValStr = String(service.depositValue);
    }

    setFormData({
      name: service.name,
      category: service.category || "",
      description: service.description || "",
      imageUrl: service.imageUrl || "",
      durationMin: service.durationMin || 45,
      preBufferMin: service.preBufferMin || 0,
      postBufferMin: service.postBufferMin || 0,
      price: (service.priceCents / 100).toFixed(2),
      depositType: service.depositType || "NONE",
      depositValue: depValStr,
      taxBehavior: service.taxBehavior || "EXCLUSIVE",
      capacity: service.capacity || 1,
      minParticipants: service.minParticipants || 1,
      maxParticipants: service.maxParticipants || 1,
      preparationInstructions: service.preparationInstructions || "",
      isActive: service.isActive !== false,
      selectedStaffIds: assignedStaff,
      selectedIntakeFormIds: assignedForms,
      requiredResourcePools: assignedPools,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const handleDuplicate = (service: ServiceItem) => {
    setEditingServiceId(null);
    setModalTab("general");
    const assignedStaff = (service.staffServices || []).map((ss) => ss.staffId);
    const assignedForms = (service.serviceIntakeForms || []).map((sf) => sf.intakeFormId);
    const assignedPools = (service.serviceResources || []).map((sr) => ({
      poolId: sr.resourcePoolId,
      quantity: sr.quantityRequired || 1,
    }));

    let depValStr = "0";
    if (service.depositType === "FIXED" && service.depositValue) {
      depValStr = (service.depositValue / 100).toFixed(2);
    } else if (service.depositType === "PERCENTAGE" && service.depositValue) {
      depValStr = String(service.depositValue);
    }

    setFormData({
      name: `${service.name} (Copy)`,
      category: service.category || "",
      description: service.description || "",
      imageUrl: service.imageUrl || "",
      durationMin: service.durationMin || 45,
      preBufferMin: service.preBufferMin || 0,
      postBufferMin: service.postBufferMin || 0,
      price: (service.priceCents / 100).toFixed(2),
      depositType: service.depositType || "NONE",
      depositValue: depValStr,
      taxBehavior: service.taxBehavior || "EXCLUSIVE",
      capacity: service.capacity || 1,
      minParticipants: service.minParticipants || 1,
      maxParticipants: service.maxParticipants || 1,
      preparationInstructions: service.preparationInstructions || "",
      isActive: true,
      selectedStaffIds: assignedStaff,
      selectedIntakeFormIds: assignedForms,
      requiredResourcePools: assignedPools,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const handleFormFieldChange = <K extends keyof ServiceFormData>(field: K, value: ServiceFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const toggleStaffSelection = (staffId: string) => {
    setFormData((prev) => {
      const exists = prev.selectedStaffIds.includes(staffId);
      const next = exists
        ? prev.selectedStaffIds.filter((id) => id !== staffId)
        : [...prev.selectedStaffIds, staffId];
      return { ...prev, selectedStaffIds: next };
    });
  };

  const toggleIntakeFormSelection = (formId: string) => {
    setFormData((prev) => {
      const exists = prev.selectedIntakeFormIds.includes(formId);
      const next = exists
        ? prev.selectedIntakeFormIds.filter((id) => id !== formId)
        : [...prev.selectedIntakeFormIds, formId];
      return { ...prev, selectedIntakeFormIds: next };
    });
  };

  const handlePoolRequirementChange = (poolId: string, quantity: number) => {
    setFormData((prev) => {
      if (quantity <= 0) {
        return {
          ...prev,
          requiredResourcePools: prev.requiredResourcePools.filter((p) => p.poolId !== poolId),
        };
      }
      const existing = prev.requiredResourcePools.find((p) => p.poolId === poolId);
      if (existing) {
        return {
          ...prev,
          requiredResourcePools: prev.requiredResourcePools.map((p) =>
            p.poolId === poolId ? { ...p, quantity } : p
          ),
        };
      }
      return {
        ...prev,
        requiredResourcePools: [...prev.requiredResourcePools, { poolId, quantity }],
      };
    });
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Service title is required";
    }

    if (!formData.durationMin || formData.durationMin < 1) {
      errors.durationMin = "Duration must be at least 1 minute";
    }

    const priceNum = parseFloat(formData.price);
    if (isNaN(priceNum) || priceNum < 0) {
      errors.price = "Enter a valid non-negative price";
    }

    if (formData.depositType !== "NONE") {
      const depNum = parseFloat(formData.depositValue);
      if (isNaN(depNum) || depNum <= 0) {
        errors.depositValue = "Enter a valid deposit amount";
      } else if (formData.depositType === "PERCENTAGE" && depNum > 100) {
        errors.depositValue = "Deposit percentage cannot exceed 100%";
      }
    }

    if (formData.capacity < 1) {
      errors.capacity = "Capacity must be at least 1";
    }

    if (formData.minParticipants > formData.maxParticipants) {
      errors.minParticipants = "Min participants cannot exceed max participants";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    setError(null);

    const priceCents = Math.round((parseFloat(formData.price) || 0) * 100);

    // Deposit Conversion:
    // If FIXED: input is in major currency units (e.g. 15.00); multiply by 100 to store in cents (1500)
    // If PERCENTAGE: input is integer percentage (e.g. 25); save as number
    let depositValue = 0;
    if (formData.depositType === "FIXED") {
      depositValue = Math.round((parseFloat(formData.depositValue) || 0) * 100);
    } else if (formData.depositType === "PERCENTAGE") {
      depositValue = Math.round(parseFloat(formData.depositValue) || 0);
    }

    const payload: any = {
      name: formData.name.trim(),
      category: formData.category.trim() || undefined,
      description: formData.description.trim() || undefined,
      imageUrl: formData.imageUrl.trim() || undefined,
      durationMin: Number(formData.durationMin),
      preBufferMin: Number(formData.preBufferMin) || 0,
      postBufferMin: Number(formData.postBufferMin) || 0,
      priceCents,
      currency: orgCurrency,
      depositType: formData.depositType,
      depositValue,
      taxBehavior: formData.taxBehavior,
      capacity: Number(formData.capacity) || 1,
      minParticipants: Number(formData.minParticipants) || 1,
      maxParticipants: Number(formData.maxParticipants) || 1,
      preparationInstructions: formData.preparationInstructions.trim() || undefined,
      eligibleStaffIds: formData.selectedStaffIds.length > 0 ? formData.selectedStaffIds : undefined,
      intakeFormIds: formData.selectedIntakeFormIds.length > 0 ? formData.selectedIntakeFormIds : undefined,
      requiredResourcePools: formData.requiredResourcePools.length > 0 ? formData.requiredResourcePools : undefined,
      isActive: formData.isActive,
    };

    try {
      const res = editingServiceId
        ? await apiFetch<any>(`/services/${editingServiceId}`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiFetch<any>("/services", { method: "POST", body: JSON.stringify(payload) });

      if (res.success) {
        setShowModal(false);
        setSuccessMessage(editingServiceId ? "Service updated successfully." : "New service created successfully.");
        setTimeout(() => setSuccessMessage(null), 4000);
        await loadData();
      } else {
        setError(sanitizeErrorMessage(res.error?.message, "Failed to save service. Please review the inputs."));
      }
    } catch (err: any) {
      setError(sanitizeErrorMessage(err.message, "An unexpected network error occurred."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (service: ServiceItem) => {
    const newStatus = !service.isActive;
    const res = await apiFetch(`/services/${service.id}`, {
      method: "PUT",
      body: JSON.stringify({ isActive: newStatus }),
    });

    if (res.success) {
      setServices((prev) =>
        prev.map((s) => (s.id === service.id ? { ...s, isActive: newStatus } : s))
      );
      setSuccessMessage(`"${service.name}" is now ${newStatus ? "active in catalog" : "inactive (draft)"}.`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } else {
      setError(sanitizeErrorMessage(res.error?.message, "Failed to update service status."));
    }
  };

  const handleArchive = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to archive "${name}"? This service will immediately be removed from customer booking availability.`)) {
      return;
    }
    const res = await apiFetch(`/services/${id}`, { method: "DELETE" });
    if (res.success) {
      setSuccessMessage(`Service "${name}" archived.`);
      setTimeout(() => setSuccessMessage(null), 3000);
      loadData();
    } else {
      setError(sanitizeErrorMessage(res.error?.message, "Failed to archive service."));
    }
  };

  return (
    <div>
      <PageHeader
        title="Services & Pricing Catalog"
        description="Authoritative service offerings, duration buffers, tax treatments, deposit policies, and specialist assignments directly synced with the customer booking portal."
        actions={
          <button
            id="btn-add-service"
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
              transition: "transform 0.15s ease",
            }}
          >
            <Plus size={16} /> Add Service
          </button>
        }
      />

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

      {/* Summary KPI Cards with Spotlight Sheen */}
      <AnimatedGroup
        className="services-kpi-grid"
        stagger={0.06}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <SpotlightCard spotlightColor="rgba(56, 189, 248, 0.14)" style={{ padding: "18px 20px" }}>
          <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700, textTransform: "uppercase" }}>
            Total Services
          </span>
          <div style={{ fontSize: "24px", fontWeight: 850, color: "#f8fafc", marginTop: "4px" }}>
            {stats.total}
          </div>
        </SpotlightCard>

        <SpotlightCard spotlightColor="rgba(52, 211, 153, 0.14)" style={{ padding: "18px 20px" }}>
          <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700, textTransform: "uppercase" }}>
            Active in Catalog
          </span>
          <div style={{ fontSize: "24px", fontWeight: 850, color: "#34d399", marginTop: "4px" }}>
            {stats.active}
          </div>
        </SpotlightCard>

        <SpotlightCard spotlightColor="rgba(168, 85, 247, 0.14)" style={{ padding: "18px 20px" }}>
          <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700, textTransform: "uppercase" }}>
            Lifetime Bookings
          </span>
          <div style={{ fontSize: "24px", fontWeight: 850, color: "#c084fc", marginTop: "4px" }}>
            {stats.totalAppointments} <span style={{ fontSize: "13px", color: "#94a3b8" }}>booked</span>
          </div>
        </SpotlightCard>

        <SpotlightCard spotlightColor="rgba(56, 189, 248, 0.14)" style={{ padding: "18px 20px" }}>
          <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700, textTransform: "uppercase" }}>
            Average Duration
          </span>
          <div style={{ fontSize: "24px", fontWeight: 850, color: "#38bdf8", marginTop: "4px" }}>
            {stats.avgDuration} <span style={{ fontSize: "13px", color: "#94a3b8" }}>mins</span>
          </div>
        </SpotlightCard>

        <SpotlightCard spotlightColor="rgba(251, 191, 36, 0.14)" style={{ padding: "18px 20px" }}>
          <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700, textTransform: "uppercase" }}>
            Average Price ({orgCurrency})
          </span>
          <div style={{ fontSize: "24px", fontWeight: 850, color: "#f8fafc", marginTop: "4px" }}>
            {formatCurrency(stats.avgPriceCents, orgCurrency)}
          </div>
        </SpotlightCard>
      </AnimatedGroup>

      {/* Dynamic Category Filter Pills */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          marginBottom: "16px",
          alignItems: "center",
        }}
      >
        <button
          onClick={() => setSelectedCategoryFilter("ALL")}
          style={{
            padding: "6px 14px",
            borderRadius: "20px",
            border: selectedCategoryFilter === "ALL" ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.1)",
            backgroundColor: selectedCategoryFilter === "ALL" ? "rgba(2, 132, 199, 0.25)" : "rgba(15, 23, 42, 0.6)",
            color: selectedCategoryFilter === "ALL" ? "#38bdf8" : "#94a3b8",
            fontWeight: 700,
            fontSize: "12.5px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span>All Services</span>
          <span style={{ fontSize: "11px", opacity: 0.8 }}>({services.length})</span>
        </button>

        {availableCategories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => setSelectedCategoryFilter(cat.name)}
            style={{
              padding: "6px 14px",
              borderRadius: "20px",
              border: selectedCategoryFilter === cat.name ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.1)",
              backgroundColor: selectedCategoryFilter === cat.name ? "rgba(2, 132, 199, 0.25)" : "rgba(15, 23, 42, 0.6)",
              color: selectedCategoryFilter === cat.name ? "#38bdf8" : "#94a3b8",
              fontWeight: 700,
              fontSize: "12.5px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>{cat.name}</span>
            <span style={{ fontSize: "11px", opacity: 0.8 }}>({cat.count})</span>
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "14px",
          marginBottom: "24px",
          padding: "12px 16px",
          backgroundColor: "rgba(15, 23, 42, 0.6)",
          borderRadius: "12px",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div style={{ position: "relative", minWidth: "260px", flex: "1 1 280px" }}>
          <input
            type="text"
            placeholder="Search services by title, category, description…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              backgroundColor: "rgba(15, 23, 42, 0.8)",
              color: "#fff",
              fontSize: "13.5px",
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
          {/* Status Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                color: "#cbd5e1",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active in Catalog</option>
              <option value="INACTIVE">Inactive (Drafts)</option>
            </select>
          </div>

          {/* Sort By */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                color: "#cbd5e1",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              <option value="popular">Most Bookings</option>
              <option value="name">Name (A-Z)</option>
              <option value="price_asc">Price (Low to High)</option>
              <option value="price_desc">Price (High to Low)</option>
              <option value="duration">Duration</option>
            </select>
          </div>

          <button
            onClick={() => loadData()}
            title="Refresh Catalog Data"
            style={{
              padding: "8px",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              backgroundColor: "rgba(15, 23, 42, 0.8)",
              color: "#94a3b8",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Catalog Grid */}
      {loading ? (
        <div style={{ color: "#94a3b8", padding: "48px 0", textAlign: "center" }}>
          Loading authoritative service catalog from database…
        </div>
      ) : filteredServices.length === 0 ? (
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
            <Scissors size={32} />
          </div>
          <h3 style={{ color: "#f8fafc", fontSize: "19px", fontWeight: 800, marginBottom: "8px" }}>
            {searchQuery || selectedCategoryFilter !== "ALL" || statusFilter !== "ALL"
              ? "No Matching Services Found"
              : "No Services Configured"}
          </h3>
          <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "480px", margin: "0 auto 24px", lineHeight: 1.5 }}>
            {searchQuery || selectedCategoryFilter !== "ALL" || statusFilter !== "ALL"
              ? "Try adjusting your search query, status, or category filter to inspect other catalog items."
              : "Define appointments, treatments, or sessions with authoritative durations, setup/clean-up buffers, pricing, and deposit rules."}
          </p>
          {!searchQuery && selectedCategoryFilter === "ALL" && statusFilter === "ALL" && (
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
              <Plus size={16} /> Create First Service
            </button>
          )}
        </GlassCard>
      ) : (
        <>
          <AnimatedGroup
            className="services-catalog-grid"
            stagger={0.04}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
              gap: "20px",
            }}
          >
          {(showAllServices ? filteredServices : filteredServices.slice(0, 9)).map((service) => {
            const assignedStaffCount = service.staffServices?.length || 0;
            const intakeFormsCount = service.serviceIntakeForms?.length || 0;
            const resourcePoolsCount = service.serviceResources?.length || 0;
            const appointmentsCount = service._count?.appointments || 0;

            // Deposit Display
            let depositLabel = "No Deposit (Pay in Person)";
            let depositSub = "";
            if (service.depositType === "PERCENTAGE" && service.depositValue) {
              const depCents = Math.round((service.priceCents * service.depositValue) / 100);
              depositLabel = `${service.depositValue}% Deposit Required`;
              depositSub = `${formatCurrency(depCents, service.currency || orgCurrency)} upfront`;
            } else if (service.depositType === "FIXED" && service.depositValue) {
              depositLabel = `${formatCurrency(service.depositValue, service.currency || orgCurrency)} Deposit Required`;
              const remaining = Math.max(0, service.priceCents - service.depositValue);
              depositSub = `${formatCurrency(remaining, service.currency || orgCurrency)} balance at studio`;
            }

            return (
              <GlassCard
                key={service.id}
                variant="card"
                glow="subtle"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  padding: "24px",
                  position: "relative",
                  transition: "border-color 0.2s ease, transform 0.15s ease",
                  opacity: service.isActive ? 1 : 0.8,
                }}
              >
                <div>
                  {/* Top Bar with Icon/Image, Title, and Action Buttons */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "16px",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      {service.imageUrl ? (
                        <img
                          src={service.imageUrl}
                          alt={service.name}
                          style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "12px",
                            objectFit: "cover",
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "12px",
                            backgroundColor: service.isActive
                              ? "rgba(16, 185, 129, 0.15)"
                              : "rgba(148, 163, 184, 0.1)",
                            border: service.isActive
                              ? "1px solid rgba(52, 211, 153, 0.3)"
                              : "1px solid rgba(148, 163, 184, 0.2)",
                            display: "grid",
                            placeItems: "center",
                            color: service.isActive ? "#34d399" : "#94a3b8",
                          }}
                        >
                          <Scissors size={20} />
                        </div>
                      )}
                      <div>
                        <strong style={{ color: "#f8fafc", fontSize: "16.5px", display: "block", lineHeight: 1.3 }}>
                          {service.name}
                        </strong>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px" }}>
                          <span style={{ color: "#38bdf8", fontSize: "12px", fontWeight: 700 }}>
                            {service.category || "General"}
                          </span>
                          {service.capacity && service.capacity > 1 ? (
                            <span style={{ color: "#a855f7", fontSize: "11px", fontWeight: 600 }}>
                              • Group (Up to {service.capacity})
                            </span>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 500 }}>
                              • 1-on-1 Session
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Icon Group */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {/* Preview in Customer Portal Link */}
                      {orgSlug && (
                        <a
                          href={`/${orgSlug}/book?serviceId=${service.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Preview in Customer Booking Portal"
                          style={{
                            padding: "7px",
                            borderRadius: "7px",
                            border: "1px solid rgba(56, 189, 248, 0.3)",
                            backgroundColor: "rgba(56, 189, 248, 0.08)",
                            color: "#38bdf8",
                            display: "grid",
                            placeItems: "center",
                            textDecoration: "none",
                          }}
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}

                      {/* Duplicate Service */}
                      <button
                        onClick={() => handleDuplicate(service)}
                        title="Duplicate Service"
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
                        <Copy size={14} />
                      </button>

                      {/* Edit Service */}
                      <button
                        onClick={() => openEditModal(service)}
                        title="Edit Service"
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

                      {/* Archive Service */}
                      <button
                        onClick={() => handleArchive(service.id, service.name)}
                        title="Archive Service"
                        style={{
                          padding: "7px",
                          borderRadius: "7px",
                          border: "1px solid rgba(225, 29, 72, 0.25)",
                          backgroundColor: "rgba(225, 29, 72, 0.08)",
                          color: "#fb7185",
                          cursor: "pointer",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Core Metrics & Policy Badges */}
                  <div style={{ display: "grid", gap: "10px", marginBottom: "18px" }}>
                    {/* Duration & Buffer Gaps */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#cbd5e1", fontSize: "13px" }}>
                      <Clock size={15} color="#38bdf8" />
                      <span>
                        Duration: <strong>{service.durationMin} mins</strong>
                        {service.preBufferMin ? (
                          <span style={{ color: "#eab308", marginLeft: "6px" }}>
                            (+{service.preBufferMin}m prep)
                          </span>
                        ) : null}
                        {service.postBufferMin ? (
                          <span style={{ color: "#38bdf8", marginLeft: "6px" }}>
                            (+{service.postBufferMin}m clean-up)
                          </span>
                        ) : null}
                      </span>
                    </div>

                    {/* Price & Tax Treatment */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#cbd5e1", fontSize: "13px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ color: "#34d399", fontWeight: 700, fontSize: "15px" }}>
                          {getCurrencySymbol(service.currency || orgCurrency)}
                        </span>
                        <span>
                          Price: <strong>{formatCurrency(service.priceCents, service.currency || orgCurrency)}</strong>
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "6px",
                          backgroundColor:
                            service.taxBehavior === "EXCLUSIVE"
                              ? "rgba(56, 189, 248, 0.12)"
                              : service.taxBehavior === "INCLUSIVE"
                              ? "rgba(16, 185, 129, 0.12)"
                              : "rgba(148, 163, 184, 0.12)",
                          color:
                            service.taxBehavior === "EXCLUSIVE"
                              ? "#38bdf8"
                              : service.taxBehavior === "INCLUSIVE"
                              ? "#34d399"
                              : "#94a3b8",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                        }}
                      >
                        {service.taxBehavior === "EXCLUSIVE"
                          ? "+ Tax"
                          : service.taxBehavior === "INCLUSIVE"
                          ? "Tax Included"
                          : "Tax Exempt"}
                      </span>
                    </div>

                    {/* Deposit Requirement Policy */}
                    {service.depositType && service.depositType !== "NONE" && (
                      <div
                        style={{
                          padding: "6px 10px",
                          backgroundColor: "rgba(234, 179, 8, 0.1)",
                          borderRadius: "6px",
                          border: "1px solid rgba(234, 179, 8, 0.25)",
                          color: "#fde047",
                          fontSize: "12px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span>{depositLabel}</span>
                        {depositSub && <span style={{ opacity: 0.85, fontSize: "11.5px" }}>({depositSub})</span>}
                      </div>
                    )}

                    {/* Dependencies: Staff, Resources, Intake Forms */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                      {assignedStaffCount > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <Users size={13} color="#94a3b8" />
                          <span>{assignedStaffCount} specialist{assignedStaffCount > 1 ? "s" : ""}</span>
                        </div>
                      )}

                      {resourcePoolsCount > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <Layers size={13} color="#38bdf8" />
                          <span>{resourcePoolsCount} resource pool{resourcePoolsCount > 1 ? "s" : ""}</span>
                        </div>
                      )}

                      {intakeFormsCount > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <FileText size={13} color="#a855f7" />
                          <span>{intakeFormsCount} intake form{intakeFormsCount > 1 ? "s" : ""}</span>
                        </div>
                      )}

                      {appointmentsCount > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", color: "#34d399", fontWeight: 700 }}>
                          <span>★ {appointmentsCount} booking{appointmentsCount > 1 ? "s" : ""}</span>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    {service.description && (
                      <p
                        style={{
                          color: "#94a3b8",
                          fontSize: "12.5px",
                          lineHeight: 1.5,
                          margin: "6px 0 0",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {service.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer with Status Toggle and Price */}
                <div
                  style={{
                    paddingTop: "14px",
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <button
                    onClick={() => handleToggleActive(service)}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                    }}
                    title="Click to toggle active status"
                  >
                    <GlassBadge variant={service.isActive ? "success" : "default"}>
                      {service.isActive ? "● Active in Catalog" : "○ Inactive (Draft)"}
                    </GlassBadge>
                  </button>

                  <span style={{ color: "#38bdf8", fontSize: "14.5px", fontWeight: 800 }}>
                    {formatCurrency(service.priceCents, service.currency || orgCurrency)}
                  </span>
                </div>
              </GlassCard>
            );
          })}
        </AnimatedGroup>

          {filteredServices.length > 9 && (
            <div style={{ textAlign: "center", marginTop: "20px" }}>
              <button
                type="button"
                onClick={() => setShowAllServices(!showAllServices)}
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
                {showAllServices
                  ? "Show fewer services"
                  : `Showing 9 of ${filteredServices.length} services · See all`}
              </button>
            </div>
          )}
        </>
      )}

      {/* Create / Edit Service Modal */}
      <AnimatePresence>
        {showModal && (
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
              if (e.target === e.currentTarget && !submitting) setShowModal(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", damping: 26, stiffness: 340 }}
              style={{ width: "100%", maxWidth: "700px", margin: "auto" }}
            >
              <GlassCard variant="elevated" glow="primary" style={{ padding: "28px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "18px",
                    paddingBottom: "14px",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: "20px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                      {editingServiceId ? "Edit Service" : "Create New Service"}
                    </h3>
                    <p style={{ color: "#94a3b8", fontSize: "13px", margin: "4px 0 0" }}>
                      Configure duration, buffer times, tax treatments, upfront deposit rules, and practitioner assignments.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowModal(false)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#94a3b8",
                      fontSize: "20px",
                      cursor: "pointer",
                      padding: "4px",
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Modal Tabs */}
                <div
                  style={{
                    display: "flex",
                    gap: "6px",
                    marginBottom: "20px",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    paddingBottom: "10px",
                    overflowX: "auto",
                  }}
                >
                  {[
                    { id: "general", label: "1. Details & Image" },
                    { id: "timing", label: "2. Timing & Buffers" },
                    { id: "pricing", label: "3. Pricing, Tax & Deposit" },
                    { id: "dependencies", label: "4. Staff & Resources" },
                    { id: "instructions", label: "5. Instructions & Status" },
                  ].map((tab) => {
                    const isActive = modalTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setModalTab(tab.id as ModalTab)}
                        style={{
                          position: "relative",
                          padding: "7px 12px",
                          borderRadius: "6px",
                          border: "none",
                          backgroundColor: "transparent",
                          color: isActive ? "#38bdf8" : "#94a3b8",
                          fontWeight: isActive ? 700 : 500,
                          fontSize: "12.5px",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          transition: "color 0.15s ease",
                        }}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="service-modal-tab-pill"
                            style={{
                              position: "absolute",
                              inset: 0,
                              borderRadius: "6px",
                              backgroundColor: "rgba(2, 132, 199, 0.25)",
                              border: "1px solid rgba(56, 189, 248, 0.4)",
                              zIndex: 1,
                            }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          />
                        )}
                        <span style={{ position: "relative", zIndex: 2 }}>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

              <form onSubmit={handleSubmit}>
                {/* TAB 1: General Details */}
                {modalTab === "general" && (
                  <div style={{ display: "grid", gap: "16px" }}>
                    <div>
                      <label
                        htmlFor="service-form-name"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                      >
                        Service Title <span style={{ color: "#38bdf8" }}>*</span>
                      </label>
                      <input
                        id="service-form-name"
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleFormFieldChange("name", e.target.value)}
                        placeholder="e.g. Deep Tissue Massage / Initial Consultation"
                        required
                        aria-invalid={!!formErrors.name}
                        style={{
                          width: "100%",
                          padding: "12px 14px",
                          borderRadius: "8px",
                          border: formErrors.name ? "1px solid #fb7185" : "1px solid rgba(255, 255, 255, 0.12)",
                          backgroundColor: "rgba(15, 23, 42, 0.8)",
                          color: "#fff",
                          fontSize: "14px",
                          outline: "none",
                        }}
                      />
                      {formErrors.name && (
                        <p role="alert" style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>
                          {formErrors.name}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="service-form-category"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                      >
                        Category
                      </label>
                      <input
                        id="service-form-category"
                        type="text"
                        value={formData.category}
                        onChange={(e) => handleFormFieldChange("category", e.target.value)}
                        placeholder="e.g. Consultation, Treatment, Styling & Hair"
                        style={{
                          width: "100%",
                          padding: "11px 14px",
                          borderRadius: "8px",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          backgroundColor: "rgba(15, 23, 42, 0.8)",
                          color: "#fff",
                          fontSize: "13.5px",
                          outline: "none",
                          marginBottom: "8px",
                        }}
                      />
                      {availableCategories.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {availableCategories.map((c) => (
                            <button
                              key={c.name}
                              type="button"
                              onClick={() => handleFormFieldChange("category", c.name)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: "6px",
                                border: formData.category === c.name ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.08)",
                                backgroundColor: formData.category === c.name ? "rgba(2, 132, 199, 0.2)" : "rgba(15, 23, 42, 0.5)",
                                color: formData.category === c.name ? "#38bdf8" : "#94a3b8",
                                fontSize: "11.5px",
                                cursor: "pointer",
                              }}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="service-form-desc"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                      >
                        Service Description
                      </label>
                      <textarea
                        id="service-form-desc"
                        rows={3}
                        value={formData.description}
                        onChange={(e) => handleFormFieldChange("description", e.target.value)}
                        placeholder="Provide details about what customers should anticipate during this session…"
                        style={{
                          width: "100%",
                          padding: "11px 14px",
                          borderRadius: "8px",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          backgroundColor: "rgba(15, 23, 42, 0.8)",
                          color: "#fff",
                          fontSize: "13.5px",
                          outline: "none",
                          resize: "vertical",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="service-form-image"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                      >
                        Image URL (Optional)
                      </label>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <input
                          id="service-form-image"
                          type="url"
                          value={formData.imageUrl}
                          onChange={(e) => handleFormFieldChange("imageUrl", e.target.value)}
                          placeholder="https://images.unsplash.com/photo-..."
                          style={{
                            flex: 1,
                            padding: "11px 14px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255, 255, 255, 0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "13.5px",
                            outline: "none",
                          }}
                        />
                        {formData.imageUrl && (
                          <img
                            src={formData.imageUrl}
                            alt="Preview"
                            style={{
                              width: "42px",
                              height: "42px",
                              borderRadius: "8px",
                              objectFit: "cover",
                              border: "1px solid rgba(255, 255, 255, 0.2)",
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: Timing & Buffers */}
                {modalTab === "timing" && (
                  <div style={{ display: "grid", gap: "18px" }}>
                    {/* Duration */}
                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                        Service Duration (Minutes) <span style={{ color: "#38bdf8" }}>*</span>
                      </label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                        {DURATION_PRESETS.map((dur) => (
                          <button
                            key={dur}
                            type="button"
                            onClick={() => handleFormFieldChange("durationMin", dur)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: formData.durationMin === dur ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.12)",
                              backgroundColor: formData.durationMin === dur ? "rgba(2, 132, 199, 0.25)" : "rgba(15, 23, 42, 0.6)",
                              color: formData.durationMin === dur ? "#38bdf8" : "#cbd5e1",
                              fontWeight: 700,
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            {dur}m
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={formData.durationMin || ""}
                        onChange={(e) => handleFormFieldChange("durationMin", parseInt(e.target.value, 10) || 15)}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: formErrors.durationMin ? "1px solid #fb7185" : "1px solid rgba(255, 255, 255, 0.12)",
                          backgroundColor: "rgba(15, 23, 42, 0.8)",
                          color: "#fff",
                          fontSize: "13.5px",
                        }}
                      />
                      {formErrors.durationMin && (
                        <p role="alert" style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>
                          {formErrors.durationMin}
                        </p>
                      )}
                    </div>

                    {/* Pre-Buffer (Prep time) */}
                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                        Pre-Buffer Setup Time (Minutes)
                      </label>
                      <p style={{ color: "#94a3b8", fontSize: "12px", margin: "0 0 6px" }}>
                        Time blocked before the appointment to prepare the room or equipment.
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                        {BUFFER_PRESETS.map((buf) => (
                          <button
                            key={buf}
                            type="button"
                            onClick={() => handleFormFieldChange("preBufferMin", buf)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: formData.preBufferMin === buf ? "1px solid #eab308" : "1px solid rgba(255, 255, 255, 0.12)",
                              backgroundColor: formData.preBufferMin === buf ? "rgba(234, 179, 8, 0.2)" : "rgba(15, 23, 42, 0.6)",
                              color: formData.preBufferMin === buf ? "#fde047" : "#cbd5e1",
                              fontWeight: 700,
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            {buf === 0 ? "None" : `${buf}m`}
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={formData.preBufferMin}
                        onChange={(e) => handleFormFieldChange("preBufferMin", parseInt(e.target.value, 10) || 0)}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          backgroundColor: "rgba(15, 23, 42, 0.8)",
                          color: "#fff",
                          fontSize: "13.5px",
                        }}
                      />
                    </div>

                    {/* Post-Buffer (Clean-up time) */}
                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                        Post-Buffer Clean-Up Time (Minutes)
                      </label>
                      <p style={{ color: "#94a3b8", fontSize: "12px", margin: "0 0 6px" }}>
                        Time blocked after the appointment for sanitation and room turnaround.
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                        {BUFFER_PRESETS.map((buf) => (
                          <button
                            key={buf}
                            type="button"
                            onClick={() => handleFormFieldChange("postBufferMin", buf)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: formData.postBufferMin === buf ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.12)",
                              backgroundColor: formData.postBufferMin === buf ? "rgba(2, 132, 199, 0.25)" : "rgba(15, 23, 42, 0.6)",
                              color: formData.postBufferMin === buf ? "#38bdf8" : "#cbd5e1",
                              fontWeight: 700,
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            {buf === 0 ? "None" : `${buf}m`}
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={formData.postBufferMin}
                        onChange={(e) => handleFormFieldChange("postBufferMin", parseInt(e.target.value, 10) || 0)}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          backgroundColor: "rgba(15, 23, 42, 0.8)",
                          color: "#fff",
                          fontSize: "13.5px",
                        }}
                      />
                    </div>

                    {/* Capacity and Group Bounds */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                          Maximum Capacity
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={formData.capacity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 1;
                            setFormData((prev) => ({
                              ...prev,
                              capacity: val,
                              maxParticipants: Math.max(val, prev.maxParticipants),
                            }));
                          }}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255, 255, 255, 0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "13.5px",
                          }}
                        />
                        <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "#94a3b8" }}>
                          Maximum concurrent clients per time slot. Slots vanish dynamically when capacity is filled.
                        </p>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                          Min Participants
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={formData.minParticipants}
                          onChange={(e) => handleFormFieldChange("minParticipants", parseInt(e.target.value, 10) || 1)}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255, 255, 255, 0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "13.5px",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                          Max Participants
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={formData.maxParticipants}
                          onChange={(e) => handleFormFieldChange("maxParticipants", parseInt(e.target.value, 10) || 1)}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255, 255, 255, 0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "13.5px",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: Pricing, Tax & Deposit */}
                {modalTab === "pricing" && (
                  <div style={{ display: "grid", gap: "18px" }}>
                    {/* Price Input */}
                    <div>
                      <label
                        htmlFor="service-form-price"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                      >
                        Base Price ({orgCurrency}) <span style={{ color: "#38bdf8" }}>*</span>
                      </label>
                      <div style={{ position: "relative" }}>
                        <span
                          style={{
                            position: "absolute",
                            left: "12px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "#94a3b8",
                            fontWeight: 700,
                            fontSize: "13px",
                          }}
                        >
                          {orgCurrency}
                        </span>
                        <input
                          id="service-form-price"
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.price}
                          onChange={(e) => handleFormFieldChange("price", e.target.value)}
                          placeholder="0.00"
                          style={{
                            width: "100%",
                            padding: "12px 14px 12px 60px",
                            borderRadius: "8px",
                            border: formErrors.price ? "1px solid #fb7185" : "1px solid rgba(255, 255, 255, 0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "14px",
                            outline: "none",
                          }}
                        />
                      </div>
                      {formErrors.price && (
                        <p role="alert" style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>
                          {formErrors.price}
                        </p>
                      )}
                    </div>

                    {/* Tax Treatment Policy */}
                    <div>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                        Tax Treatment Policy
                      </label>
                      <select
                        value={formData.taxBehavior}
                        onChange={(e) => handleFormFieldChange("taxBehavior", e.target.value as any)}
                        style={{
                          width: "100%",
                          padding: "11px 12px",
                          borderRadius: "8px",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          backgroundColor: "#0f172a",
                          color: "#fff",
                          fontSize: "13.5px",
                        }}
                      >
                        <option value="EXCLUSIVE">Tax Exclusive (+Tax added at checkout)</option>
                        <option value="INCLUSIVE">Tax Inclusive (Tax already inside the base price)</option>
                        <option value="NONE">Tax Exempt (No tax applied)</option>
                      </select>
                      <p style={{ color: "#94a3b8", fontSize: "12px", margin: "6px 0 0", lineHeight: 1.4 }}>
                        {formData.taxBehavior === "EXCLUSIVE" &&
                          "Taxes will be calculated at checkout based on the booked location tax rate and added on top of the total."}
                        {formData.taxBehavior === "INCLUSIVE" &&
                          "The base price already contains taxes. Customers are not charged extra tax, but the tax portion is itemized."}
                        {formData.taxBehavior === "NONE" &&
                          "This service is tax-exempt. No taxes will be calculated or added regardless of location tax rates."}
                      </p>
                    </div>

                    {/* Deposit Requirement Policy */}
                    <div>
                      <label
                        htmlFor="service-form-deposit-type"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                      >
                        Online Deposit Requirement
                      </label>
                      <select
                        id="service-form-deposit-type"
                        value={formData.depositType}
                        onChange={(e) => handleFormFieldChange("depositType", e.target.value as any)}
                        style={{
                          width: "100%",
                          padding: "11px 12px",
                          borderRadius: "8px",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          backgroundColor: "#0f172a",
                          color: "#fff",
                          fontSize: "13.5px",
                          marginBottom: formData.depositType !== "NONE" ? "10px" : "0",
                        }}
                      >
                        <option value="NONE">No Deposit Required (Pay 100% in person / at studio)</option>
                        <option value="PERCENTAGE">Percentage Deposit (e.g. 25% upfront online)</option>
                        <option value="FIXED">Fixed Amount Deposit (e.g. $25.00 upfront online)</option>
                      </select>

                      {formData.depositType !== "NONE" && (
                        <div>
                          <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>
                            {formData.depositType === "PERCENTAGE"
                              ? "Deposit Percentage (%)"
                              : `Deposit Amount (${orgCurrency})`}
                          </label>
                          <input
                            type="number"
                            step={formData.depositType === "PERCENTAGE" ? "1" : "0.01"}
                            min="1"
                            max={formData.depositType === "PERCENTAGE" ? "100" : undefined}
                            value={formData.depositValue}
                            onChange={(e) => handleFormFieldChange("depositValue", e.target.value)}
                            placeholder={formData.depositType === "PERCENTAGE" ? "25" : "25.00"}
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: "8px",
                              border: formErrors.depositValue ? "1px solid #fb7185" : "1px solid rgba(255, 255, 255, 0.12)",
                              backgroundColor: "rgba(15, 23, 42, 0.8)",
                              color: "#fff",
                              fontSize: "13.5px",
                            }}
                          />
                          {formErrors.depositValue && (
                            <p role="alert" style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>
                              {formErrors.depositValue}
                            </p>
                          )}

                          {/* Dynamic Calculation Preview */}
                          <div
                            style={{
                              marginTop: "8px",
                              padding: "8px 12px",
                              borderRadius: "6px",
                              backgroundColor: "rgba(56, 189, 248, 0.08)",
                              border: "1px solid rgba(56, 189, 248, 0.2)",
                              color: "#38bdf8",
                              fontSize: "12.5px",
                            }}
                          >
                            {(() => {
                              const p = parseFloat(formData.price) || 0;
                              const d = parseFloat(formData.depositValue) || 0;
                              let upfront = 0;
                              if (formData.depositType === "PERCENTAGE") {
                                upfront = (p * d) / 100;
                              } else {
                                upfront = Math.min(p, d);
                              }
                              const balance = Math.max(0, p - upfront);
                              return (
                                <span>
                                  Customer checkout preview: <strong>{formatCurrency(Math.round(upfront * 100), orgCurrency)}</strong> due now to confirm booking; remainder of <strong>{formatCurrency(Math.round(balance * 100), orgCurrency)}</strong> due at appointment.
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 4: Staff & Resource Dependencies */}
                {modalTab === "dependencies" && (
                  <div style={{ display: "grid", gap: "18px" }}>
                    {/* Eligible Practitioners */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <label style={{ fontSize: "13px", fontWeight: 700, color: "#cbd5e1" }}>
                          Assigned Specialists / Practitioners
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              selectedStaffIds:
                                prev.selectedStaffIds.length === staffList.length
                                  ? []
                                  : staffList.map((s) => s.id),
                            }))
                          }
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#38bdf8",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {formData.selectedStaffIds.length === staffList.length ? "Deselect All" : "Select All"}
                        </button>
                      </div>

                      {staffList.length === 0 ? (
                        <p style={{ color: "#94a3b8", fontSize: "13px" }}>No staff members available yet.</p>
                      ) : (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                            gap: "8px",
                            maxHeight: "150px",
                            overflowY: "auto",
                            padding: "4px",
                          }}
                        >
                          {staffList.map((st) => {
                            const selected = formData.selectedStaffIds.includes(st.id);
                            return (
                              <div
                                key={st.id}
                                onClick={() => toggleStaffSelection(st.id)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                  padding: "8px 12px",
                                  borderRadius: "8px",
                                  border: selected ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.08)",
                                  backgroundColor: selected ? "rgba(2, 132, 199, 0.18)" : "rgba(15, 23, 42, 0.6)",
                                  cursor: "pointer",
                                  userSelect: "none",
                                }}
                              >
                                <div
                                  style={{
                                    width: "18px",
                                    height: "18px",
                                    borderRadius: "4px",
                                    border: selected ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.2)",
                                    backgroundColor: selected ? "#0284c7" : "transparent",
                                    display: "grid",
                                    placeItems: "center",
                                    color: "#fff",
                                  }}
                                >
                                  {selected && <Check size={12} />}
                                </div>
                                <div style={{ overflow: "hidden" }}>
                                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#f8fafc", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                                    {st.displayName}
                                  </div>
                                  {st.title && <div style={{ fontSize: "11px", color: "#94a3b8" }}>{st.title}</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Required Resource Pools */}
                    {resourcePools.length > 0 && (
                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                          Required Resource Pools (Rooms, Stations & Equipment)
                        </label>
                        <p style={{ color: "#94a3b8", fontSize: "12px", margin: "0 0 8px" }}>
                          Slots will only be offered when both specialist and required physical equipment are available.
                        </p>
                        <div style={{ display: "grid", gap: "8px", maxHeight: "140px", overflowY: "auto" }}>
                          {resourcePools.map((pool) => {
                            const currentReq = formData.requiredResourcePools.find((p) => p.poolId === pool.id);
                            const qty = currentReq?.quantity || 0;
                            return (
                              <div
                                key={pool.id}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  padding: "8px 12px",
                                  borderRadius: "8px",
                                  backgroundColor: "rgba(15, 23, 42, 0.6)",
                                  border: "1px solid rgba(255, 255, 255, 0.08)",
                                }}
                              >
                                <div>
                                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#f8fafc" }}>{pool.name}</div>
                                  {pool.category && <div style={{ fontSize: "11px", color: "#94a3b8" }}>{pool.category}</div>}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>Units:</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="10"
                                    value={qty}
                                    onChange={(e) => handlePoolRequirementChange(pool.id, parseInt(e.target.value, 10) || 0)}
                                    style={{
                                      width: "55px",
                                      padding: "6px 8px",
                                      borderRadius: "6px",
                                      border: qty > 0 ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.15)",
                                      backgroundColor: "#0f172a",
                                      color: "#fff",
                                      fontSize: "13px",
                                      textAlign: "center",
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Linked Intake Forms */}
                    {intakeForms.length > 0 && (
                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                          Mandatory Customer Intake Forms
                        </label>
                        <p style={{ color: "#94a3b8", fontSize: "12px", margin: "0 0 8px" }}>
                          Customers will be prompted to fill out these questionnaires during the booking flow.
                        </p>
                        <div style={{ display: "grid", gap: "6px", maxHeight: "130px", overflowY: "auto" }}>
                          {intakeForms.map((form) => {
                            const selected = formData.selectedIntakeFormIds.includes(form.id);
                            return (
                              <div
                                key={form.id}
                                onClick={() => toggleIntakeFormSelection(form.id)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                  padding: "8px 12px",
                                  borderRadius: "8px",
                                  border: selected ? "1px solid #a855f7" : "1px solid rgba(255, 255, 255, 0.08)",
                                  backgroundColor: selected ? "rgba(168, 85, 247, 0.15)" : "rgba(15, 23, 42, 0.6)",
                                  cursor: "pointer",
                                  userSelect: "none",
                                }}
                              >
                                <div
                                  style={{
                                    width: "18px",
                                    height: "18px",
                                    borderRadius: "4px",
                                    border: selected ? "1px solid #a855f7" : "1px solid rgba(255, 255, 255, 0.2)",
                                    backgroundColor: selected ? "#a855f7" : "transparent",
                                    display: "grid",
                                    placeItems: "center",
                                    color: "#fff",
                                  }}
                                >
                                  {selected && <Check size={12} />}
                                </div>
                                <div style={{ fontSize: "13px", fontWeight: 600, color: "#f8fafc" }}>
                                  {form.name} {form.isGlobal ? "(Global)" : ""}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 5: Instructions & Status */}
                {modalTab === "instructions" && (
                  <div style={{ display: "grid", gap: "18px" }}>
                    <div>
                      <label
                        htmlFor="service-form-prep"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}
                      >
                        Customer Preparation & Arrival Instructions
                      </label>
                      <p style={{ color: "#94a3b8", fontSize: "12px", margin: "0 0 8px" }}>
                        Displayed during the booking review and in confirmation notifications.
                      </p>
                      <textarea
                        id="service-form-prep"
                        rows={3}
                        value={formData.preparationInstructions}
                        onChange={(e) => handleFormFieldChange("preparationInstructions", e.target.value)}
                        placeholder="e.g. Please arrive 10 minutes before your scheduled appointment with face cleansed and jewelry removed."
                        style={{
                          width: "100%",
                          padding: "11px 14px",
                          borderRadius: "8px",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          backgroundColor: "rgba(15, 23, 42, 0.8)",
                          color: "#fff",
                          fontSize: "13.5px",
                          outline: "none",
                          resize: "vertical",
                        }}
                      />
                    </div>

                    <div
                      style={{
                        padding: "14px 16px",
                        borderRadius: "10px",
                        backgroundColor: "rgba(15, 23, 42, 0.7)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <input
                        id="service-active-toggle"
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) => handleFormFieldChange("isActive", e.target.checked)}
                        style={{ width: "18px", height: "18px", cursor: "pointer" }}
                      />
                      <div>
                        <label htmlFor="service-active-toggle" style={{ fontSize: "13.5px", fontWeight: 700, color: "#f8fafc", cursor: "pointer" }}>
                          Active & Bookable in Customer Catalog
                        </label>
                        <p style={{ color: "#94a3b8", fontSize: "12px", margin: "2px 0 0" }}>
                          If unchecked, this service is safely drafted and hidden from customers.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Modal Footer Controls */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "24px",
                    paddingTop: "16px",
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <div style={{ display: "flex", gap: "6px" }}>
                    {modalTab !== "general" && (
                      <button
                        type="button"
                        onClick={() => {
                          const tabs: ModalTab[] = ["general", "timing", "pricing", "dependencies", "instructions"];
                          const idx = tabs.indexOf(modalTab);
                          if (idx > 0) setModalTab(tabs[idx - 1]);
                        }}
                        style={{
                          padding: "8px 14px",
                          borderRadius: "6px",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          backgroundColor: "transparent",
                          color: "#94a3b8",
                          fontSize: "12.5px",
                          cursor: "pointer",
                        }}
                      >
                        ← Back
                      </button>
                    )}
                    {modalTab !== "instructions" && (
                      <button
                        type="button"
                        onClick={() => {
                          const tabs: ModalTab[] = ["general", "timing", "pricing", "dependencies", "instructions"];
                          const idx = tabs.indexOf(modalTab);
                          if (idx < tabs.length - 1) setModalTab(tabs[idx + 1]);
                        }}
                        style={{
                          padding: "8px 14px",
                          borderRadius: "6px",
                          border: "1px solid rgba(56, 189, 248, 0.3)",
                          backgroundColor: "rgba(2, 132, 199, 0.15)",
                          color: "#38bdf8",
                          fontSize: "12.5px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Next Step →
                      </button>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      style={{
                        padding: "10px 18px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        backgroundColor: "transparent",
                        color: "#94a3b8",
                        fontSize: "13.5px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      style={{
                        padding: "10px 22px",
                        borderRadius: "8px",
                        border: "none",
                        background: "linear-gradient(135deg, #0284c7, #2563eb)",
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: "13.5px",
                        cursor: submitting ? "not-allowed" : "pointer",
                        boxShadow: "0 4px 14px rgba(2, 132, 199, 0.3)",
                      }}
                    >
                      {submitting ? "Saving to Database…" : editingServiceId ? "Save Changes" : "Create Service"}
                    </button>
                  </div>
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
