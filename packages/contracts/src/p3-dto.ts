export interface OperatingHourInterval {
    start: string; // HH:mm
    end: string;   // HH:mm
}

export type DayOperatingHours = OperatingHourInterval[];

export type WeeklyOperatingHours = Record<string, DayOperatingHours>;

export interface UpdateOrganizationDto {
    name?: string;
    industry?: string;
    timezone?: string;
    currency?: string;
    defaultLocale?: string;
    supportedLocales?: string[];
    country?: string;
    phone?: string;
    email?: string;
    website?: string;
    brandName?: string;
    logoUrl?: string;
    faviconUrl?: string;
    primaryColor?: string;
    accentColor?: string;
    paymentIntent?: 'ONLINE' | 'IN_PERSON' | 'NONE';
    bookingEnabled?: boolean;
}

export interface OnboardingStepDto {
    step: number;
    data?: Record<string, any>;
    completed?: boolean;
}

export interface CreateLocationDto {
    name: string;
    slug: string;
    timezone: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
    email?: string;
    operatingHours?: WeeklyOperatingHours;
    instructions?: string;
    parkingAccess?: string;
    taxRatePct?: number;
    staffIds?: string[];
}

export interface UpdateLocationDto extends Partial<CreateLocationDto> {
    isActive?: boolean;
}

export interface LocationHolidayDto {
    date: string;
    name: string;
    isClosed?: boolean;
}

export interface LocationWithRelationsDto {
    id: string;
    organizationId: string;
    name: string;
    slug: string;
    timezone: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
    phone?: string | null;
    email?: string | null;
    operatingHours?: any;
    instructions?: string | null;
    parkingAccess?: string | null;
    taxRatePct?: number | null;
    archivedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    staffLocations?: Array<{
        staff: {
            id: string;
            displayName: string;
            title?: string | null;
            avatarUrl?: string | null;
            roleCode?: string;
            bookingVisible?: boolean;
        };
    }>;
    resources?: Array<{
        id: string;
        name: string;
        type: string;
    }>;
    locationHolidays?: Array<{
        id: string;
        date: string;
        name: string;
        isClosed: boolean;
    }>;
    _count?: {
        staffLocations: number;
        resources: number;
        appointments: number;
    };
}

export interface StaffServiceOverrideDto {
    serviceId: string;
    customPriceCents?: number;
    customDurationMin?: number;
}

export interface CreateStaffDto {
    userId?: string;
    email: string;
    fullName: string;
    roleCode?: string;
    displayName: string;
    title?: string;
    bio?: string;
    avatarUrl?: string;
    skills?: string[];
    calendarColor?: string;
    bookingVisible?: boolean;
    locationIds?: string[];
    serviceIds?: string[];
    serviceOverrides?: StaffServiceOverrideDto[];
}

export interface UpdateStaffDto extends Partial<CreateStaffDto> {
    isActive?: boolean;
}

export interface SetStaffAvailabilityDto {
    availabilities: Array<{
        locationId?: string;
        dayOfWeek: number; // 0=Sunday, 1=Monday, etc.
        startTime: string; // HH:mm
        endTime: string;   // HH:mm
    }>;
    breaks?: Array<{
        dayOfWeek?: number;
        startTime: string;
        endTime: string;
        label?: string;
    }>;
}

export interface CreateStaffLeaveDto {
    startDate: string; // ISO 8601
    endDate: string;   // ISO 8601
    reason?: string;
}

export interface CreateServiceDto {
    name: string;
    description?: string;
    category?: string;
    imageUrl?: string;
    durationMin: number;
    preBufferMin?: number;
    postBufferMin?: number;
    priceCents: number;
    currency?: string;
    depositType?: 'NONE' | 'PERCENTAGE' | 'FIXED';
    depositValue?: number;
    taxBehavior?: 'EXCLUSIVE' | 'INCLUSIVE' | 'NONE';
    capacity?: number;
    minParticipants?: number;
    maxParticipants?: number;
    preparationInstructions?: string;
    eligibleLocationIds?: string[];
    eligibleStaffIds?: string[];
    intakeFormIds?: string[];
    staffPricing?: Array<{
        staffId: string;
        customPriceCents?: number;
        customDurationMin?: number;
    }>;
    requiredResourcePools?: Array<{
        poolId: string;
        quantity: number;
    }>;
}

export interface UpdateServiceDto extends Partial<CreateServiceDto> {
    isActive?: boolean;
    version?: number;
}

export interface CreateResourcePoolDto {
    name: string;
    category?: string;
}

export interface CreateResourceDto {
    locationId: string;
    poolId?: string;
    name: string;
    type: string;
    quantity?: number;
}

export interface UpdateResourceDto extends Partial<CreateResourceDto> {
    isActive?: boolean;
}

export interface CreateResourceBlockDto {
    startAt: string;
    endAt: string;
    reason?: string;
}

export interface IntakeFormField {
    id: string;
    label: string;
    type: 'short_text' | 'long_text' | 'select' | 'multi_select' | 'checkbox' | 'yes_no' | 'number' | 'date';
    required: boolean;
    options?: string[];
    placeholder?: string;
    validationRule?: string;
}

export interface CreateIntakeFormDto {
    name: string;
    description?: string;
    isGlobal?: boolean;
    fields: IntakeFormField[];
    serviceIds?: string[];
}

export interface UpdateIntakeFormDto extends Partial<CreateIntakeFormDto> {
    isActive?: boolean;
}

export interface UpdatePolicyConfigDto {
    locationId?: string;
    serviceId?: string;
    minNoticeHours?: number;
    maxNoticeDays?: number;
    cancelCutoffHours?: number;
    cancelFeeType?: 'NONE' | 'PERCENTAGE' | 'FIXED';
    cancelFeeValue?: number;
    rescheduleCutoffHours?: number;
    holdDurationMinutes?: number;
    waitlistOfferExpiryMinutes?: number;
}
