"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Settings, Copy, ExternalLink, Building2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe } from "../icons";
import { useAuth, UserSession } from "../../lib/auth-context";

interface MembershipOption {
  id: string;
  roleCode: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    onboardingCompleted: boolean;
    logoUrl?: string | null;
  };
}

export function OrgSwitcher({
  user,
  memberships,
  collapsed = false,
}: {
  user: UserSession;
  memberships: MembershipOption[];
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showAllOrgs, setShowAllOrgs] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { selectOrganization } = useAuth();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const handleSelect = async (orgId: string) => {
    if (orgId === user.organizationId) {
      setOpen(false);
      return;
    }
    const success = await selectOrganization(orgId);
    if (success) {
      setOpen(false);
      router.replace("/app");
    }
  };

  const copyBookingUrl = () => {
    if (!user.organizationSlug) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://bookpro.app";
    const url = `${origin}/${user.organizationSlug}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const initial = user.organizationName ? user.organizationName.charAt(0).toUpperCase() : "B";
  const roleDisplay = user.roleCode
    ? user.roleCode.charAt(0).toUpperCase() + user.roleCode.slice(1).toLowerCase()
    : "Owner";

  if (collapsed) {
    return (
      <div className="shell-org-collapsed" title={`${user.organizationName || "Workspace"} (${roleDisplay})`}>
        <div className="shell-org-avatar">{initial}</div>
      </div>
    );
  }

  const visibleMemberships = showAllOrgs ? memberships : (memberships || []).slice(0, 4);
  const hasHiddenMemberships = (memberships || []).length > 4;

  return (
    <div className="shell-org-container" ref={dropdownRef}>
      <button
        type="button"
        className="shell-org-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div className="shell-org-avatar" aria-hidden="true">
          {initial}
        </div>
        <div className="shell-org-info">
          <span className="shell-org-name">{user.organizationName || "Workspace"}</span>
          <span className="shell-org-role">{roleDisplay}</span>
        </div>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          style={{ display: "flex", alignItems: "center" }}
        >
          <ChevronDown size={16} className="shell-org-chevron" aria-hidden="true" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="shell-org-dropdown"
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            style={{ transformOrigin: "top left" }}
          >
            <div className="shell-org-dropdown-header">
              <span className="shell-org-dropdown-label">Current Workspace</span>
              <strong className="shell-org-dropdown-title">{user.organizationName || "Workspace"}</strong>

              {/* Live Public Booking URL Quick Copy Pill */}
              {user.organizationSlug && (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(15, 23, 42, 0.92)",
                    border: "1px solid rgba(56, 189, 248, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: "6px" }}>
                    <Globe size={13} color="#38bdf8" style={{ flexShrink: 0 }} />
                    <span
                      style={{
                        fontSize: "11.5px",
                        color: "#94a3b8",
                        fontFamily: "var(--font-mono, monospace)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      /{user.organizationSlug}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <motion.button
                      type="button"
                      onClick={copyBookingUrl}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "3px 7px",
                        borderRadius: "5px",
                        backgroundColor: copiedLink ? "rgba(16, 185, 129, 0.2)" : "rgba(56, 189, 248, 0.12)",
                        border: copiedLink ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(56, 189, 248, 0.25)",
                        color: copiedLink ? "#34d399" : "#38bdf8",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                      title="Copy public booking link"
                    >
                      {copiedLink ? (
                        <>
                          <Check size={11} />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy</span>
                        </>
                      )}
                    </motion.button>
                    <a
                      href={`/${user.organizationSlug}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: "4px",
                        borderRadius: "5px",
                        color: "#94a3b8",
                        display: "grid",
                        placeItems: "center",
                        transition: "color 0.15s ease",
                      }}
                      title="Open public booking page in new tab"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="shell-org-dropdown-divider" />

            {memberships && memberships.length > 1 && (
              <>
                <div className="shell-org-dropdown-section">
                  <span className="shell-org-dropdown-label">Switch Workspace</span>
                  <div style={{ display: "grid", gap: "4px" }}>
                    {visibleMemberships.map((m) => {
                      const isCurrent = m.organization.id === user.organizationId;
                      const roleFormatted = m.roleCode
                        ? m.roleCode.charAt(0).toUpperCase() + m.roleCode.slice(1).toLowerCase()
                        : "Member";
                      return (
                        <motion.button
                          key={m.id}
                          type="button"
                          className={`shell-org-switch-item ${isCurrent ? "is-active" : ""}`}
                          onClick={() => handleSelect(m.organization.id)}
                          whileHover={{ x: 2 }}
                          transition={{ duration: 0.12 }}
                        >
                          <div className="shell-org-switch-avatar">
                            {m.organization.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="shell-org-switch-text">
                            <strong>{m.organization.name}</strong>
                            <small>{roleFormatted}</small>
                          </div>
                          {isCurrent && <Check size={16} className="shell-org-switch-check" />}
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Progressive Disclosure toggle for long membership lists */}
                  {hasHiddenMemberships && (
                    <motion.button
                      type="button"
                      onClick={() => setShowAllOrgs((prev) => !prev)}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        width: "100%",
                        padding: "7px 8px",
                        marginTop: "4px",
                        borderRadius: "6px",
                        backgroundColor: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        color: "#38bdf8",
                        fontSize: "11.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                        transition: "background 0.15s ease",
                      }}
                    >
                      <span>{showAllOrgs ? "Show fewer workspaces" : `Show all (${memberships.length}) workspaces`}</span>
                    </motion.button>
                  )}
                </div>
                <div className="shell-org-dropdown-divider" />
              </>
            )}

            <div className="shell-org-dropdown-actions">
              <Link
                href="/app/settings"
                className="shell-org-action-link"
                onClick={() => setOpen(false)}
              >
                <Settings size={15} />
                <span>Organization settings</span>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
