/* Hallmark · macrostructure: Multi-Stage Studio · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 */
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  ArrowRight,
  Bot,
  Calendar,
  MapPin,
  Clock,
  Search,
  Sparkles,
  ShieldCheck,
  Compass,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Users,
  UserCheck,
} from "../../components/icons";
import { apiFetch } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { useRealtimeEvents } from "../../lib/use-realtime-events";
import { GlassCard, GlassBadge } from "../../components/glass-card";
import {
  FloatingParticles,
  PulsingDot,
  ClockSpinner,
  CalendarPulse,
  MapPinPulse,
  OrbitRings,
  ShieldLock,
  WaveformBars,
  SparklesGlow,
} from "../../components/animated-svgs";
import { CustomerPortalShell } from "../../components/shell/customer-portal-shell";

type PublicOrganization = {
  id: string;
  name: string;
  brandName?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  slug: string;
  timezone?: string;
  currency?: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  locations: Array<{
    id: string;
    name: string;
    slug?: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
    phone?: string | null;
    instructions?: string | null;
    parkingAccess?: string | null;
    operatingHours?: Record<string, { open: string; close: string }>;
  }>;
  services: Array<{
    id: string;
    name: string;
    description?: string | null;
    durationMin: number;
    priceCents: number;
    currency: string;
    depositType?: string | null;
    depositValue?: number | null;
    capacity?: number | null;
    category?: string | null;
    imageUrl?: string | null;
    preparationInstructions?: string | null;
    preBufferMin?: number;
    postBufferMin?: number;
    taxBehavior?: "EXCLUSIVE" | "INCLUSIVE" | "NONE";
    isActive?: boolean;
  }>;
  staffProfiles?: Array<{
    id: string;
    displayName: string;
    title?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    calendarColor?: string | null;
    skills?: string[];
    staffLocations?: Array<{ locationId: string; isPrimary: boolean }>;
    staffServices?: Array<{ serviceId: string; customPriceCents?: number | null; customDurationMin?: number | null }>;
  }>;
  policy?: {
    minNoticeHours?: number;
    maxNoticeDays?: number;
    cancelCutoffHours?: number;
    cancelFeeType?: string;
    cancelFeeValue?: number;
  } | null;
};

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

export default function TenantPublicPage() {
  const params = useParams();
  const tenant = (params?.tenant as string) || (params?.slug as string) || "";
  const { user } = useAuth();

  const [organization, setOrganization] = useState<PublicOrganization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serviceSearch, setServiceSearch] = useState("");
  const [selectedDuration, setSelectedDuration] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const fetchOrg = useCallback(
    (showLoading = false) => {
      if (!tenant) return;
      if (showLoading) setLoading(true);
      apiFetch<PublicOrganization>(`/organization/by-slug/${encodeURIComponent(tenant)}`).then((response) => {
        if (response.success && response.data) {
          setOrganization(response.data);
        } else if (showLoading) {
          setError(response.error?.message || "This business booking portal is currently unavailable.");
        }
        if (showLoading) setLoading(false);
      });
    },
    [tenant]
  );

  useEffect(() => {
    fetchOrg(true);
    const onFocus = () => fetchOrg(false);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchOrg]);

  useRealtimeEvents(organization?.id, {
    onEvent: (event) => {
      if (
        event.type.startsWith("staff.") ||
        event.type.startsWith("service.") ||
        event.type.startsWith("schedule.") ||
        event.type.startsWith("location.") ||
        event.type.startsWith("org.")
      ) {
        fetchOrg(false);
      }
    },
  });

  const displayName = organization?.brandName || organization?.name || tenant;
  const accentColor = organization?.primaryColor || "#0284c7";

  const categories = useMemo(() => {
    if (!organization?.services) return [];
    const set = new Set<string>();
    organization.services.forEach((s) => {
      if (s.category && s.category.trim()) set.add(s.category.trim());
    });
    return Array.from(set);
  }, [organization?.services]);

  const filteredServices = useMemo(() => {
    if (!organization?.services) return [];
    return organization.services.filter((service) => {
      if (service.isActive === false) return false;

      const matchesCategory =
        selectedCategory === "all" ||
        (service.category && service.category.toLowerCase() === selectedCategory.toLowerCase());

      const matchesSearch =
        !serviceSearch.trim() ||
        service.name.toLowerCase().includes(serviceSearch.toLowerCase()) ||
        (service.description && service.description.toLowerCase().includes(serviceSearch.toLowerCase())) ||
        (service.category && service.category.toLowerCase().includes(serviceSearch.toLowerCase()));

      const matchesDuration =
        selectedDuration === "all" ||
        (selectedDuration === "short" && service.durationMin <= 30) ||
        (selectedDuration === "medium" && service.durationMin > 30 && service.durationMin <= 60) ||
        (selectedDuration === "long" && service.durationMin > 60);

      return matchesCategory && matchesSearch && matchesDuration;
    });
  }, [organization?.services, serviceSearch, selectedDuration, selectedCategory]);

  if (error) {
    return (
      <CustomerPortalShell pageTitle="Storefront Unavailable">
        <main
          style={{
            minHeight: "75vh",
            display: "grid",
            placeItems: "center",
            padding: "40px 24px",
            position: "relative",
          }}
        >
          <FloatingParticles count={8} />
          <GlassCard
            variant="panel"
            glow="subtle"
            style={{ padding: "48px 36px", textAlign: "center", maxWidth: "480px" }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "rgba(244, 63, 94, 0.15)",
                border: "1px solid rgba(244, 63, 94, 0.35)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 20px",
                color: "#f43f5e",
                fontSize: "24px",
                fontWeight: 900,
              }}
            >
              !
            </div>
            <h1 style={{ color: "#f8fafc", fontSize: "22px", fontWeight: 800, margin: "0 0 10px" }}>
              Business Portal Unavailable
            </h1>
            <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: 1.6, margin: "0 0 24px" }}>
              {error}
            </p>
            <Link
              href="/organizations"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                borderRadius: "8px",
                backgroundColor: "rgba(56, 189, 248, 0.15)",
                border: "1px solid rgba(56, 189, 248, 0.4)",
                color: "#38bdf8",
                fontWeight: 700,
                fontSize: "14px",
                textDecoration: "none",
              }}
            >
              <Compass size={16} /> Browse Verified Businesses
            </Link>
          </GlassCard>
        </main>
      </CustomerPortalShell>
    );
  }

  if (loading || !organization) {
    return (
      <CustomerPortalShell pageTitle="Loading Business Profile…">
        <main
          style={{
            minHeight: "75vh",
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              color: "#94a3b8",
            }}
          >
            <ClockSpinner size={36} />
            <span style={{ fontSize: "14px", fontWeight: 600 }}>Loading verified storefront…</span>
          </div>
        </main>
      </CustomerPortalShell>
    );
  }

  return (
    <CustomerPortalShell tenantInfo={organization} pageTitle={displayName}>
      <div
        style={{
          position: "relative",
          overflowX: "clip",
          paddingBottom: "80px",
        }}
      >
        <FloatingParticles count={14} />

        {/* Ambient Top Glow */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "100%",
            maxWidth: "1000px",
            height: "400px",
            background: `radial-gradient(ellipse at 50% 0%, ${accentColor}25 0%, transparent 70%)`,
            pointerEvents: "none",
            zIndex: 0,
          }}
          aria-hidden="true"
        />

        <div
          style={{
            maxWidth: "1240px",
            margin: "0 auto",
            padding: "48px 24px 0",
            position: "relative",
            zIndex: 10,
          }}
        >
          {/* Hero Section */}
          <section style={{ textAlign: "center", marginBottom: "64px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 16px",
                borderRadius: "9999px",
                backgroundColor: `${accentColor}15`,
                border: `1px solid ${accentColor}40`,
                color: accentColor,
                fontSize: "12.5px",
                fontWeight: 800,
                letterSpacing: "0.04em",
                marginBottom: "20px",
                backdropFilter: "blur(12px)",
              }}
            >
              <PulsingDot color={accentColor} size={6} />
              <span>DIRECT ONLINE SCHEDULING • INSTANT CONFIRMATION</span>
            </div>

            <h1
              style={{
                fontSize: "clamp(2.4rem, 5vw, 4.2rem)",
                fontWeight: 850,
                color: "#f8fafc",
                lineHeight: 1.08,
                letterSpacing: "-0.04em",
                maxWidth: "860px",
                margin: "0 auto 20px",
              }}
            >
              Appointments with <span style={{ color: "#38bdf8" }}>{displayName}</span>
            </h1>

            <p
              style={{
                color: "#94a3b8",
                fontSize: "clamp(15px, 2vw, 17px)",
                lineHeight: 1.6,
                maxWidth: "640px",
                margin: "0 auto 32px",
              }}
            >
              Select your service, choose a specialist, and book in real-time with automatic calendar synchronization and instant booking reference.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "center",
                gap: "14px",
              }}
            >
              <Link
                href={`/${tenant}/book`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "14px 30px",
                  borderRadius: "10px",
                  backgroundColor: accentColor,
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: "15px",
                  fontWeight: 800,
                  boxShadow: `0 8px 24px ${accentColor}45`,
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                }}
              >
                <span>Book Appointment</span>
                <ArrowRight size={18} />
              </Link>

              <Link
                href={`/${tenant}/ai`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "14px 24px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(56, 189, 248, 0.35)",
                  color: "#38bdf8",
                  textDecoration: "none",
                  fontSize: "15px",
                  fontWeight: 750,
                  backdropFilter: "blur(16px)",
                }}
              >
                <Bot size={18} />
                <span>Chat with AI Receptionist</span>
              </Link>
            </div>
          </section>

          {/* Quick Metrics & Badges Grid */}
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "18px",
              marginBottom: "56px",
            }}
          >
            <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <CalendarPulse size={40} />
                <div>
                  <strong style={{ color: "#f8fafc", fontSize: "22px", display: "block", fontWeight: 850 }}>
                    {organization.services.length}
                  </strong>
                  <span style={{ color: "#94a3b8", fontSize: "13px", fontWeight: 600 }}>
                    Verified Services
                  </span>
                </div>
              </div>
            </GlassCard>

            <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <MapPinPulse size={40} color="#34d399" />
                <div>
                  <strong style={{ color: "#f8fafc", fontSize: "22px", display: "block", fontWeight: 850 }}>
                    {organization.locations.length}
                  </strong>
                  <span style={{ color: "#94a3b8", fontSize: "13px", fontWeight: 600 }}>
                    Studio Location{organization.locations.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </GlassCard>

            <GlassCard variant="card" glow="primary" depth3D style={{ padding: "22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <OrbitRings size={44} />
                <div>
                  <strong style={{ color: "#38bdf8", fontSize: "17px", display: "block", fontWeight: 850 }}>
                    Gemini 3.7 Flash
                  </strong>
                  <span style={{ color: "#94a3b8", fontSize: "13px", fontWeight: 600 }}>
                    24/7 Grounded AI Reception
                  </span>
                </div>
              </div>
            </GlassCard>

            <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <ShieldLock size={40} />
                <div>
                  <strong style={{ color: "#f8fafc", fontSize: "17px", display: "block", fontWeight: 850 }}>
                    SSL & Stripe
                  </strong>
                  <span style={{ color: "#94a3b8", fontSize: "13px", fontWeight: 600 }}>
                    Encrypted Direct Checkout
                  </span>
                </div>
              </div>
            </GlassCard>
          </section>

          {/* Service Catalog Header & Filter Bar */}
          <section style={{ marginBottom: "64px" }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "16px",
                marginBottom: "28px",
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "24px",
                    fontWeight: 850,
                    color: "#f8fafc",
                    letterSpacing: "-0.02em",
                    margin: 0,
                  }}
                >
                  Services & Pricing
                </h2>
                <p style={{ color: "#94a3b8", fontSize: "13.5px", margin: "4px 0 0" }}>
                  Browse bookable offerings with real-time slot availability.
                </p>
              </div>

              {/* Search & Filter Controls */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <Search
                    size={15}
                    color="#64748b"
                    style={{ position: "absolute", left: "12px", pointerEvents: "none" }}
                  />
                  <input
                    type="search"
                    value={serviceSearch}
                    onChange={(e) => setServiceSearch(e.target.value)}
                    placeholder="Search services…"
                    style={{
                      padding: "8px 14px 8px 34px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#f8fafc",
                      fontSize: "13px",
                      outline: "none",
                      width: "180px",
                    }}
                  />
                </div>

                {/* Category Filter Pills (if multiple categories exist) */}
                {categories.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      borderRadius: "8px",
                      padding: "3px",
                      gap: "2px",
                      overflowX: "auto",
                      maxWidth: "100%",
                    }}
                  >
                    <button
                      onClick={() => setSelectedCategory("all")}
                      style={{
                        padding: "5px 10px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: selectedCategory === "all" ? 800 : 600,
                        backgroundColor: selectedCategory === "all" ? accentColor : "transparent",
                        color: selectedCategory === "all" ? "#fff" : "#94a3b8",
                        border: "none",
                        cursor: "pointer",
                        transition: "background-color 0.15s ease",
                        whiteSpace: "nowrap",
                      }}
                    >
                      All Categories
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        style={{
                          padding: "5px 10px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: selectedCategory === cat ? 800 : 600,
                          backgroundColor: selectedCategory === cat ? accentColor : "transparent",
                          color: selectedCategory === cat ? "#fff" : "#94a3b8",
                          border: "none",
                          cursor: "pointer",
                          transition: "background-color 0.15s ease",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}

                {/* Duration Filter Pills */}
                <div
                  style={{
                    display: "flex",
                    backgroundColor: "rgba(15, 23, 42, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "8px",
                    padding: "3px",
                    gap: "2px",
                  }}
                >
                  {[
                    { key: "all", label: "All" },
                    { key: "short", label: "≤ 30m" },
                    { key: "medium", label: "30-60m" },
                    { key: "long", label: "> 60m" },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setSelectedDuration(tab.key)}
                      style={{
                        padding: "5px 10px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: selectedDuration === tab.key ? 800 : 600,
                        backgroundColor: selectedDuration === tab.key ? accentColor : "transparent",
                        color: selectedDuration === tab.key ? "#fff" : "#94a3b8",
                        border: "none",
                        cursor: "pointer",
                        transition: "background-color 0.15s ease",
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Services Grid */}
            {filteredServices.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                  gap: "20px",
                }}
              >
                {filteredServices.map((service) => (
                  <GlassCard
                    key={service.id}
                    variant="card"
                    glow="subtle"
                    depth3D
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      padding: "26px",
                      minHeight: "240px",
                    }}
                  >
                    <div>
                      {service.imageUrl && (
                        <div
                          style={{
                            width: "100%",
                            height: "140px",
                            borderRadius: "10px",
                            overflow: "hidden",
                            marginBottom: "16px",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                          }}
                        >
                          <img
                            src={service.imageUrl}
                            alt={service.name}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        </div>
                      )}

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: "12px",
                          marginBottom: "10px",
                        }}
                      >
                        <div>
                          {service.category && (
                            <span
                              style={{
                                display: "inline-block",
                                fontSize: "11px",
                                fontWeight: 800,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                color: "#38bdf8",
                                marginBottom: "4px",
                              }}
                            >
                              {service.category}
                            </span>
                          )}
                          <h3
                            style={{
                              fontSize: "18px",
                              fontWeight: 800,
                              color: "#f8fafc",
                              letterSpacing: "-0.01em",
                              margin: 0,
                            }}
                          >
                            {service.name}
                          </h3>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <span
                            style={{
                              color: "#38bdf8",
                              fontWeight: 850,
                              fontSize: "18px",
                              whiteSpace: "nowrap",
                              display: "block",
                            }}
                          >
                            {formatMoney(service.priceCents, service.currency)}
                          </span>
                          {service.taxBehavior === "INCLUSIVE" ? (
                            <span style={{ fontSize: "11px", color: "#34d399", fontWeight: 700 }}>
                              Tax included
                            </span>
                          ) : service.taxBehavior === "EXCLUSIVE" ? (
                            <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600 }}>
                              + tax
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {service.description && (
                        <p
                          style={{
                            color: "#94a3b8",
                            fontSize: "13.5px",
                            lineHeight: 1.55,
                            margin: "0 0 16px",
                          }}
                        >
                          {service.description}
                        </p>
                      )}

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "12.5px",
                          color: "#cbd5e1",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            backgroundColor: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                          }}
                        >
                          <Clock size={14} color="#38bdf8" />
                          <span>{service.durationMin}m</span>
                          {(service.preBufferMin || 0) + (service.postBufferMin || 0) > 0 && (
                            <span style={{ color: "#64748b", fontSize: "11px" }}>
                              (+{(service.preBufferMin || 0) + (service.postBufferMin || 0)}m buffer)
                            </span>
                          )}
                        </div>

                        {service.capacity && service.capacity > 1 ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "5px",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              backgroundColor: "rgba(168, 85, 247, 0.12)",
                              border: "1px solid rgba(168, 85, 247, 0.3)",
                              color: "#c084fc",
                              fontWeight: 700,
                            }}
                          >
                            <Users size={14} color="#c084fc" />
                            <span>Group (Up to {service.capacity})</span>
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "5px",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              backgroundColor: "rgba(255, 255, 255, 0.05)",
                              border: "1px solid rgba(255, 255, 255, 0.08)",
                              color: "#94a3b8",
                            }}
                          >
                            <UserCheck size={14} color="#94a3b8" />
                            <span>1-on-1 Session</span>
                          </div>
                        )}

                        {service.depositType === "PERCENTAGE" && service.depositValue && (
                          <GlassBadge variant="warning" size="sm">
                            {service.depositValue}% Deposit
                          </GlassBadge>
                        )}

                        {service.depositType === "FIXED" && service.depositValue && (
                          <GlassBadge variant="warning" size="sm">
                            {formatMoney(service.depositValue, service.currency)} Deposit
                          </GlassBadge>
                        )}
                      </div>

                      {service.preparationInstructions && (
                        <div
                          style={{
                            marginTop: "12px",
                            padding: "8px 10px",
                            borderRadius: "6px",
                            backgroundColor: "rgba(56, 189, 248, 0.06)",
                            border: "1px solid rgba(56, 189, 248, 0.15)",
                            fontSize: "11.5px",
                            color: "#94a3b8",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "6px",
                          }}
                        >
                          <span style={{ color: "#38bdf8" }}>ℹ</span>
                          <span>Prep: {service.preparationInstructions}</span>
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        marginTop: "24px",
                        paddingTop: "16px",
                        borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        Instant slot reservation
                      </span>
                      <Link
                        href={`/${tenant}/book?serviceId=${service.id}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          color: accentColor,
                          fontWeight: 800,
                          fontSize: "13.5px",
                          textDecoration: "none",
                        }}
                      >
                        <span>Select Service</span>
                        <ChevronRight size={16} />
                      </Link>
                    </div>
                  </GlassCard>
                ))}
              </div>
            ) : (
              <GlassCard
                variant="panel"
                style={{
                  padding: "40px",
                  textAlign: "center",
                  border: "1px dashed rgba(255, 255, 255, 0.14)",
                }}
              >
                <p style={{ color: "#94a3b8", fontSize: "14px", margin: "0 0 12px" }}>
                  No services match your search or filter criteria.
                </p>
                <button
                  onClick={() => {
                    setServiceSearch("");
                    setSelectedDuration("all");
                  }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#f8fafc",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Reset Filters
                </button>
              </GlassCard>
            )}
          </section>

          {/* Specialists & Practitioners Section */}
          {organization?.staffProfiles && organization.staffProfiles.length > 0 && (
            <section style={{ marginBottom: "64px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  marginBottom: "28px",
                  flexWrap: "wrap",
                  gap: "16px",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "4px 12px",
                      borderRadius: "9999px",
                      backgroundColor: "rgba(56, 189, 248, 0.12)",
                      border: "1px solid rgba(56, 189, 248, 0.25)",
                      color: "#38bdf8",
                      fontSize: "12px",
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      marginBottom: "10px",
                    }}
                  >
                    <Users size={14} />
                    <span>VERIFIED SPECIALISTS & PRACTITIONERS</span>
                  </div>
                  <h2
                    style={{
                      fontSize: "28px",
                      fontWeight: 850,
                      color: "#f8fafc",
                      letterSpacing: "-0.03em",
                      margin: 0,
                    }}
                  >
                    Meet Our Expert Team
                  </h2>
                  <p
                    style={{
                      color: "#94a3b8",
                      fontSize: "14px",
                      marginTop: "6px",
                      marginBottom: 0,
                    }}
                  >
                    Select your preferred practitioner for dedicated, personalized service and scheduling priority.
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "20px",
                }}
              >
                {organization.staffProfiles.map((staff) => {
                  const staffColor = staff.calendarColor || accentColor;
                  const initials = staff.displayName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  const serviceCount = staff.staffServices?.length || 0;

                  return (
                    <GlassCard
                      key={staff.id}
                      variant="panel"
                      depth3D
                      style={{
                        padding: "24px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      {/* Top accent glow line */}
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          height: "3px",
                          background: `linear-gradient(90deg, ${staffColor}, transparent)`,
                        }}
                      />

                      <div>
                        {/* Header: Avatar & Details */}
                        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px" }}>
                          {staff.avatarUrl ? (
                            <img
                              src={staff.avatarUrl}
                              alt={staff.displayName}
                              style={{
                                width: "52px",
                                height: "52px",
                                borderRadius: "14px",
                                objectFit: "cover",
                                border: `2px solid ${staffColor}`,
                                boxShadow: `0 0 16px ${staffColor}33`,
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "52px",
                                height: "52px",
                                borderRadius: "14px",
                                backgroundColor: `${staffColor}22`,
                                border: `2px solid ${staffColor}`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: staffColor,
                                fontWeight: 800,
                                fontSize: "17px",
                                letterSpacing: "-0.02em",
                                boxShadow: `0 0 16px ${staffColor}33`,
                              }}
                            >
                              {initials}
                            </div>
                          )}

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <h3
                                style={{
                                  fontSize: "16px",
                                  fontWeight: 800,
                                  color: "#f8fafc",
                                  margin: 0,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {staff.displayName}
                              </h3>
                              <UserCheck size={14} color={staffColor} />
                            </div>
                            <p
                              style={{
                                fontSize: "12.5px",
                                color: "#94a3b8",
                                margin: "2px 0 0",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {staff.title || "Specialist Practitioner"}
                            </p>
                          </div>
                        </div>

                        {/* Bio / statement */}
                        {staff.bio && (
                          <p
                            style={{
                              fontSize: "13px",
                              color: "#cbd5e1",
                              lineHeight: 1.55,
                              margin: "0 0 16px",
                              display: "-webkit-box",
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {staff.bio}
                          </p>
                        )}

                        {/* Skills chips */}
                        {staff.skills && staff.skills.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
                            {staff.skills.slice(0, 4).map((sk) => (
                              <span
                                key={sk}
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: "6px",
                                  backgroundColor: "rgba(255, 255, 255, 0.06)",
                                  border: "1px solid rgba(255, 255, 255, 0.1)",
                                  color: "#cbd5e1",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                }}
                              >
                                {sk}
                              </span>
                            ))}
                            {staff.skills.length > 4 && (
                              <span
                                style={{
                                  padding: "2px 6px",
                                  borderRadius: "6px",
                                  backgroundColor: "rgba(255, 255, 255, 0.04)",
                                  color: "#64748b",
                                  fontSize: "11px",
                                }}
                              >
                                +{staff.skills.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Footer CTA */}
                      <div
                        style={{
                          marginTop: "16px",
                          paddingTop: "14px",
                          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <span style={{ fontSize: "11.5px", color: "#64748b" }}>
                          {serviceCount > 0
                            ? `${serviceCount} qualified service${serviceCount > 1 ? "s" : ""}`
                            : "Available for booking"}
                        </span>
                        <Link
                          href={`/${tenant}/book?staffId=${staff.id}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "6px 12px",
                            borderRadius: "7px",
                            backgroundColor: `${staffColor}18`,
                            border: `1px solid ${staffColor}40`,
                            color: staffColor,
                            fontWeight: 750,
                            fontSize: "12.5px",
                            textDecoration: "none",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <span>Book with {staff.displayName.split(" ")[0]}</span>
                          <ChevronRight size={14} />
                        </Link>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            </section>
          )}

          {/* AI Concierge Promo Banner */}
          <section style={{ marginBottom: "64px" }}>
            <GlassCard
              variant="hero"
              glow="primary"
              depth3D
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                alignItems: "center",
                gap: "32px",
                padding: "36px",
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "4px 12px",
                    borderRadius: "9999px",
                    backgroundColor: "rgba(56, 189, 248, 0.15)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    color: "#38bdf8",
                    fontSize: "12px",
                    fontWeight: 800,
                    marginBottom: "14px",
                  }}
                >
                  <Sparkles size={14} />
                  <span>AI APPOINTMENT CONCIERGE</span>
                </div>
                <h2
                  style={{
                    fontSize: "24px",
                    fontWeight: 850,
                    color: "#f8fafc",
                    letterSpacing: "-0.02em",
                    margin: "0 0 10px",
                  }}
                >
                  Need recommendation or fast booking?
                </h2>
                <p
                  style={{
                    color: "#94a3b8",
                    fontSize: "14px",
                    lineHeight: 1.6,
                    margin: "0 0 20px",
                  }}
                >
                  Our tool-grounded AI receptionist can answer questions about treatment duration, match you with the right specialist, and create calendar holds directly.
                </p>
                <Link
                  href={`/${tenant}/ai`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 20px",
                    borderRadius: "8px",
                    backgroundColor: "#0284c7",
                    color: "#fff",
                    textDecoration: "none",
                    fontWeight: 800,
                    fontSize: "14px",
                    boxShadow: "0 4px 16px rgba(2, 132, 199, 0.35)",
                  }}
                >
                  <Bot size={16} />
                  <span>Start AI Chat</span>
                </Link>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "24px",
                  backgroundColor: "rgba(10, 15, 26, 0.6)",
                  borderRadius: "16px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                <WaveformBars size={64} />
                <span
                  style={{
                    marginTop: "16px",
                    fontSize: "12.5px",
                    color: "#7dd3fc",
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                  }}
                >
                  Live Gemini 3.7 Voice & Text Agent
                </span>
              </div>
            </GlassCard>
          </section>

          {/* Studio Locations & Branch Map Info */}
          {organization.locations.length > 0 && (
            <section>
              <h2
                style={{
                  fontSize: "24px",
                  fontWeight: 850,
                  color: "#f8fafc",
                  letterSpacing: "-0.02em",
                  margin: "0 0 8px",
                }}
              >
                Studio Locations
              </h2>
              <p style={{ color: "#94a3b8", fontSize: "13.5px", margin: "0 0 24px" }}>
                Visit our physical locations or get directions.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: "20px",
                }}
              >
                {organization.locations.map((loc) => (
                  <GlassCard key={loc.id} variant="card" glow="subtle" depth3D style={{ padding: "24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                      <MapPin size={22} color={accentColor} />
                      <strong style={{ color: "#f8fafc", fontSize: "17px", fontWeight: 800 }}>
                        {loc.name}
                      </strong>
                    </div>

                    <p style={{ color: "#cbd5e1", fontSize: "13.5px", lineHeight: 1.5, margin: "0 0 14px" }}>
                      {loc.address ? `${loc.address}, ${loc.city || ""}` : "Primary Bookable Branch"}
                      {loc.state && ` ${loc.state}`} {loc.postalCode && ` ${loc.postalCode}`}
                    </p>

                    {loc.parkingAccess && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#94a3b8",
                          backgroundColor: "rgba(255, 255, 255, 0.04)",
                          padding: "8px 12px",
                          borderRadius: "6px",
                          marginBottom: "16px",
                        }}
                      >
                        🚗 Parking: {loc.parkingAccess}
                      </div>
                    )}

                    <div style={{ paddingTop: "14px", borderTop: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${loc.name} ${loc.address || ""} ${loc.city || ""}`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          color: "#38bdf8",
                          fontWeight: 700,
                          fontSize: "13px",
                          textDecoration: "none",
                        }}
                      >
                        <span>Directions</span>
                        <ExternalLink size={13} />
                      </a>

                      <Link
                        href={`/${tenant}/book?locationId=${loc.id}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          backgroundColor: `${accentColor}20`,
                          border: `1px solid ${accentColor}50`,
                          color: accentColor,
                          fontWeight: 700,
                          fontSize: "12px",
                          textDecoration: "none",
                        }}
                      >
                        <span>Book Here</span>
                        <ChevronRight size={13} />
                      </Link>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </CustomerPortalShell>
  );
}
