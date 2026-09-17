import { z } from "zod";

export const RoleCodeSchema = z.enum([
    "OWNER",
    "ADMIN",
    "MANAGER",
    "RECEPTIONIST",
    "STAFF",
]);

export const loginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters").max(128),
}).strict();

export type LoginDto = z.infer<typeof loginSchema>;

export const registerBusinessSchema = z.object({
    fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(120),
    email: z.string().trim().email("Invalid email address").transform((value) => value.toLowerCase()),
    password: z
        .string()
        .min(12, "Password must be at least 12 characters")
        .max(128)
        .regex(/[a-z]/, "Password must include a lowercase letter")
        .regex(/[A-Z]/, "Password must include an uppercase letter")
        .regex(/[0-9]/, "Password must include a number"),
    organizationName: z.string().trim().min(2, "Business name must be at least 2 characters").max(160),
    organizationSlug: z
        .string()
        .trim()
        .toLowerCase()
        .min(3)
        .max(63)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single hyphens"),
    timezone: z.string().trim().min(1).max(100),
    currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
}).strict();

export const passwordSchema = registerBusinessSchema.shape.password;

export type RegisterBusinessDto = z.infer<typeof registerBusinessSchema>;

export const registerCustomerSchema = z.object({
    fullName: registerBusinessSchema.shape.fullName,
    email: registerBusinessSchema.shape.email,
    password: registerBusinessSchema.shape.password,
    phone: z.string().trim().max(40).optional(),
}).strict();
export type RegisterCustomerDto = z.infer<typeof registerCustomerSchema>;

export const verifyEmailSchema = z.object({
    token: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
    email: z.string().trim().email("Enter the email used during registration").transform((value) => value.toLowerCase()),
}).strict();

export const resendVerificationSchema = z.object({
    email: z.string().trim().email("Enter a valid email address").transform((value) => value.toLowerCase()),
}).strict();

export const registrationSlugSchema = z.object({
    slug: registerBusinessSchema.shape.organizationSlug,
}).strict();

export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationDto = z.infer<typeof resendVerificationSchema>;

export const selectOrganizationSchema = z.object({
    organizationId: z.string().uuid("Invalid organization ID"),
}).strict();

export type SelectOrganizationDto = z.infer<typeof selectOrganizationSchema>;

export const acceptInviteSchema = z.object({
    token: z.string().min(1, "Invitation token is required").max(512),
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    password: passwordSchema,
    phone: z.string().max(40).optional(),
}).strict();

export type AcceptInviteDto = z.infer<typeof acceptInviteSchema>;

export const inviteUserSchema = z.object({
    email: z.string().email("Invalid email address").max(254),
    roleCode: RoleCodeSchema,
    locationIds: z.array(z.string().uuid()).max(100).optional(),
}).strict();

export type InviteUserDto = z.infer<typeof inviteUserSchema>;

export const inviteCustomerSchema = z.object({
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
}).strict();

export const customerInvitationIdSchema = z.object({
    invitationId: z.string().uuid(),
}).strict();

export const previewCustomerInviteSchema = z.object({
    token: z.string().min(16).max(512),
}).strict();

export const acceptCustomerInviteSchema = z.object({
    token: z.string().min(16).max(512),
    consentMarketing: z.boolean().default(false),
}).strict();

export const joinOrganizationSchema = z.object({
    organizationId: z.string().uuid(),
    consentMarketing: z.boolean().default(false),
}).strict();

export const organizationDirectorySchema = z.object({
    search: z.string().trim().max(100).optional(),
    industry: z.string().trim().max(100).optional(),
    country: z.string().trim().max(2).optional(),
    sort: z.enum(["name", "newest", "services"]).default("name"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
}).strict();

export const emailTemplateSchema = z.object({
    name: z.string().trim().min(2).max(100),
    subject: z.string().trim().min(1).max(200),
    htmlBody: z.string().min(1).max(100000),
    textBody: z.string().max(100000).optional(),
}).strict();

export const emailTemplateIdSchema = z.object({ templateId: z.string().uuid() }).strict();

export const sendCampaignSchema = z.object({
    templateId: z.string().uuid(),
    name: z.string().trim().min(2).max(120),
}).strict();

export const changeRoleSchema = z.object({
    membershipId: z.string().uuid("Invalid membership ID"),
    roleCode: RoleCodeSchema,
    locationIds: z.array(z.string().uuid()).max(100).optional(),
}).strict();

export type ChangeRoleDto = z.infer<typeof changeRoleSchema>;

export const entitlementOverrideSchema = z.object({
    featureKey: z.string().min(1, "Feature key is required").max(100),
    enabled: z.boolean(),
    limitOverride: z.number().int().nonnegative().optional(),
}).strict();

export type EntitlementOverrideDto = z.infer<typeof entitlementOverrideSchema>;
