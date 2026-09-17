import { PermissionKey, RoleCode } from "@bookpro/contracts";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  ContactRound,
  Gauge,
  BriefcaseBusiness,
  LayoutDashboard,
  Plug,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Settings,
} from "lucide-react";
import type { UserSession } from "../../lib/auth-context";

export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  permissions?: PermissionKey[];
  roles?: RoleCode[];
  platformOnly?: boolean;
};

export type NavigationGroup = { label?: string; items: NavigationItem[] };

export const businessNavigation: NavigationGroup[] = [
  { items: [{ id: "overview", label: "Overview", href: "/app", icon: LayoutDashboard }] },
  {
    label: "Work",
    items: [
      { id: "calendar", label: "Calendar", href: "/app/calendar", icon: CalendarDays, permissions: [PermissionKey.APPOINTMENT_READ] },
      { id: "customers", label: "Customers", href: "/app/customers", icon: ContactRound, permissions: [PermissionKey.CUSTOMER_READ] },
      { id: "customer-invites", label: "Invite customers", href: "/app/customers/invite", icon: UsersRound, permissions: [PermissionKey.CUSTOMER_MANAGE] },
      { id: "marketing", label: "Customer email", href: "/app/marketing", icon: ContactRound, permissions: [PermissionKey.CUSTOMER_MANAGE] },
      { id: "waitlist", label: "Waitlist", href: "/app/waitlist", icon: Clock3, permissions: [PermissionKey.APPOINTMENT_READ] },
    ],
  },
  {
    label: "Business",
    items: [
      { id: "services", label: "Services", href: "/app/services", icon: BriefcaseBusiness, permissions: [PermissionKey.SERVICE_READ] },
      { id: "staff", label: "Staff", href: "/app/staff", icon: UsersRound, permissions: [PermissionKey.STAFF_READ] },
      { id: "locations", label: "Locations", href: "/app/locations", icon: Building2, permissions: [PermissionKey.LOCATION_READ] },
    ],
  },
  {
    label: "Finance & Insights",
    items: [
      { id: "payments", label: "Payments", href: "/app/commissions", icon: CircleDollarSign, permissions: [PermissionKey.PAYMENT_READ] },
      { id: "analytics", label: "Analytics", href: "/app/analytics", icon: BarChart3, permissions: [PermissionKey.ANALYTICS_READ] },
      { id: "optimizer", label: "Schedule Optimizer", href: "/app/optimizer", icon: Sparkles, permissions: [PermissionKey.OPTIMIZER_READ] },
    ],
  },
  {
    label: "Automation",
    items: [
      { id: "ai", label: "AI Operations", href: "/app/ai", icon: Bot, permissions: [PermissionKey.AI_EXECUTE] },
      { id: "integrations", label: "Integrations", href: "/app/integrations/google", icon: Plug, permissions: [PermissionKey.INTEGRATION_MANAGE] },
    ],
  },
  {
    label: "System",
    items: [
      { id: "settings", label: "Settings", href: "/app/settings", icon: Settings, permissions: [PermissionKey.ORG_UPDATE] },
      { id: "audit", label: "Audit log", href: "/app/settings/audit", icon: ShieldCheck, permissions: [PermissionKey.AUDIT_READ] },
    ],
  },
];

export const staffNavigation: NavigationGroup[] = [
  {
    items: [
      { id: "today", label: "Today", href: "/workspace", icon: Gauge },
      { id: "calendar", label: "My calendar", href: "/workspace/calendar", icon: CalendarDays, permissions: [PermissionKey.APPOINTMENT_READ] },
    ],
  },
];

export const platformNavigation: NavigationGroup[] = [
  {
    items: [
      { id: "platform", label: "Platform overview", href: "/platform", icon: Building2, platformOnly: true },
    ],
  },
];

export function visibleNavigation(groups: NavigationGroup[], user: UserSession): NavigationGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.platformOnly && !user.isPlatformAdmin) return false;
        if (item.roles && (!user.roleCode || !item.roles.includes(user.roleCode))) return false;
        return !item.permissions || item.permissions.every((permission) => user.permissions.includes(permission));
      }),
    }))
    .filter((group) => group.items.length > 0);
}
