import { z } from 'zod';

export const ianaTimezoneSchema = z.string().refine((val) => {
    try {
        Intl.DateTimeFormat(undefined, { timeZone: val });
        return true;
    } catch {
        return false;
    }
}, { message: 'Invalid IANA timezone identifier' });

export const operatingHourIntervalSchema = z.object({
    start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format HH:mm'),
    end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format HH:mm'),
}).strict().refine(data => data.end > data.start, {
    message: 'End time must be after start time',
});

export const updateOrganizationSchema = z.object({
    name: z.string().min(1).max(160).optional(),
    industry: z.string().max(100).optional(),
    timezone: ianaTimezoneSchema.optional(),
    currency: z.string().length(3).optional(),
    defaultLocale: z.string().optional(),
    supportedLocales: z.array(z.string().max(35)).max(20).optional(),
    country: z.string().length(2).optional(),
    phone: z.string().max(40).optional(),
    email: z.string().email().optional().or(z.literal('')),
    website: z.string().url().optional().or(z.literal('')),
    brandName: z.string().max(160).optional(),
    logoUrl: z.string().url().max(2_048).optional(),
    faviconUrl: z.string().url().max(2_048).optional(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    paymentIntent: z.enum(['ONLINE', 'IN_PERSON', 'NONE']).optional(),
    bookingEnabled: z.boolean().optional(),
}).strict();

export const dayOperatingHoursSchema = z.union([
    z.array(operatingHourIntervalSchema),
    z.object({
        active: z.boolean().optional(),
        open: z.string().optional(),
        close: z.string().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
    }).strict().transform((val) => {
        if (val.active === false) return [];
        const start = val.open || val.start || '09:00';
        const end = val.close || val.end || '18:00';
        return [{ start, end }];
    }),
]);

export const weeklyOperatingHoursSchema = z.record(dayOperatingHoursSchema);

export const createLocationSchema = z.object({
    name: z.string().min(1, 'Name is required').max(160),
    slug: z.string().min(1).max(63).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
    timezone: ianaTimezoneSchema,
    address: z.string().max(500).optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(120).optional(),
    postalCode: z.string().max(30).optional(),
    country: z.string().default('US'),
    phone: z.string().max(40).optional(),
    email: z.string().email().optional().or(z.literal('')),
    operatingHours: weeklyOperatingHoursSchema.optional().or(z.record(z.any())).optional(),
    instructions: z.string().max(2_000).optional(),
    parkingAccess: z.string().max(2_000).optional(),
    taxRatePct: z.number().min(0).max(100).optional(),
    staffIds: z.array(z.string().uuid()).optional(),
}).strict();

export const updateLocationSchema = createLocationSchema.partial().extend({
    isActive: z.boolean().optional(),
});

export const createLocationHolidaySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
    name: z.string().min(1, 'Holiday/closure name is required').max(120),
    isClosed: z.boolean().default(true),
}).strict();

export const createStaffSchema = z.object({
    userId: z.string().uuid().optional(),
    email: z.string().email('Valid email is required'),
    fullName: z.string().min(1, 'Full name is required').max(120),
    roleCode: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'STAFF', 'RECEPTIONIST']).optional(),
    displayName: z.string().min(1, 'Display name is required').max(120),
    title: z.string().optional(),
    bio: z.string().optional(),
    avatarUrl: z.string().optional(),
    skills: z.array(z.string().max(100)).max(100).optional(),
    calendarColor: z.string().optional(),
    bookingVisible: z.boolean().default(true),
    locationIds: z.array(z.string().uuid()).max(100).optional(),
    serviceIds: z.array(z.string().uuid()).max(100).optional(),
    serviceOverrides: z.array(z.object({
        serviceId: z.string().uuid(),
        customPriceCents: z.number().int().min(0).optional(),
        customDurationMin: z.number().int().min(1).optional(),
    })).max(100).optional(),
}).strict();

export const updateStaffSchema = createStaffSchema.partial().extend({
    isActive: z.boolean().optional(),
});

export const setStaffAvailabilitySchema = z.object({
    availabilities: z.array(z.object({
        locationId: z.string().uuid().optional(),
        dayOfWeek: z.number().min(0).max(6),
        startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    }).strict()).max(100),
    breaks: z.array(z.object({
        dayOfWeek: z.number().min(0).max(6).optional(),
        startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
        label: z.string().optional(),
    }).strict()).max(100).optional(),
}).strict();

export const createStaffLeaveSchema = z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    reason: z.string().optional(),
}).strict().refine(data => new Date(data.endDate) > new Date(data.startDate), {
    message: 'End date must be after start date',
});

export const createServiceSchema = z.object({
    name: z.string().min(1, 'Service name is required'),
    description: z.string().optional(),
    category: z.string().optional(),
    imageUrl: z.string().optional(),
    durationMin: z.number().int().min(1, 'Duration must be at least 1 minute'),
    preBufferMin: z.number().int().min(0).default(0),
    postBufferMin: z.number().int().min(0).default(0),
    priceCents: z.number().int().min(0, 'Price must be non-negative'),
    currency: z.string().length(3).default('USD'),
    depositType: z.enum(['NONE', 'PERCENTAGE', 'FIXED']).default('NONE'),
    depositValue: z.number().min(0).default(0),
    taxBehavior: z.enum(['EXCLUSIVE', 'INCLUSIVE', 'NONE']).default('EXCLUSIVE'),
    capacity: z.number().int().min(1).default(1),
    minParticipants: z.number().int().min(1).default(1),
    maxParticipants: z.number().int().min(1).default(1),
    preparationInstructions: z.string().optional(),
    eligibleLocationIds: z.array(z.string().uuid()).optional(),
    eligibleStaffIds: z.array(z.string().uuid()).optional(),
    intakeFormIds: z.array(z.string().uuid()).optional(),
    staffPricing: z.array(z.object({
        staffId: z.string().uuid(),
        customPriceCents: z.number().int().min(0).optional(),
        customDurationMin: z.number().int().min(1).optional(),
    }).strict()).optional(),
    requiredResourcePools: z.array(z.object({
        poolId: z.string().uuid(),
        quantity: z.number().int().min(1),
    }).strict()).max(100).optional(),
}).strict();

export const updateServiceSchema = createServiceSchema.partial().extend({
    isActive: z.boolean().optional(),
    version: z.number().int().optional(),
});

export const createResourcePoolSchema = z.object({
    name: z.string().min(1, 'Resource pool name is required'),
    category: z.string().optional(),
}).strict();

export const createResourceSchema = z.object({
    locationId: z.string().uuid('Location ID is required'),
    poolId: z.string().uuid().optional(),
    name: z.string().min(1, 'Resource name is required'),
    type: z.string().min(1, 'Resource type is required'),
    quantity: z.number().int().min(1).default(1),
}).strict();

export const updateResourceSchema = createResourceSchema.partial().extend({
    isActive: z.boolean().optional(),
});

export const createResourceBlockSchema = z.object({
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    reason: z.string().optional(),
}).strict().refine(data => new Date(data.endAt) > new Date(data.startAt), {
    message: 'End time must be after start time',
});

export const intakeFormFieldSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1, 'Field label is required'),
    type: z.enum(['short_text', 'long_text', 'select', 'multi_select', 'checkbox', 'yes_no', 'number', 'date']),
    required: z.boolean().default(false),
    options: z.array(z.string()).optional(),
    placeholder: z.string().optional(),
    validationRule: z.string().optional(),
}).strict();

export const createIntakeFormSchema = z.object({
    name: z.string().min(1, 'Intake form name is required'),
    description: z.string().optional(),
    isGlobal: z.boolean().default(false),
    fields: z.array(intakeFormFieldSchema).min(1, 'At least one field is required').max(100),
    serviceIds: z.array(z.string().uuid()).max(100).optional(),
}).strict();

export const updateIntakeFormSchema = createIntakeFormSchema.partial().extend({
    isActive: z.boolean().optional(),
});

export const updatePolicyConfigSchema = z.object({
    locationId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    minNoticeHours: z.number().int().min(0).optional(),
    maxNoticeDays: z.number().int().min(1).optional(),
    cancelCutoffHours: z.number().int().min(0).optional(),
    cancelFeeType: z.enum(['NONE', 'PERCENTAGE', 'FIXED']).optional(),
    cancelFeeValue: z.number().min(0).optional(),
    rescheduleCutoffHours: z.number().int().min(0).optional(),
    holdDurationMinutes: z.number().int().min(1).optional(),
    waitlistOfferExpiryMinutes: z.number().int().min(1).optional(),
}).strict();
