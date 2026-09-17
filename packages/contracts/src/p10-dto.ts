export type AIConversationChannel = "TEXT" | "VOICE";
export type AIConversationStatus = "ACTIVE" | "CLOSED" | "EXPIRED";
export type AIConversationScope = "CUSTOMER" | "OWNER";

export interface AISafeMessage {
    role: "USER" | "ASSISTANT" | "TOOL";
    content: string;
    createdAt: string;
    toolName?: string;
    actionState?: "INFORMATION" | "PROPOSED" | "CONFIRMED";
    cards?: AIActionCard[];
}

export type AIActionCardKind =
    | "TOOL_RESULT"
    | "CONFIRMATION"
    | "PAYMENT_HANDOFF"
    | "CANONICAL_REFETCH"
    | "APPOINTMENT_LIST"
    | "SERVICE_CATALOG"
    | "AVAILABILITY_SLOTS"
    | "POLICY_SUMMARY"
    | "WAITLIST_STATUS"
    | "ACCOUNT_SUMMARY"
    | "BOOKING_RECEIPT"
    | "HOLD_RELEASED"
    | "BUSINESS_OVERVIEW"
    | "STAFF_AGENDA"
    | "OWNER_SERVICE_CATALOG"
    | "SERVICE_MANAGE_RESULT"
    | "STAFF_ROSTER"
    | "STAFF_SCHEDULE"
    | "STAFF_MANAGE_RESULT"
    | "CUSTOMER_CRM_LIST"
    | "CUSTOMER_PROFILE"
    | "CUSTOMER_NOTE_ADDED"
    | "CUSTOMER_TAGGED"
    | "WAITLIST_QUEUE"
    | "WAITLIST_OFFER_SENT"
    | "OPTIMIZER_INSIGHTS"
    | "MARKETING_OVERVIEW"
    | "COUPON_RESULT"
    | "COMMISSIONS_REPORT"
    | "BUSINESS_POLICIES"
    | "POLICY_UPDATED"
    | "CUSTOMER_BILLING_HISTORY";

export interface AIActionCard {
    kind: AIActionCardKind;
    toolName: string;
    title: string;
    data: Record<string, unknown>;
    proposalId?: string;
    confirmationToken?: string;
    expiresAt?: string;
}

export interface CustomerAppointmentSummaryDto {
    id: string;
    status: string;
    paymentStatus: string;
    serviceName: string;
    durationMin: number;
    staffDisplayName?: string | null;
    locationName: string;
    locationAddress?: string | null;
    startAt: string;
    endAt: string;
    priceCents: number;
    currency: string;
}

export interface CustomerHoldSummaryDto {
    holdId: string;
    serviceName: string;
    locationName: string;
    staffDisplayName?: string | null;
    startAt: string;
    endAt: string;
    expiresAt: string;
    payableNowCents: number;
    currency: string;
}

export interface CustomerWaitlistSummaryDto {
    id: string;
    serviceName: string;
    locationName?: string | null;
    staffDisplayName?: string | null;
    startWindowDate: string;
    endWindowDate: string;
    timePreference: string;
    status: string;
    expiresAt?: string | null;
    activeOffer?: {
        offerId: string;
        startAt: string;
        endAt: string;
        expiresAt: string;
    } | null;
}

export interface CustomerAccountContextDto {
    fullName: string;
    email: string;
    phone?: string | null;
    upcomingAppointmentsCount: number;
    activeHoldsCount: number;
    activeWaitlistCount: number;
}

export interface OrganizationPublicProfileDto {
    name: string;
    brandName?: string | null;
    slug: string;
    industry?: string | null;
    timezone: string;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    locations: Array<{
        id: string;
        name: string;
        address?: string | null;
        city?: string | null;
        timezone: string;
        phone?: string | null;
    }>;
}

export interface OrganizationPublicPolicyDto {
    minNoticeHours: number;
    maxNoticeDays: number;
    cancelCutoffHours: number;
    cancelFeeType: string;
    cancelFeeValue: number;
    rescheduleCutoffHours: number;
    holdDurationMinutes: number;
    summaryText: string;
}

export interface CreateAIConversationDto {
    channel?: AIConversationChannel;
    scope?: AIConversationScope;
}

export interface SendAIMessageDto {
    message: string;
    idempotencyKey: string;
}

export interface ConfirmAIProposalDto {
    confirmationToken: string;
    idempotencyKey: string;
}

export interface AIConversationDto {
    id: string;
    channel: AIConversationChannel;
    status: AIConversationStatus;
    scope?: AIConversationScope;
    participantType?: string;
    messages: AISafeMessage[];
    retentionExpiresAt: string;
}

export interface AIMessageResponseDto {
    conversation: AIConversationDto;
    assistantMessage: string;
    cards: AIActionCard[];
    provider: {
        name: "gemini";
        model: string;
        latencyMs: number;
        inputTokens?: number;
        outputTokens?: number;
        estimatedCostMicros?: number | null;
    };
    degraded: boolean;
    recoveryRequired?: boolean;
}

export interface CustomerInvitationPreviewResult {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    brandName?: string | null;
    logoUrl?: string | null;
    primaryColor?: string | null;
    status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
    expiresAt: string;
}

export type InvitationDeliveryStatus =
    | "Queued for Brevo delivery"
    | "Sent"
    | "Delivery failed"
    | "Accepted"
    | "Expired"
    | "Revoked";

export interface CustomerInvitationDeliveryItem {
    id: string;
    email: string;
    status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
    outboxStatus?: "pending" | "processing" | "completed" | "failed" | "dead-lettered" | null;
    notificationStatus?: "queued" | "processing" | "sent" | "failed" | null;
    brevoMessageId?: string | null;
    deliveryError?: string | null;
    sentAt?: string | null;
    displayStatus: InvitationDeliveryStatus;
}
