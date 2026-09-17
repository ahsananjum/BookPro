export interface ReferenceTimezoneDto {
    id: string;
    name: string;
    offset: string;
    label: string;
}

export interface ReferenceCurrencyDto {
    code: string;
    name: string;
    symbol: string;
    decimals: number;
}

export interface ReferenceCountryDto {
    code: string;
    name: string;
    dialCode: string;
    defaultCurrency: string;
    defaultTimezone: string;
}

export interface ReferenceIndustryDto {
    id: string;
    slug: string;
    name: string;
    description: string;
    icon?: string;
    sortOrder: number;
}

export interface PublishReadinessIssueDto {
    code: string;
    step: string;
    stepNumber: number;
    message: string;
    blocking: boolean;
}

export interface OnboardingStatusResponseDto {
    currentStep: number;
    completedSteps: string[];
    readyToPublish: boolean;
    issues: PublishReadinessIssueDto[];
    organization: {
        id: string;
        name: string;
        slug: string;
        bookingSlug?: string | null;
        timezone: string;
        currency: string;
        country: string;
        phone?: string | null;
        email?: string | null;
        website?: string | null;
        brandName?: string | null;
        logoUrl?: string | null;
        primaryColor?: string | null;
        accentColor?: string | null;
        industry?: string | null;
        onboardingStep: number;
        onboardingCompleted: boolean;
        bookingEnabled: boolean;
        paymentIntent?: string | null;
        stripeAccountId?: string | null;
        stripeConnectedAt?: string | null;
        stripeChargesEnabled?: boolean;
        stripePayoutsEnabled?: boolean;
        stripeDetailsSubmitted?: boolean;
    };
    firstLocation?: {
        id: string;
        name: string;
        slug: string;
        timezone: string;
        address?: string | null;
        city?: string | null;
        state?: string | null;
        postalCode?: string | null;
        country?: string | null;
        phone?: string | null;
        operatingHours?: Record<string, Array<{ start: string; end: string }>> | null;
        taxRatePct?: number | null;
        instructions?: string | null;
    } | null;
    firstService?: {
        id: string;
        name: string;
        description?: string | null;
        durationMin: number;
        priceCents: number;
        currency: string;
        depositType?: string | null;
        depositValue?: number | null;
        bufferAfterMin?: number | null;
    } | null;
    firstStaff?: {
        id: string;
        displayName: string;
        title?: string | null;
        email?: string | null;
        bio?: string | null;
        isOwner?: boolean;
        roleCode?: string | null;
        availabilitiesCount?: number;
        availabilities?: Array<{
            id?: string;
            dayOfWeek: number;
            startTime: string;
            endTime: string;
            locationId?: string | null;
        }>;
    } | null;
    policy?: {
        minNoticeHours: number;
        maxNoticeDays: number;
        cancelCutoffHours: number;
        cancelFeeType: string;
        cancelFeeValue: number;
        rescheduleCutoffHours: number;
        holdDurationMinutes: number;
    } | null;
    stripe?: {
        connected: boolean;
        accountId?: string | null;
        connectedAt?: string | null;
        chargesEnabled?: boolean;
        payoutsEnabled?: boolean;
        detailsSubmitted?: boolean;
    };
}

export interface PublishBookingPageResponseDto {
    success: boolean;
    publicUrl: string;
    slug: string;
    publishedAt: string;
}

export interface StripeConnectUrlResponseDto {
    url: string;
    accountId?: string | null;
}

export interface StripeStatusResponseDto {
    connected: boolean;
    accountId?: string | null;
    connectedAt?: string | null;
    payoutsEnabled?: boolean;
    chargesEnabled?: boolean;
    detailsSubmitted?: boolean;
}
