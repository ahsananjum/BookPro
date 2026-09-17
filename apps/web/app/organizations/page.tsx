/* Hallmark · macrostructure: Global Directory Marketplace · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 */
"use client";

import { ActorType } from "@bookpro/contracts";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { GlassCard, GlassBadge } from "../../components/glass-card";
import {
  FloatingParticles,
  ClockSpinner,
  CheckmarkDraw,
  CalendarPulse,
  PulsingDot,
} from "../../components/animated-svgs";
import {
  Search,
  Building2,
  MapPin,
  Calendar,
  Compass,
  ArrowRight,
  Filter,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "../../components/icons";
import { CustomerPortalShell } from "../../components/shell/customer-portal-shell";

type Organization = {
  id: string;
  name: string;
  slug: string;
  brandName?: string | null;
  logoUrl?: string | null;
  industry?: string | null;
  country: string;
  _count: { locations: number; services: number };
};

type DirectoryResponse = {
  items: Organization[];
  total: number;
  page: number;
  pages: number;
  filters: { industries: string[]; countries: string[] };
};

export default function OrganizationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<DirectoryResponse>({
    items: [],
    total: 0,
    page: 1,
    pages: 1,
    filters: { industries: [], countries: [] },
  });
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const canJoin = user?.actorType === ActorType.CUSTOMER;

  useEffect(() => {
    if (!canJoin) return;
    apiFetch<any[]>("/auth/customer-organizations").then((response) => {
      if (response.success) setJoined(new Set((response.data || []).map((item) => item.organization.id)));
    });
  }, [canJoin]);

  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(async () => {
      const query = new URLSearchParams({ page: String(page), limit: "12", sort });
      if (search.trim()) query.set("search", search.trim());
      if (industry) query.set("industry", industry);
      if (country) query.set("country", country);
      const response = await apiFetch<DirectoryResponse>(`/customer-portal/organizations?${query}`);
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setMessage({ kind: "error", text: response.error?.message || "Organizations could not be loaded." });
      }
      setLoading(false);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [search, industry, country, sort, page]);

  async function join(organization: Organization) {
    if (!user) {
      window.location.href = `/login?returnTo=${encodeURIComponent("/organizations")}`;
      return;
    }
    if (!canJoin) {
      setMessage({ kind: "error", text: "Staff or business owner accounts cannot join organizations as customers." });
      return;
    }
    setBusyId(organization.id);
    setMessage(null);
    const response = await apiFetch<any>("/customer-portal/join", {
      method: "POST",
      body: JSON.stringify({ organizationId: organization.id, consentMarketing }),
    });
    setBusyId(null);
    if (!response.success) {
      setMessage({ kind: "error", text: response.error?.message || "This organization could not be joined." });
      return;
    }
    setJoined((current) => new Set(current).add(organization.id));
    setMessage({ kind: "success", text: `You have successfully joined ${organization.brandName || organization.name}!` });
  }

  return (
    <CustomerPortalShell pageTitle="Discover Verified Businesses — BookPro">
      <div style={{ position: "relative", overflowX: "clip", paddingBottom: "80px" }}>
        <FloatingParticles count={12} />

        <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "48px 24px 0", position: "relative", zIndex: 10 }}>
          {/* Hero Section */}
          <section style={{ textAlign: "center", marginBottom: "48px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 16px",
                borderRadius: "9999px",
                backgroundColor: "rgba(56, 189, 248, 0.12)",
                border: "1px solid rgba(56, 189, 248, 0.35)",
                color: "#38bdf8",
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.04em",
                marginBottom: "16px",
              }}
            >
              <PulsingDot color="#38bdf8" size={5} />
              <span>GLOBAL BUSINESS DISCOVERY DIRECTORY</span>
            </div>

            <h1
              style={{
                fontSize: "clamp(2.2rem, 4.5vw, 3.8rem)",
                fontWeight: 850,
                color: "#f8fafc",
                lineHeight: 1.1,
                letterSpacing: "-0.04em",
                maxWidth: "760px",
                margin: "0 auto 16px",
              }}
            >
              Find and book with top verified businesses.
            </h1>

            <p style={{ color: "#94a3b8", fontSize: "16px", maxWidth: "600px", margin: "0 auto 28px" }}>
              Explore services across health, beauty, wellness, and professional studios with unified booking and one customer login.
            </p>
          </section>

          {/* Search & Filter Controls Panel */}
          <GlassCard
            variant="panel"
            glow="subtle"
            style={{
              padding: "24px",
              marginBottom: "36px",
              borderRadius: "16px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "14px",
                alignItems: "flex-end",
              }}
            >
              {/* Search input */}
              <div style={{ minWidth: "220px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 800,
                    color: "#94a3b8",
                    marginBottom: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Search
                </label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <Search size={16} color="#64748b" style={{ position: "absolute", left: "12px" }} />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Business, brand, or service..."
                    style={{
                      width: "100%",
                      padding: "10px 14px 10px 36px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(15, 23, 42, 0.9)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#f8fafc",
                      fontSize: "13.5px",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Industry select */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 800,
                    color: "#94a3b8",
                    marginBottom: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Industry
                </label>
                <select
                  value={industry}
                  onChange={(e) => {
                    setIndustry(e.target.value);
                    setPage(1);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(15, 23, 42, 0.9)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#f8fafc",
                    fontSize: "13.5px",
                    outline: "none",
                  }}
                >
                  <option value="">All Industries</option>
                  {data.filters.industries.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
              </div>

              {/* Country select */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 800,
                    color: "#94a3b8",
                    marginBottom: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Country
                </label>
                <select
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    setPage(1);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(15, 23, 42, 0.9)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#f8fafc",
                    fontSize: "13.5px",
                    outline: "none",
                  }}
                >
                  <option value="">All Countries</option>
                  {data.filters.countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort select */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 800,
                    color: "#94a3b8",
                    marginBottom: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Sort By
                </label>
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    setPage(1);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(15, 23, 42, 0.9)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#f8fafc",
                    fontSize: "13.5px",
                    outline: "none",
                  }}
                >
                  <option value="name">Name (A-Z)</option>
                  <option value="newest">Recently Joined</option>
                  <option value="services">Most Services Offered</option>
                </select>
              </div>
            </div>

            {/* Marketing consent checkbox */}
            {canJoin && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginTop: "18px",
                  fontSize: "13px",
                  color: "#cbd5e1",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={consentMarketing}
                  onChange={(e) => setConsentMarketing(e.target.checked)}
                  style={{ width: "16px", height: "16px", accentColor: "#0284c7" }}
                />
                <span>Allow organizations I join to send me promotional appointment updates and special offers.</span>
              </label>
            )}
          </GlassCard>

          {/* Feedback Messages */}
          {message && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "14px 18px",
                borderRadius: "10px",
                backgroundColor:
                  message.kind === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)",
                border:
                  message.kind === "success"
                    ? "1px solid rgba(52, 211, 153, 0.35)"
                    : "1px solid rgba(244, 63, 94, 0.35)",
                color: message.kind === "success" ? "#6ee7b7" : "#fca5a5",
                fontSize: "13.5px",
                fontWeight: 700,
                marginBottom: "28px",
              }}
            >
              {message.kind === "success" ? <CheckmarkDraw size={24} /> : <span style={{ fontWeight: 900 }}>!</span>}
              <span>{message.text}</span>
            </div>
          )}

          {/* Directory Results Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "24px",
            }}
          >
            <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
              Verified Businesses ({data.total})
            </h2>
            {isCustomer(user) && (
              <Link href="/customer" style={{ color: "#38bdf8", fontWeight: 700, fontSize: "13.5px", textDecoration: "none" }}>
                View My Joined Organizations →
              </Link>
            )}
          </div>

          {/* Organization Cards Grid */}
          {loading ? (
            <div style={{ display: "grid", placeItems: "center", padding: "60px 0" }}>
              <ClockSpinner size={36} />
              <p style={{ color: "#94a3b8", fontSize: "13.5px", marginTop: "12px" }}>
                Searching BookPro directory…
              </p>
            </div>
          ) : data.items.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                gap: "24px",
                marginBottom: "40px",
              }}
            >
              {data.items.map((org) => {
                const isJoined = joined.has(org.id);
                const title = org.brandName || org.name;
                return (
                  <GlassCard
                    key={org.id}
                    variant="card"
                    glow="subtle"
                    depth3D
                    style={{
                      padding: "26px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      minHeight: "240px",
                    }}
                  >
                    <div>
                      {/* Card Head */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: "14px",
                          marginBottom: "16px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          {org.logoUrl ? (
                            <img
                              src={org.logoUrl}
                              alt={title}
                              style={{
                                width: "44px",
                                height: "44px",
                                borderRadius: "10px",
                                objectFit: "cover",
                                border: "1px solid rgba(255, 255, 255, 0.12)",
                              }}
                            />
                          ) : (
                            <span
                              style={{
                                width: "44px",
                                height: "44px",
                                borderRadius: "10px",
                                background: "linear-gradient(135deg, #0284c7, #38bdf8)",
                                display: "grid",
                                placeItems: "center",
                                fontWeight: 900,
                                color: "#fff",
                                fontSize: "18px",
                              }}
                            >
                              {title.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <div>
                            <h3
                              style={{
                                fontSize: "18px",
                                fontWeight: 800,
                                color: "#f8fafc",
                                margin: "0 0 2px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: "220px",
                              }}
                              title={title}
                            >
                              {title}
                            </h3>
                            <span style={{ fontSize: "12px", color: "#38bdf8", fontWeight: 700 }}>
                              {org.industry || "General Services"} • {org.country}
                            </span>
                          </div>
                        </div>

                        {isJoined && (
                          <GlassBadge variant="success" size="sm">
                            Joined
                          </GlassBadge>
                        )}
                      </div>

                      {/* Fact counts */}
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "14px",
                          fontSize: "12.5px",
                          color: "#cbd5e1",
                          marginBottom: "20px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Calendar size={14} color="#38bdf8" />
                          <span>{org._count.services} bookable service{org._count.services === 1 ? "" : "s"}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <MapPin size={14} color="#34d399" />
                          <span>{org._count.locations} location{org._count.locations === 1 ? "" : "s"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        paddingTop: "16px",
                        borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                      }}
                    >
                      <Link
                        href={`/${org.slug}`}
                        style={{
                          flex: 1,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          padding: "9px 12px",
                          borderRadius: "8px",
                          backgroundColor: "rgba(255, 255, 255, 0.06)",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          color: "#f8fafc",
                          fontSize: "13px",
                          fontWeight: 700,
                          textDecoration: "none",
                          transition: "background 0.15s ease",
                        }}
                      >
                        <span>Storefront</span>
                      </Link>

                      <Link
                        href={`/${org.slug}/book`}
                        style={{
                          flex: 1,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          padding: "9px 12px",
                          borderRadius: "8px",
                          backgroundColor: "#0284c7",
                          color: "#fff",
                          fontSize: "13px",
                          fontWeight: 800,
                          textDecoration: "none",
                          boxShadow: "0 2px 10px rgba(2, 132, 199, 0.35)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <Calendar size={13} />
                        <span>Book</span>
                      </Link>

                      {canJoin && !isJoined && (
                        <button
                          disabled={busyId === org.id}
                          onClick={() => join(org)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "9px 12px",
                            borderRadius: "8px",
                            backgroundColor: "rgba(56, 189, 248, 0.12)",
                            border: "1px solid rgba(56, 189, 248, 0.3)",
                            color: "#38bdf8",
                            fontSize: "12.5px",
                            fontWeight: 800,
                            cursor: busyId === org.id ? "not-allowed" : "pointer",
                            transition: "all 0.15s ease",
                          }}
                          title="Join this organization to save it to your customer command center"
                        >
                          <span>{busyId === org.id ? "…" : "Join"}</span>
                        </button>
                      )}
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          ) : (
            <GlassCard
              variant="panel"
              style={{
                padding: "60px 24px",
                textAlign: "center",
                border: "1px dashed rgba(255, 255, 255, 0.12)",
              }}
            >
              <Compass size={48} color="#64748b" style={{ margin: "0 auto 16px" }} />
              <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#f8fafc", margin: "0 0 8px" }}>
                No organizations match these filters
              </h3>
              <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "400px", margin: "0 auto 20px" }}>
                Try searching for a different term or clearing your industry and country filters.
              </p>
              <button
                onClick={() => {
                  setSearch("");
                  setIndustry("");
                  setCountry("");
                  setSort("name");
                  setPage(1);
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: "#f8fafc",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Clear Filters
              </button>
            </GlassCard>
          )}

          {/* Pagination */}
          {data.pages > 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                paddingTop: "24px",
              }}
            >
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
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
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                  opacity: page <= 1 ? 0.5 : 1,
                }}
              >
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>

              <span style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 600 }}>
                Page <strong style={{ color: "#f8fafc" }}>{data.page}</strong> of {data.pages}
              </span>

              <button
                disabled={page >= data.pages}
                onClick={() => setPage((p) => Math.min(p + 1, data.pages))}
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
                  cursor: page >= data.pages ? "not-allowed" : "pointer",
                  opacity: page >= data.pages ? 0.5 : 1,
                }}
              >
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </CustomerPortalShell>
  );
}

function isCustomer(user: any) {
  return user?.actorType === ActorType.CUSTOMER;
}
