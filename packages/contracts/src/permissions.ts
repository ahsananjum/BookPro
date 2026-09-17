export enum ActorType {
    STAFF = "STAFF",
    CUSTOMER = "CUSTOMER",
    PLATFORM_ADMIN = "PLATFORM_ADMIN",
    PLATFORM_SUPPORT = "PLATFORM_SUPPORT",
    SYSTEM = "SYSTEM",
    WEBHOOK = "WEBHOOK",
    AI = "AI",
}

export enum RoleCode {
    OWNER = "OWNER",
    ADMIN = "ADMIN",
    MANAGER = "MANAGER",
    RECEPTIONIST = "RECEPTIONIST",
    STAFF = "STAFF",
}

export enum PermissionKey {
    // Organization
    ORG_READ = "org:read",
    ORG_UPDATE = "org:update",
    ORG_DELETE = "org:delete",

    // Location
    LOCATION_READ = "location:read",
    LOCATION_MANAGE = "location:manage",

    // Staff & Memberships
    STAFF_READ = "staff:read",
    STAFF_MANAGE = "staff:manage",
    STAFF_INVITE = "staff:invite",

    // Services & Resources
    SERVICE_READ = "service:read",
    SERVICE_MANAGE = "service:manage",
    RESOURCE_READ = "resource:read",
    RESOURCE_MANAGE = "resource:manage",

    // Appointments & Holds
    APPOINTMENT_READ = "appointment:read",
    APPOINTMENT_CREATE = "appointment:create",
    APPOINTMENT_MUTATE = "appointment:mutate",
    APPOINTMENT_CANCEL = "appointment:cancel",

    // Customers
    CUSTOMER_READ = "customer:read",
    CUSTOMER_MANAGE = "customer:manage",

    // Payments & Refunds
    PAYMENT_READ = "payment:read",
    PAYMENT_MANAGE = "payment:manage",
    FINANCIAL_ADMIN = "financial:admin",
    REFUND_MANAGE = "refund:manage",

    // Analytics & Reports
    ANALYTICS_READ = "analytics:read",
    ANALYTICS_MANAGE = "analytics:manage",

    // Reviews
    REVIEWS_READ = "reviews:read",
    REVIEWS_MANAGE = "reviews:manage",

    // Staff Attendance
    ATTENDANCE_READ = "attendance:read",
    ATTENDANCE_MANAGE = "attendance:manage",

    // Data Export & Reporting
    EXPORT_MANAGE = "export:manage",

    // Integrations
    INTEGRATION_MANAGE = "integration:manage",
    CALENDAR_MANAGE = "calendar:manage",

    // Audit Logs
    AUDIT_READ = "audit:read",

    // Entitlements
    ENTITLEMENT_READ = "entitlement:read",
    ENTITLEMENT_MANAGE = "entitlement:manage",

    // AI & Voice
    AI_EXECUTE = "ai:execute",

    // Schedule Optimizer & Smart Waitlist
    OPTIMIZER_READ = "optimizer:read",
    OPTIMIZER_MANAGE = "optimizer:manage",

    // Platform Admin
    PLATFORM_ADMIN = "platform:admin",
}

/**
 * Standard Role to Permission key mappings according to Architecture RBAC matrix
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleCode, PermissionKey[]> = {
    [RoleCode.OWNER]: Object.values(PermissionKey).filter(
        (p) => p !== PermissionKey.PLATFORM_ADMIN
    ),
    [RoleCode.ADMIN]: [
        PermissionKey.ORG_READ,
        PermissionKey.ORG_UPDATE,
        PermissionKey.LOCATION_READ,
        PermissionKey.LOCATION_MANAGE,
        PermissionKey.STAFF_READ,
        PermissionKey.STAFF_MANAGE,
        PermissionKey.STAFF_INVITE,
        PermissionKey.SERVICE_READ,
        PermissionKey.SERVICE_MANAGE,
        PermissionKey.RESOURCE_READ,
        PermissionKey.RESOURCE_MANAGE,
        PermissionKey.APPOINTMENT_READ,
        PermissionKey.APPOINTMENT_CREATE,
        PermissionKey.APPOINTMENT_MUTATE,
        PermissionKey.APPOINTMENT_CANCEL,
        PermissionKey.CUSTOMER_READ,
        PermissionKey.CUSTOMER_MANAGE,
        PermissionKey.PAYMENT_READ,
        PermissionKey.PAYMENT_MANAGE,
        PermissionKey.FINANCIAL_ADMIN,
        PermissionKey.REFUND_MANAGE,
        PermissionKey.ANALYTICS_READ,
        PermissionKey.ANALYTICS_MANAGE,
        PermissionKey.REVIEWS_READ,
        PermissionKey.REVIEWS_MANAGE,
        PermissionKey.ATTENDANCE_READ,
        PermissionKey.ATTENDANCE_MANAGE,
        PermissionKey.EXPORT_MANAGE,
        PermissionKey.AI_EXECUTE,
        PermissionKey.OPTIMIZER_READ,
        PermissionKey.OPTIMIZER_MANAGE,
        PermissionKey.INTEGRATION_MANAGE,
        PermissionKey.CALENDAR_MANAGE,
        PermissionKey.AUDIT_READ,
        PermissionKey.ENTITLEMENT_READ,
    ],
    [RoleCode.MANAGER]: [
        PermissionKey.ORG_READ,
        PermissionKey.LOCATION_READ,
        PermissionKey.STAFF_READ,
        PermissionKey.SERVICE_READ,
        PermissionKey.RESOURCE_READ,
        PermissionKey.RESOURCE_MANAGE,
        PermissionKey.APPOINTMENT_READ,
        PermissionKey.APPOINTMENT_CREATE,
        PermissionKey.APPOINTMENT_MUTATE,
        PermissionKey.APPOINTMENT_CANCEL,
        PermissionKey.CUSTOMER_READ,
        PermissionKey.CUSTOMER_MANAGE,
        PermissionKey.PAYMENT_READ,
        PermissionKey.AI_EXECUTE,
        PermissionKey.OPTIMIZER_READ,
        PermissionKey.OPTIMIZER_MANAGE,
        PermissionKey.ANALYTICS_READ,
        PermissionKey.REVIEWS_READ,
        PermissionKey.REVIEWS_MANAGE,
        PermissionKey.ATTENDANCE_READ,
        PermissionKey.ATTENDANCE_MANAGE,
        PermissionKey.CALENDAR_MANAGE,
        PermissionKey.EXPORT_MANAGE,
    ],
    [RoleCode.RECEPTIONIST]: [
        PermissionKey.ORG_READ,
        PermissionKey.LOCATION_READ,
        PermissionKey.STAFF_READ,
        PermissionKey.SERVICE_READ,
        PermissionKey.RESOURCE_READ,
        PermissionKey.APPOINTMENT_READ,
        PermissionKey.APPOINTMENT_CREATE,
        PermissionKey.APPOINTMENT_MUTATE,
        PermissionKey.APPOINTMENT_CANCEL,
        PermissionKey.CUSTOMER_READ,
        PermissionKey.CUSTOMER_MANAGE,
        PermissionKey.PAYMENT_READ,
        PermissionKey.AI_EXECUTE,
        PermissionKey.REVIEWS_READ,
        PermissionKey.ATTENDANCE_READ,
    ],
    [RoleCode.STAFF]: [
        PermissionKey.ORG_READ,
        PermissionKey.LOCATION_READ,
        PermissionKey.STAFF_READ,
        PermissionKey.SERVICE_READ,
        PermissionKey.RESOURCE_READ,
        PermissionKey.APPOINTMENT_READ,
        PermissionKey.APPOINTMENT_CREATE,
        PermissionKey.APPOINTMENT_MUTATE,
        PermissionKey.CUSTOMER_READ,
        PermissionKey.AI_EXECUTE,
        PermissionKey.REVIEWS_READ,
        PermissionKey.ATTENDANCE_READ,
        PermissionKey.CALENDAR_MANAGE,
    ],
};
