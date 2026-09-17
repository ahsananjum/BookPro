/**
 * BookPro Phase P6 — Commercial Engine, Payments, CRM & Commissions DTOs
 */

export interface CalculatePricingQuoteDto {
    organizationId?: string;
    locationId?: string;
    serviceId: string;
    staffId?: string;
    addOnIds?: string[];
    couponCode?: string;
}

export interface PricingQuoteResponseDto {
    serviceId: string;
    basePriceCents: number;
    addOnsCents: number;
    staffOverrideCents: number;
    locationOverrideCents: number;
    taxCents: number;
    taxBehavior?: 'EXCLUSIVE' | 'INCLUSIVE' | 'NONE';
    taxRatePct?: number;
    discountCents: number;
    totalCents: number;
    depositCents: number;
    payableNowCents: number;
    remainingBalanceCents: number;
    currency: string;
    quoteVersion: string;
    appliedCouponCode?: string;
}

export interface CancellationQuoteResponseDto {
    quoteId?: string;
    quoteVersion: string;
    appointmentId: string;
    appointmentVersion?: number;
    policyProvenance: "SERVICE" | "LOCATION" | "ORGANIZATION" | "DEFAULT_SYSTEM_FALLBACK";
    policyVersion?: string;
    capturedBalanceCents?: number;
    feeCents: number;
    cancellationFeeCents?: number;
    refundableCents: number;
    refundableAmountCents?: number;
    eligibleForRefund?: boolean;
    currency?: string;
    isAllowed: boolean;
    reason: string;
    expiresAt: string; // ISO timestamp
    organizationTimezone?: string;
    locationTimezone?: string;
    serverTime?: string;
    startAt?: string;
    cancelCutoffHours?: number;
    minNoticeHours?: number;
    cancelFeeType?: string;
    cancelFeeValue?: number;
}

export interface ConfirmCancellationDto {
    organizationId: string;
    appointmentId: string;
    quoteVersion?: string;
    reason?: string;
    actorType?: "CUSTOMER" | "STAFF" | "SYSTEM" | "AI_TOOL";
    actorId?: string;
}

export interface CreatePaymentIntentDto {
    organizationId?: string;
    holdId?: string;
    appointmentId?: string;
    amountCents: number;
    currency?: string;
    idempotencyKey?: string;
}

export interface PublicCreateHoldDto {
    locationId: string;
    serviceId: string;
    staffId?: string;
    startAt: string;
    endAt: string;
    partySize?: number;
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    idempotencyKey?: string;
}

export interface PublicPersistHoldDetailsDto {
    guestToken: string;
    fullName: string;
    email: string;
    phone?: string | null;
    notes?: string | null;
    consentMarketing?: boolean;
    intakeResponses?: Array<{
        intakeFormId: string;
        responses: Record<string, any>;
    }>;
}

export interface CanonicalHoldReviewDto {
    holdId: string;
    status: "ACTIVE" | "EXPIRED" | "CANCELLED" | "CONVERTED";
    expiresAt: string;
    serverNow: string;
    guestToken: string;
    detailsCompletedAt?: string | null;
    organization: {
        id: string;
        name: string;
        slug: string;
        brandName?: string | null;
        logoUrl?: string | null;
        phone?: string | null;
        email?: string | null;
        currency: string;
        timezone: string;
        stripeConnected: boolean;
    };
    location: {
        id: string;
        name: string;
        address?: string | null;
        city?: string | null;
        state?: string | null;
        timezone: string;
    };
    service: {
        id: string;
        name: string;
        description?: string | null;
        durationMin: number;
        priceCents: number;
        currency: string;
    };
    staff?: {
        id: string;
        displayName: string;
        avatarUrl?: string | null;
    } | null;
    schedule: {
        startAt: string;
        endAt: string;
        partySize: number;
        timezone: string;
    };
    guest?: {
        fullName?: string | null;
        email?: string | null;
        phone?: string | null;
        notes?: string | null;
        consentMarketing?: boolean;
    } | null;
    intake: Array<{
        intakeFormId: string;
        formName: string;
        responses: Record<string, any>;
        fieldsSummary?: Array<{
            id: string;
            label: string;
            value: any;
            maskedValue?: string;
        }>;
    }>;
    quote: {
        basePriceCents: number;
        taxCents: number;
        discountCents: number;
        totalCents: number;
        depositCents: number;
        payableNowCents: number;
        remainingBalanceCents: number;
        currency: string;
        taxBehavior?: "EXCLUSIVE" | "INCLUSIVE" | "NONE";
        taxRatePct?: number;
    };
    policy: {
        cancelCutoffHours?: number;
        cancelFeeType?: string;
        cancelFeeValue?: number;
        description?: string;
    };
}

export interface PublicFinalizeBookingDto {
    bookingHoldId: string;
    guestToken?: string;
    intakeResponses?: Array<{
        intakeFormId: string;
        responses: Record<string, any>;
    }>;
    idempotencyKey?: string;
}

export interface PublicCreatePaymentIntentDto {
    bookingHoldId: string;
    guestToken?: string;
    idempotencyKey?: string;
}

export interface PublicBookingStatusResponseDto {
    status: "HOLD_ACTIVE" | "PENDING_PAYMENT" | "CONFIRMED" | "EXPIRED" | "CANCELLED" | "PAYMENT_FAILED";
    paymentStatus?: string;
    payableNowCents?: number;
    expiresAt?: string;
    appointment?: {
        id: string;
        referenceCode?: string;
        startAt: string;
        endAt: string;
        status: string;
        paymentStatus: string;
        priceCents: number;
        currency: string;
        serviceName?: string;
        staffName?: string;
        locationName?: string;
        locationAddress?: string;
        emailDeliveryStatus?: "PENDING" | "SENT" | "FAILED" | "QUEUED";
        calendarSyncStatus?: "PENDING" | "SYNCED" | "FAILED" | "UNAVAILABLE";
        icsDownloadUrl?: string;
    };
    message?: string;
}

export interface CreatePaymentIntentResponseDto {
    paymentRecordId: string;
    paymentIntentId: string;
    clientSecret: string;
    publishableKey?: string;
    connectedAccountId?: string;
    amountCents: number;
    currency: string;
    originalAmountCents?: number;
    originalCurrency?: string;
    exchangeRate?: number;
    status: string;
    expiresAt?: string;
}



export interface ProcessWebhookDto {
    eventId: string;
    eventType: string;
    payload: Record<string, any>;
    signature?: string;
    rawBody?: string | Buffer;
}

export interface ProcessRefundDto {
    organizationId?: string;
    paymentRecordId: string;
    amountCents?: number;
    currency?: string;
    reason?: string;
    actorType?: "STAFF" | "SYSTEM" | "CUSTOMER";
    actorId?: string;
    idempotencyKey?: string;
}

export interface RefundResponseDto {
    refundRecordId: string;
    paymentRecordId: string;
    providerRefundId?: string;
    amountCents: number;
    currency: string;
    status: string;
    reason?: string;
    processedAt?: string;
}

export interface CustomerCrmResponseDto {
    id: string;
    organizationId: string;
    fullName: string;
    email: string;
    phone?: string;
    tags: string[];
    operationalNotes?: string;
    totalSpentCents: number;
    currency?: string;
    completedAppointmentsCount: number;
    cancelledCount: number;
    noShowCount: number;
    lastBookingAt?: string;
    nextBookingAt?: string;
    consentMarketing: boolean;
    consentMarketingAt?: string;
    consentSource?: string;
    createdAt: string;
    user?: {
        id: string;
        email: string;
        emailVerifiedAt: string | null;
        accountType: string;
    } | null;
    pendingInvitation?: {
        id: string;
        status: string;
        expiresAt: string;
    } | null;
}

export interface CustomerTimelineEventDto {
    id: string;
    type: "APPOINTMENT_CREATED" | "RESCHEDULED" | "CANCELLED" | "CHECKED_IN" | "COMPLETED" | "PAYMENT_SUCCEEDED" | "REFUND_ISSUED" | "NOTE_ADDED" | "WAITLIST_JOINED" | "WAITLIST_OFFER_ACCEPTED" | "REVIEW_LEFT" | "PORTAL_INVITATION_SENT" | "PORTAL_INVITATION_ACCEPTED" | "PORTAL_JOINED";
    timestamp: string;
    title: string;
    description?: string;
    metadata?: Record<string, any>;
    actorType?: string;
}

export interface CustomerDetailsResponseDto extends CustomerCrmResponseDto {
    notes: Array<{
        id: string;
        authorId: string;
        authorName?: string;
        content: string;
        isInternal: boolean;
        createdAt: string;
    }>;
    timeline: CustomerTimelineEventDto[];
    appointments: any[];
    waitlistEntries?: any[];
    reviews?: any[];
}

export interface CommissionReportDto {
    organizationId: string;
    staffId: string;
    staffName: string;
    totalEarnedCents: number;
    records: Array<{
        id: string;
        appointmentId: string;
        calculatedAmountCents: number;
        currency: string;
        status: string;
        createdAt: string;
    }>;
}

export interface SearchResultsDto {
    customers: Array<{ id: string; fullName: string; email: string; phone?: string }>;
    appointments: Array<{ id: string; reference: string; status: string; customerName?: string; startAt?: string }>;
    staff: Array<{ id: string; fullName: string; email: string }>;
    services: Array<{ id: string; name: string; priceCents: number }>;
}
