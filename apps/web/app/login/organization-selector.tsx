"use client";

import React from "react";
import { Calendar } from "lucide-react";
import { Building, ArrowRight, UserCheck } from "../../components/icons";
import { GlassCard, GlassBadge } from "../../components/glass-card";

export interface OrganizationOption {
  id: string;
  name: string;
  slug: string;
  brandName?: string;
  logoUrl?: string;
  roleCode?: string;
  lastBookingAt?: string;
  totalAppointments?: number;
}

interface OrganizationSelectorProps {
  title: string;
  subtitle: string;
  organizations: OrganizationOption[];
  isCustomer?: boolean;
  onSelect: (organizationId: string, slug: string) => Promise<void>;
  loadingOrgId: string | null;
}

export function OrganizationSelector({
  title,
  subtitle,
  organizations,
  isCustomer = false,
  onSelect,
  loadingOrgId,
}: OrganizationSelectorProps) {
  const [showAll, setShowAll] = React.useState(false);
  const INITIAL_LIMIT = 4;
  const visibleOrgs =
    showAll || organizations.length <= INITIAL_LIMIT
      ? organizations
      : organizations.slice(0, INITIAL_LIMIT);

  return (
    <div style={{ width: "100%", maxWidth: "560px", margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: "28px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#f8fafc", marginBottom: "8px" }}>
          {title}
        </h2>
        <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>{subtitle}</p>
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        {visibleOrgs.map((org) => {
          const isLoading = loadingOrgId === org.id;
          const displayName = org.brandName || org.name;

          return (
            <GlassCard
              key={org.id}
              variant="card"
              glow="subtle"
              interactive
              onClick={() => !isLoading && onSelect(org.id, org.slug)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                cursor: isLoading ? "wait" : "pointer",
                transition: "transform 0.15s ease, border-color 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "10px",
                    backgroundColor: "rgba(2, 132, 199, 0.15)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    display: "grid",
                    placeItems: "center",
                    color: "#38bdf8",
                    fontWeight: 800,
                    fontSize: "17px",
                    flexShrink: 0,
                  }}
                >
                  {org.logoUrl ? (
                    <img
                      src={org.logoUrl}
                      alt={displayName}
                      style={{ width: "100%", height: "100%", borderRadius: "10px", objectFit: "cover" }}
                    />
                  ) : (
                    displayName.charAt(0).toUpperCase()
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <strong
                      style={{
                        color: "#f8fafc",
                        fontSize: "15.5px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "260px",
                      }}
                      title={displayName}
                    >
                      {displayName}
                    </strong>
                    {org.roleCode && (
                      <GlassBadge variant="info" size="sm">
                        {org.roleCode.toLowerCase()}
                      </GlassBadge>
                    )}
                  </div>
                  <span style={{ color: "#64748b", fontSize: "12px", display: "block", marginTop: "2px" }}>
                    bookpro.app/{org.slug}
                  </span>

                  {isCustomer && org.totalAppointments !== undefined && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        color: "#94a3b8",
                        fontSize: "12px",
                        marginTop: "4px",
                      }}
                    >
                      <Calendar size={12} color="#38bdf8" />
                      <span>{org.totalAppointments} appointment{org.totalAppointments === 1 ? "" : "s"}</span>
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(56, 189, 248, 0.1)",
                  color: "#38bdf8",
                  flexShrink: 0,
                }}
              >
                {isLoading ? (
                  <span style={{ fontSize: "12px" }}>…</span>
                ) : (
                  <ArrowRight size={17} />
                )}
              </div>
            </GlassCard>
          );
        })}

        {organizations.length > INITIAL_LIMIT && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              backgroundColor: "rgba(15, 23, 42, 0.7)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#38bdf8",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              marginTop: "4px",
              transition: "all 0.15s ease",
            }}
          >
            <span>
              {showAll
                ? "Show fewer workspaces"
                : `Showing ${INITIAL_LIMIT} of ${organizations.length} workspaces · Show all`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
