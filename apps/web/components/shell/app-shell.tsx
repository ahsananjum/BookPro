"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  X,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  Calendar,
  ContactRound,
  BriefcaseBusiness,
  UsersRound,
  Sparkles,
} from "lucide-react";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../lib/auth-context";
import { apiFetch } from "../../lib/api-client";
import { NavigationGroup, visibleNavigation } from "./navigation";
import { OrgSwitcher } from "./org-switcher";

type MembershipOption = {
  id: string;
  roleCode: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    onboardingCompleted: boolean;
    logoUrl?: string | null;
  };
};

const ROUTE_LABELS: Record<string, string> = {
  "/app": "Overview",
  "/app/calendar": "Calendar",
  "/app/customers": "Customers",
  "/app/customers/invite": "Invite Customers",
  "/app/marketing": "Customer Email",
  "/app/waitlist": "Waitlist Operations",
  "/app/services": "Services",
  "/app/staff": "Staff Roster",
  "/app/locations": "Locations",
  "/app/commissions": "Payments & Splits",
  "/app/analytics": "Analytics",
  "/app/optimizer": "Schedule Optimizer",
  "/app/ai": "AI Operations",
  "/app/integrations/google": "Google Calendar Sync",
  "/app/settings": "Settings",
  "/app/settings/audit": "Audit Log",
  "/workspace": "Today",
  "/workspace/calendar": "My Calendar",
  "/platform": "Platform Administration",
  "/settings/security": "Security & Devices",
};

function getPageLabel(pathname: string): string {
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname];
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 1) return "Overview";
  return parts
    .slice(1)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, " "))
    .join(" / ");
}

export function AppShell({
  children,
  navigation,
  productLabel,
}: {
  children: React.ReactNode;
  navigation: NavigationGroup[];
  productLabel: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);

  const newMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(
    () => (user ? visibleNavigation(navigation, user) : []),
    [navigation, user]
  );

  useEffect(() => {
    // Read persisted collapsed preference
    try {
      const saved = localStorage.getItem("bk_sidebar_collapsed");
      if (saved === "true") setCollapsed(true);
    } catch {}
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("bk_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
    setNewMenuOpen(false);
  }, [pathname]);

  // Outside click listener for menus
  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, []);

  // Keyboard navigation & Escape support
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setAccountOpen(false);
        setNewMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!user || user.actorType === "CUSTOMER" || user.isPlatformAdmin) return;
    apiFetch<MembershipOption[]>("/auth/memberships").then((response) => {
      if (response.success && response.data) setMemberships(response.data);
    });
  }, [user]);

  if (!user) return null;

  const userInitial = user.fullName ? user.fullName.charAt(0).toUpperCase() : "U";

  const renderNavGroup = (group: NavigationGroup, idx: number) => (
    <section className="shell-nav-group" key={group.label || idx}>
      {group.label && !collapsed && <h2>{group.label}</h2>}
      {group.items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/app" && pathname.startsWith(`${item.href}/`));
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            className={`shell-nav-link ${active ? "is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            style={{ position: "relative", zIndex: 1 }}
          >
            {active && (
              <motion.span
                layoutId="shell-active-indicator"
                className="shell-nav-active-pill"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "0.65rem",
                  background: "rgba(2, 132, 199, 0.16)",
                  border: "1px solid rgba(56, 189, 248, 0.35)",
                  boxShadow: "inset 3px 0 0 #38bdf8",
                  zIndex: -1,
                }}
              />
            )}
            <Icon size={18} aria-hidden="true" className="shell-nav-icon" style={{ position: "relative", zIndex: 2 }} />
            {!collapsed && <span style={{ position: "relative", zIndex: 2 }}>{item.label}</span>}
          </Link>
        );
      })}
    </section>
  );

  return (
    <div className={`product-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      {/* DESKTOP SIDEBAR */}
      <aside className={`shell-sidebar ${collapsed ? "is-collapsed" : ""}`}>
        <div className="shell-sidebar-top">
          <Link
            href={
              productLabel === "Business workspace"
                ? "/app"
                : productLabel === "Staff workspace"
                ? "/workspace"
                : "/platform"
            }
            className="shell-brand"
            title="BookPro Workspace"
          >
            <span className="shell-brand-mark" aria-hidden="true">
              B
            </span>
            {!collapsed && (
              <span className="shell-brand-text">
                <strong>BookPro</strong>
                <small>{productLabel}</small>
              </span>
            )}
          </Link>

          {/* Org Identity / Switcher */}
          <OrgSwitcher user={user} memberships={memberships} collapsed={collapsed} />
        </div>

        {/* Grouped Nav Items */}
        <nav className="shell-navigation" aria-label={`${productLabel} navigation`}>
          {groups.map(renderNavGroup)}
        </nav>

        {/* Pinned Bottom Area */}
        <div className="shell-sidebar-bottom">
          <button
            type="button"
            className="shell-collapse-btn"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            {!collapsed && <span>Collapse sidebar</span>}
          </button>

          {!collapsed && (
            <div className="shell-user-panel">
              <div className="shell-user-avatar" aria-hidden="true">
                {userInitial}
              </div>
              <div className="shell-user-info">
                <strong>{user.fullName || "User"}</strong>
                <small>{user.email}</small>
              </div>
              <button
                type="button"
                className="shell-user-logout"
                onClick={logout}
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* MOBILE DRAWER & SCRIM */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button
              type="button"
              className="shell-scrim"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.aside
              className="shell-mobile-drawer is-open"
              aria-hidden={!mobileOpen}
              role="dialog"
              aria-modal="true"
              aria-label="Mobile Navigation Drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
            >
              <div className="shell-mobile-drawer-header">
                <div className="shell-brand">
                  <span className="shell-brand-mark" aria-hidden="true">
                    B
                  </span>
                  <span className="shell-brand-text">
                    <strong>BookPro</strong>
                    <small>{productLabel}</small>
                  </span>
                </div>
                <button
                  type="button"
                  className="shell-icon-button shell-mobile-close"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: "0 0 12px 0" }}>
                <OrgSwitcher user={user} memberships={memberships} />
              </div>

              <nav className="shell-navigation" aria-label="Mobile navigation">
                {groups.map(renderNavGroup)}
              </nav>

              <div style={{ marginTop: "auto", paddingTop: "20px", borderTop: "1px solid #1e293b" }}>
                <div className="shell-user-panel">
                  <div className="shell-user-avatar">{userInitial}</div>
                  <div className="shell-user-info">
                    <strong>{user.fullName}</strong>
                    <small>{user.email}</small>
                  </div>
                  <button type="button" className="shell-user-logout" onClick={logout} title="Sign out">
                    <LogOut size={16} />
                  </button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* STAGE & MAIN AREA */}
      <div className="shell-stage">
        <header className="shell-topbar">
          <button
            type="button"
            className="shell-icon-button shell-menu-button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={21} />
          </button>

          <div className="shell-topbar-breadcrumb">
            <Link
              href={
                productLabel === "Business workspace"
                  ? "/app"
                  : productLabel === "Staff workspace"
                  ? "/workspace"
                  : "/platform"
              }
              className="shell-topbar-org"
              style={{ textDecoration: "none" }}
              title="Return to workspace home"
            >
              {user.organizationName || "Workspace"}
            </Link>
            <span className="shell-topbar-divider">/</span>
            <span className="shell-topbar-page">
              {getPageLabel(pathname)}
            </span>
          </div>

          <div className="shell-topbar-actions">
            {/* Global Quick Create Menu */}
            <div className="shell-create-dropdown" ref={newMenuRef}>
              <motion.button
                type="button"
                className="shell-create-btn"
                onClick={() => setNewMenuOpen((prev) => !prev)}
                aria-expanded={newMenuOpen}
                aria-haspopup="menu"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Plus size={16} />
                <span>New</span>
                <motion.div
                  animate={{ rotate: newMenuOpen ? 180 : 0 }}
                  transition={{ duration: 0.18 }}
                  style={{ display: "flex", alignItems: "center" }}
                >
                  <ChevronDown size={14} />
                </motion.div>
              </motion.button>

              <AnimatePresence>
                {newMenuOpen && (
                  <motion.div
                    className="shell-create-menu"
                    role="menu"
                    initial={{ opacity: 0, scale: 0.94, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: -6 }}
                    transition={{ type: "spring", damping: 24, stiffness: 350 }}
                    style={{ transformOrigin: "top right" }}
                  >
                    <Link
                      href="/app/calendar"
                      className="shell-create-item"
                      onClick={() => setNewMenuOpen(false)}
                    >
                      <Calendar size={16} color="#38bdf8" />
                      <div>
                        <strong>New appointment</strong>
                        <small>Book manual slot on schedule</small>
                      </div>
                    </Link>
                    <Link
                      href="/app/customers"
                      className="shell-create-item"
                      onClick={() => setNewMenuOpen(false)}
                    >
                      <ContactRound size={16} color="#f472b6" />
                      <div>
                        <strong>Add customer</strong>
                        <small>Register customer profile</small>
                      </div>
                    </Link>
                    <Link
                      href="/app/services"
                      className="shell-create-item"
                      onClick={() => setNewMenuOpen(false)}
                    >
                      <BriefcaseBusiness size={16} color="#34d399" />
                      <div>
                        <strong>Add service</strong>
                        <small>Create bookable offering</small>
                      </div>
                    </Link>
                    <Link
                      href="/app/staff"
                      className="shell-create-item"
                      onClick={() => setNewMenuOpen(false)}
                    >
                      <UsersRound size={16} color="#818cf8" />
                      <div>
                        <strong>Invite staff member</strong>
                        <small>Add practitioner to roster</small>
                      </div>
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Account dropdown */}
            <div className="shell-account" ref={accountMenuRef}>
              <motion.button
                type="button"
                className="shell-account-trigger"
                onClick={() => setAccountOpen((open) => !open)}
                aria-expanded={accountOpen}
                whileHover={{ borderColor: "rgba(56, 189, 248, 0.35)" }}
              >
                <span className="shell-avatar" aria-hidden="true">
                  {userInitial}
                </span>
                <span className="shell-account-copy">
                  <strong>{user.fullName}</strong>
                  <small>{user.email}</small>
                </span>
                <motion.div
                  animate={{ rotate: accountOpen ? 180 : 0 }}
                  transition={{ duration: 0.18 }}
                  style={{ display: "flex", alignItems: "center" }}
                >
                  <ChevronDown size={14} aria-hidden="true" />
                </motion.div>
              </motion.button>

              <AnimatePresence>
                {accountOpen && (
                  <motion.div
                    className="shell-account-menu"
                    initial={{ opacity: 0, scale: 0.94, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: -6 }}
                    transition={{ type: "spring", damping: 24, stiffness: 350 }}
                    style={{ transformOrigin: "top right" }}
                  >
                    <div className="shell-account-summary">
                      <strong>{user.fullName}</strong>
                      <small>{user.email}</small>
                      <span className="shell-account-role-badge">
                        {user.roleCode
                          ? user.roleCode.charAt(0).toUpperCase() + user.roleCode.slice(1).toLowerCase()
                          : "Staff"}
                      </span>
                    </div>
                    <div className="shell-dropdown-divider" />
                    <Link
                      href="/app/settings"
                      className="shell-account-menu-item"
                      onClick={() => setAccountOpen(false)}
                    >
                      <Settings size={15} />
                      <span>Business settings</span>
                    </Link>
                    <Link href="/settings/security" className="shell-account-menu-item" onClick={() => setAccountOpen(false)}>
                      <Settings size={15} />
                      <span>Security &amp; devices</span>
                    </Link>
                    <button type="button" className="shell-logout" onClick={logout}>
                      <LogOut size={15} />
                      <span>Sign out</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main id="main-content" className="shell-content">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
