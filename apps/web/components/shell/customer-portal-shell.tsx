"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { ActorType } from "@bookpro/contracts";
import {
  Calendar,
  Clock,
  Bot,
  User,
  Building2,
  Compass,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Menu,
  LogOut,
  X,
} from "../icons";
import { PulsingDot } from "../animated-svgs";

export interface TenantContextInfo {
  id: string;
  name: string;
  brandName?: string | null;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

interface CustomerPortalShellProps {
  children: React.ReactNode;
  tenantInfo?: TenantContextInfo | null;
  pageTitle?: string;
  tenantSlug?: string;
  organizationName?: string;
  activeNav?: string;
}

export function CustomerPortalShell({
  children,
  tenantInfo,
  pageTitle,
  tenantSlug,
  organizationName,
  activeNav,
}: CustomerPortalShellProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);

  const isCustomer = user?.actorType === ActorType.CUSTOMER;
  const displayName = tenantInfo?.brandName || tenantInfo?.name || organizationName;
  const accentColor = tenantInfo?.primaryColor || "#0284c7";
  const slug = tenantInfo?.slug || tenantSlug;

  const tenantNavLinks = slug
    ? [
        { label: "Overview", href: `/${slug}`, exact: true, icon: Building2 },
        { label: "Book Service", href: `/${slug}/book`, exact: false, icon: Calendar },
        { label: "Priority Waitlist", href: `/${slug}/waitlist`, exact: false, icon: Clock },
        { label: "AI Receptionist", href: `/${slug}/ai`, exact: false, icon: Bot, badge: "24/7" },
        {
          label: "My Appointments",
          href: `/${slug}/account`,
          exact: false,
          icon: Clock,
          requiresCustomer: true,
        },
      ]
    : [];

  const isLinkActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--bp-bg-canvas, #070b12)",
        color: "var(--bp-text-primary, #f8fafc)",
        position: "relative",
      }}
    >
      {/* Top Sticky Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          backgroundColor: "rgba(10, 15, 26, 0.88)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "0 24px",
            height: "70px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          {/* Brand Logo & Title */}
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            {tenantInfo ? (
              <Link
                href={`/${slug}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  textDecoration: "none",
                  color: "#f8fafc",
                }}
              >
                {tenantInfo.logoUrl ? (
                  <img
                    src={tenantInfo.logoUrl}
                    alt={displayName || "Business"}
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "10px",
                      objectFit: "cover",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                    }}
                  />
                ) : (
                  <span
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "10px",
                      backgroundColor: accentColor,
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 900,
                      color: "#fff",
                      fontSize: "18px",
                      boxShadow: `0 4px 14px ${accentColor}40`,
                    }}
                  >
                    {(displayName || "B").charAt(0).toUpperCase()}
                  </span>
                )}
                <div>
                  <strong
                    style={{
                      fontSize: "17px",
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                      display: "block",
                    }}
                  >
                    {displayName}
                  </strong>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#94a3b8",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <PulsingDot color={accentColor} size={4} />
                    Verified Storefront
                  </span>
                </div>
              </Link>
            ) : (
              <Link
                href="/organizations"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  textDecoration: "none",
                  color: "#f8fafc",
                }}
              >
                <span
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "linear-gradient(135deg, #0284c7, #7c3aed)",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 900,
                    color: "#fff",
                    fontSize: "18px",
                    boxShadow: "0 4px 14px rgba(2, 132, 199, 0.35)",
                  }}
                >
                  B
                </span>
                <div>
                  <strong style={{ fontSize: "17px", fontWeight: 800, letterSpacing: "-0.02em" }}>
                    BookPro
                  </strong>
                  <span style={{ fontSize: "11px", color: "#94a3b8", display: "block" }}>
                    Customer Network
                  </span>
                </div>
              </Link>
            )}
          </div>

          {/* Desktop Navigation Links */}
          <nav
            style={{
              display: "none",
              alignItems: "center",
              gap: "6px",
            }}
            className="desktop-nav"
          >
            {tenantInfo ? (
              tenantNavLinks.map((link) => {
                if (link.requiresCustomer && !isCustomer) return null;
                const active = isLinkActive(link.href, link.exact);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "7px",
                      padding: "8px 14px",
                      borderRadius: "8px",
                      textDecoration: "none",
                      fontSize: "13.5px",
                      fontWeight: active ? 750 : 600,
                      color: active ? "#f8fafc" : "#94a3b8",
                      backgroundColor: active ? "rgba(255, 255, 255, 0.08)" : "transparent",
                      border: active ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid transparent",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Icon size={16} color={active ? accentColor : "#64748b"} />
                    <span>{link.label}</span>
                    {link.badge && (
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 800,
                          padding: "2px 6px",
                          borderRadius: "9999px",
                          backgroundColor: `${accentColor}25`,
                          color: accentColor,
                          border: `1px solid ${accentColor}40`,
                        }}
                      >
                        {link.badge}
                      </span>
                    )}
                  </Link>
                );
              })
            ) : (
              <>
                <Link
                  href="/organizations"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    padding: "8px 14px",
                    borderRadius: "8px",
                    textDecoration: "none",
                    fontSize: "13.5px",
                    fontWeight: pathname === "/organizations" ? 750 : 600,
                    color: pathname === "/organizations" ? "#f8fafc" : "#94a3b8",
                    backgroundColor: pathname === "/organizations" ? "rgba(255, 255, 255, 0.08)" : "transparent",
                    border: pathname === "/organizations" ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid transparent",
                  }}
                >
                  <Compass size={16} color="#38bdf8" />
                  <span>Browse Directory</span>
                </Link>
                {isCustomer && (
                  <Link
                    href="/customer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "7px",
                      padding: "8px 14px",
                      borderRadius: "8px",
                      textDecoration: "none",
                      fontSize: "13.5px",
                      fontWeight: pathname === "/customer" ? 750 : 600,
                      color: pathname === "/customer" ? "#f8fafc" : "#94a3b8",
                      backgroundColor: pathname === "/customer" ? "rgba(255, 255, 255, 0.08)" : "transparent",
                      border: pathname === "/customer" ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid transparent",
                    }}
                  >
                    <Building2 size={16} color="#38bdf8" />
                    <span>My Organizations</span>
                  </Link>
                )}
              </>
            )}
          </nav>

          {/* Right Action Area: User Account & Global Directory Link */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {tenantInfo && (
              <Link
                href="/organizations"
                style={{
                  display: "none",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "#94a3b8",
                  textDecoration: "none",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                }}
                className="desktop-dir-link"
              >
                <Compass size={14} />
                <span>All Businesses</span>
              </Link>
            )}

            {user ? (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(15, 23, 42, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#f8fafc",
                    fontSize: "13px",
                    fontWeight: 700,
                  }}
                >
                  <span
                    style={{
                      width: "26px",
                      height: "26px",
                      borderRadius: "50%",
                      backgroundColor: "rgba(2, 132, 199, 0.3)",
                      border: "1px solid #38bdf8",
                      display: "grid",
                      placeItems: "center",
                      color: "#38bdf8",
                      fontSize: "12px",
                      fontWeight: 900,
                    }}
                  >
                    {user.fullName ? user.fullName.charAt(0).toUpperCase() : "U"}
                  </span>
                  <span
                    style={{
                      maxWidth: "110px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {user.fullName || "Account"}
                  </span>
                  <ChevronDown size={14} color="#94a3b8" />
                </button>

                {accountDropdownOpen && (
                  <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 45 }}
                      onClick={() => setAccountDropdownOpen(false)}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 8px)",
                        right: 0,
                        width: "240px",
                        backgroundColor: "#0d1522",
                        border: "1px solid rgba(255, 255, 255, 0.14)",
                        borderRadius: "12px",
                        padding: "10px",
                        boxShadow: "0 20px 48px rgba(0, 0, 0, 0.6)",
                        zIndex: 50,
                      }}
                    >
                      <div
                        style={{
                          padding: "8px 10px 12px",
                          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                          marginBottom: "6px",
                        }}
                      >
                        <strong
                          style={{
                            display: "block",
                            fontSize: "13.5px",
                            color: "#f8fafc",
                            fontWeight: 800,
                          }}
                        >
                          {user.fullName}
                        </strong>
                        <span
                          style={{
                            display: "block",
                            fontSize: "12px",
                            color: "#94a3b8",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {user.email}
                        </span>
                        <span
                          style={{
                            display: "inline-block",
                            marginTop: "6px",
                            fontSize: "10.5px",
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: "9999px",
                            backgroundColor: "rgba(56, 189, 248, 0.15)",
                            color: "#38bdf8",
                            border: "1px solid rgba(56, 189, 248, 0.3)",
                          }}
                        >
                          CUSTOMER ACCOUNT
                        </span>
                      </div>

                      {slug && (
                        <Link
                          href={`/${slug}/account`}
                          onClick={() => setAccountDropdownOpen(false)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "8px 10px",
                            borderRadius: "8px",
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "#cbd5e1",
                            textDecoration: "none",
                          }}
                        >
                          <Clock size={15} color="#38bdf8" />
                          <span>Appointments at {displayName}</span>
                        </Link>
                      )}

                      <Link
                        href="/customer"
                        onClick={() => setAccountDropdownOpen(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#cbd5e1",
                          textDecoration: "none",
                        }}
                      >
                        <Building2 size={15} color="#38bdf8" />
                        <span>All Joined Businesses</span>
                      </Link>

                      <Link
                        href="/organizations"
                        onClick={() => setAccountDropdownOpen(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#cbd5e1",
                          textDecoration: "none",
                        }}
                      >
                        <Compass size={15} color="#38bdf8" />
                        <span>Find Organizations</span>
                      </Link>

                      <div
                        style={{
                          height: "1px",
                          backgroundColor: "rgba(255, 255, 255, 0.08)",
                          margin: "6px 0",
                        }}
                      />

                      <button
                        onClick={() => {
                          setAccountDropdownOpen(false);
                          logout();
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#fca5a5",
                          backgroundColor: "transparent",
                          border: "none",
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <LogOut size={15} color="#fca5a5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Link
                  href={`/login?returnTo=${encodeURIComponent(pathname)}`}
                  style={{
                    padding: "7px 14px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#f8fafc",
                    fontSize: "13px",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  Sign In
                </Link>
                <Link
                  href="/register/customer"
                  style={{
                    padding: "7px 14px",
                    borderRadius: "8px",
                    backgroundColor: accentColor,
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 800,
                    textDecoration: "none",
                    boxShadow: `0 2px 10px ${accentColor}40`,
                  }}
                >
                  Create Account
                </Link>
              </div>
            )}

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{
                display: "grid",
                placeItems: "center",
                width: "38px",
                height: "38px",
                borderRadius: "8px",
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#f8fafc",
              }}
              className="mobile-menu-btn"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Navigation */}
        {mobileMenuOpen && (
          <div
            style={{
              padding: "16px 24px 24px",
              backgroundColor: "#0a0f1a",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              display: "grid",
              gap: "8px",
            }}
          >
            {tenantInfo ? (
              tenantNavLinks.map((link) => {
                if (link.requiresCustomer && !isCustomer) return null;
                const active = isLinkActive(link.href, link.exact);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      borderRadius: "10px",
                      backgroundColor: active ? `${accentColor}20` : "rgba(255, 255, 255, 0.04)",
                      border: active ? `1px solid ${accentColor}50` : "1px solid rgba(255, 255, 255, 0.06)",
                      color: active ? "#f8fafc" : "#94a3b8",
                      textDecoration: "none",
                      fontSize: "14px",
                      fontWeight: 700,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Icon size={18} color={active ? accentColor : "#94a3b8"} />
                      <span>{link.label}</span>
                    </div>
                    {link.badge && (
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 800,
                          padding: "2px 8px",
                          borderRadius: "9999px",
                          backgroundColor: `${accentColor}30`,
                          color: accentColor,
                        }}
                      >
                        {link.badge}
                      </span>
                    )}
                  </Link>
                );
              })
            ) : (
              <>
                <Link
                  href="/organizations"
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "12px 16px",
                    borderRadius: "10px",
                    backgroundColor: pathname === "/organizations" ? "rgba(56, 189, 248, 0.15)" : "rgba(255, 255, 255, 0.04)",
                    color: "#f8fafc",
                    textDecoration: "none",
                    fontSize: "14px",
                    fontWeight: 700,
                  }}
                >
                  <Compass size={18} color="#38bdf8" />
                  <span>Browse Directory</span>
                </Link>
                {isCustomer && (
                  <Link
                    href="/customer"
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "12px 16px",
                      borderRadius: "10px",
                      backgroundColor: pathname === "/customer" ? "rgba(56, 189, 248, 0.15)" : "rgba(255, 255, 255, 0.04)",
                      color: "#f8fafc",
                      textDecoration: "none",
                      fontSize: "14px",
                      fontWeight: 700,
                    }}
                  >
                    <Building2 size={18} color="#38bdf8" />
                    <span>My Organizations</span>
                  </Link>
                )}
              </>
            )}

            <div
              style={{
                height: "1px",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                margin: "8px 0",
              }}
            />

            <Link
              href="/organizations"
              onClick={() => setMobileMenuOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 16px",
                color: "#94a3b8",
                fontSize: "13px",
                textDecoration: "none",
              }}
            >
              <Compass size={16} />
              <span>Explore All Verified Businesses</span>
            </Link>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <div style={{ flex: 1, position: "relative" }}>{children}</div>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          backgroundColor: "rgba(7, 11, 18, 0.95)",
          padding: "36px 24px 44px",
          marginTop: "auto",
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #0284c7, #7c3aed)",
                display: "grid",
                placeItems: "center",
                fontWeight: 900,
                color: "#fff",
                fontSize: "14px",
              }}
            >
              B
            </span>
            <div>
              <strong style={{ fontSize: "14px", color: "#f8fafc" }}>
                {tenantInfo ? displayName : "BookPro Scheduling Engine"}
              </strong>
              <span style={{ fontSize: "12px", color: "#64748b", display: "block" }}>
                {tenantInfo ? `Powered by BookPro • Instant Confirmation` : "Enterprise Customer Portal"}
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              fontSize: "12.5px",
              color: "#94a3b8",
            }}
          >
            <Link href="/organizations" style={{ color: "#94a3b8", textDecoration: "none" }}>
              Directory
            </Link>
            <span>•</span>
            <Link href="/register" style={{ color: "#94a3b8", textDecoration: "none" }}>
              For Businesses
            </Link>
            <span>•</span>
            <span style={{ color: "#64748b" }}>© {new Date().getFullYear()} BookPro</span>
          </div>
        </div>
      </footer>

      {/* Global Responsive Nav CSS */}
      <style jsx global>{`
        @media (min-width: 768px) {
          .desktop-nav {
            display: flex !important;
          }
          .desktop-dir-link {
            display: inline-flex !important;
          }
          .mobile-menu-btn {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
