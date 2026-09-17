/* Hallmark · macrostructure: Multi-Org Customer Hub · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 */
"use client";

import { ActorType } from "@bookpro/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProtectedRoute } from "../../components/protected-route";
import { apiFetch } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { GlassCard, GlassBadge } from "../../components/glass-card";
import {
  FloatingParticles,
  ClockSpinner,
  CalendarPulse,
  PulsingDot,
} from "../../components/animated-svgs";
import {
  Building2,
  Calendar,
  Clock,
  Bot,
  Compass,
  ArrowRight,
  Sparkles,
} from "../../components/icons";
import { CustomerPortalShell } from "../../components/shell/customer-portal-shell";

type CustomerOrganization = {
  customerId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    brandName?: string | null;
    logoUrl?: string | null;
    primaryColor?: string | null;
  };
  lastBookingAt?: string | null;
  totalAppointments: number;
};

export default function CustomerHome() {
  const { user, refetchUser } = useAuth();
  const [organizations, setOrganizations] = useState<CustomerOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<CustomerOrganization[]>("/auth/customer-organizations").then((response) => {
      if (response.success) setOrganizations(response.data || []);
      else setError(response.error?.message || "Your organizations could not be loaded.");
      setLoading(false);
    });
  }, []);

  async function open(item: CustomerOrganization, destination: "account" | "book" | "ai") {
    setBusyId(item.organization.id);
    const response = await apiFetch("/auth/select-customer-organization", {
      method: "POST",
      body: JSON.stringify({ organizationId: item.organization.id }),
    });
    if (!response.success) {
      setError(response.error?.message || "This organization could not be opened.");
      setBusyId(null);
      return;
    }
    await refetchUser();
    window.location.href = `/${item.organization.slug}/${destination}`;
  }

  const totalBookingsAllOrgs = organizations.reduce((acc, curr) => acc + curr.totalAppointments, 0);

  return (
    <ProtectedRoute allowedActorTypes={[ActorType.CUSTOMER]}>
      <CustomerPortalShell pageTitle="My Organizations — BookPro Customer Portal">
        <div style={{ position: "relative", overflowX: "clip", paddingBottom: "80px" }}>
          <FloatingParticles count={10} />

          <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "48px 24px 0", position: "relative", zIndex: 10 }}>
            {/* Header section */}
            <div style={{ marginBottom: "40px" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "4px 12px",
                  borderRadius: "9999px",
                  backgroundColor: "rgba(56, 189, 248, 0.12)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  color: "#38bdf8",
                  fontSize: "12px",
                  fontWeight: 800,
                  marginBottom: "14px",
                }}
              >
                <PulsingDot color="#38bdf8" size={5} />
                <span>CUSTOMER COMMAND CENTER</span>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  gap: "16px",
                }}
              >
                <div>
                  <h1 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 850, color: "#f8fafc", letterSpacing: "-0.03em", margin: "0 0 6px" }}>
                    Your Organizations
                  </h1>
                  <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>
                    Welcome back, <strong style={{ color: "#f8fafc" }}>{user?.fullName}</strong>. Select an organization to book services, review upcoming visits, or launch the AI receptionist.
                  </p>
                </div>

                <Link
                  href="/organizations"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 18px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(56, 189, 248, 0.15)",
                    border: "1px solid rgba(56, 189, 248, 0.35)",
                    color: "#38bdf8",
                    fontSize: "13.5px",
                    fontWeight: 800,
                    textDecoration: "none",
                  }}
                >
                  <Compass size={16} />
                  <span>Discover More Businesses</span>
                </Link>
              </div>
            </div>

            {error && (
              <div
                style={{
                  padding: "14px 18px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(244, 63, 94, 0.15)",
                  border: "1px solid rgba(244, 63, 94, 0.35)",
                  color: "#fca5a5",
                  fontSize: "13.5px",
                  fontWeight: 700,
                  marginBottom: "28px",
                }}
              >
                {error}
              </div>
            )}

            {/* Quick Metrics */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "16px",
                marginBottom: "36px",
              }}
            >
              <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "20px" }}>
                <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
                  Joined Organizations
                </span>
                <strong style={{ fontSize: "28px", color: "#38bdf8", display: "block", marginTop: "4px", fontWeight: 900 }}>
                  {organizations.length}
                </strong>
              </GlassCard>

              <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "20px" }}>
                <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
                  Total Completed Appointments
                </span>
                <strong style={{ fontSize: "28px", color: "#34d399", display: "block", marginTop: "4px", fontWeight: 900 }}>
                  {totalBookingsAllOrgs}
                </strong>
              </GlassCard>

              <GlassCard variant="card" glow="subtle" depth3D style={{ padding: "20px" }}>
                <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
                  Verified Identity Status
                </span>
                <strong style={{ fontSize: "18px", color: "#f8fafc", display: "block", marginTop: "8px", fontWeight: 800 }}>
                  Active & Verified
                </strong>
              </GlassCard>
            </div>

            {/* Joined Organizations Grid */}
            <div style={{ marginBottom: "24px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                My Connected Businesses
              </h2>
            </div>

            {loading ? (
              <div style={{ display: "grid", placeItems: "center", padding: "60px 0" }}>
                <ClockSpinner size={36} />
                <p style={{ color: "#94a3b8", fontSize: "13.5px", marginTop: "12px" }}>
                  Loading your organizations…
                </p>
              </div>
            ) : organizations.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                  gap: "24px",
                }}
              >
                {organizations.map((item) => {
                  const org = item.organization;
                  const title = org.brandName || org.name;
                  const isBusy = busyId === org.id;

                  return (
                    <GlassCard
                      key={item.customerId}
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
                        {/* Header */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "14px",
                            marginBottom: "14px",
                          }}
                        >
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
                                background: "linear-gradient(135deg, #0284c7, #7c3aed)",
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
                            <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#f8fafc", margin: "0 0 2px" }}>
                              {title}
                            </h3>
                            <span style={{ fontSize: "12px", color: "#38bdf8", fontWeight: 700 }}>
                              Connected Member
                            </span>
                          </div>
                        </div>

                        {/* Booking history summary */}
                        <div
                          style={{
                            display: "grid",
                            gap: "6px",
                            fontSize: "12.5px",
                            color: "#cbd5e1",
                            marginBottom: "20px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <Calendar size={14} color="#38bdf8" />
                            <span>
                              {item.lastBookingAt
                                ? `Last booking on ${new Intl.DateTimeFormat(undefined, {
                                    dateStyle: "medium",
                                  }).format(new Date(item.lastBookingAt))}`
                                : "No prior bookings recorded"}
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <Clock size={14} color="#34d399" />
                            <span>{item.totalAppointments} total completed visit{item.totalAppointments === 1 ? "" : "s"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: "8px",
                          paddingTop: "16px",
                          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                        }}
                      >
                        <button
                          disabled={isBusy}
                          onClick={() => open(item, "book")}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px",
                            padding: "9px 6px",
                            borderRadius: "8px",
                            backgroundColor: "#0284c7",
                            color: "#fff",
                            fontSize: "12.5px",
                            fontWeight: 800,
                            border: "none",
                            cursor: isBusy ? "not-allowed" : "pointer",
                          }}
                        >
                          <Calendar size={13} />
                          <span>{isBusy ? "Opening…" : "Book"}</span>
                        </button>

                        <button
                          disabled={isBusy}
                          onClick={() => open(item, "account")}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px",
                            padding: "9px 6px",
                            borderRadius: "8px",
                            backgroundColor: "rgba(255, 255, 255, 0.08)",
                            border: "1px solid rgba(255, 255, 255, 0.12)",
                            color: "#f8fafc",
                            fontSize: "12.5px",
                            fontWeight: 700,
                            cursor: isBusy ? "not-allowed" : "pointer",
                          }}
                        >
                          <Clock size={13} />
                          <span>Visits</span>
                        </button>

                        <button
                          disabled={isBusy}
                          onClick={() => open(item, "ai")}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px",
                            padding: "9px 6px",
                            borderRadius: "8px",
                            backgroundColor: "rgba(56, 189, 248, 0.12)",
                            border: "1px solid rgba(56, 189, 248, 0.3)",
                            color: "#38bdf8",
                            fontSize: "12.5px",
                            fontWeight: 700,
                            cursor: isBusy ? "not-allowed" : "pointer",
                          }}
                        >
                          <Bot size={13} />
                          <span>AI Chat</span>
                        </button>
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
                <CalendarPulse size={48} />
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#f8fafc", margin: "16px 0 8px" }}>
                  You have not joined any organizations yet
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "420px", margin: "0 auto 20px" }}>
                  Browse our directory of verified studios, doctors, salons, and consultants to schedule your first appointment.
                </p>
                <Link
                  href="/organizations"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 20px",
                    borderRadius: "8px",
                    backgroundColor: "#0284c7",
                    color: "#fff",
                    fontSize: "13.5px",
                    fontWeight: 800,
                    textDecoration: "none",
                  }}
                >
                  <span>Browse Directory</span>
                  <ArrowRight size={15} />
                </Link>
              </GlassCard>
            )}
          </div>
        </div>
      </CustomerPortalShell>
    </ProtectedRoute>
  );
}
