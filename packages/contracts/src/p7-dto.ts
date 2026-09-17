/**
 * BookPro Phase P7 Contracts: Async, Queues, Notifications, Caching, and Realtime
 */

export const QUEUE_NAMES = {
    NOTIFICATIONS: "notifications",
    CALENDAR_SYNC: "calendar-sync",
    WEBHOOK_PROCESSING: "webhook-processing",
    WAITLIST: "waitlist",
    ANALYTICS: "analytics",
    AI_OPERATIONS: "ai-operations",
    MAINTENANCE: "maintenance",
    RECONCILIATION: "reconciliation",
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

export interface JobEnvelope<T = any> {
    jobVersion: number;
    organizationId?: string;
    correlationId: string;
    eventId?: string;
    enqueuedAt: string;
    payload: T;
}

export type NotificationChannelType = "EMAIL" | "SMS" | "IN_APP";

export type NotificationStatusType = "QUEUED" | "PROCESSING" | "SENT" | "FAILED" | "CANCELLED";

export interface SendEmailInput {
    organizationId: string;
    recipientEmail: string;
    subject: string;
    htmlBody: string;
    textBody?: string;
    senderName?: string;
    senderEmail?: string;
    correlationId?: string;
    idempotencyKey?: string;
}

export interface SendSmsInput {
    organizationId: string;
    recipientPhone: string;
    message: string;
    correlationId?: string;
}

export interface ProviderSendResult {
    success: boolean;
    providerMessageId?: string;
    error?: string;
    isRetryable?: boolean;
}

export interface NotificationJobPayload {
    notificationId?: string;
    organizationId: string;
    recipient: string;
    channel: NotificationChannelType;
    eventType: string;
    templateName: string;
    templateVersion?: number;
    variables: Record<string, any>;
    appointmentId?: string;
    customerId?: string;
    appointmentVersion?: number;
    dedupeKey?: string;
}

export interface RealtimeEventHint {
    type: string;
    entityId?: string;
    organizationId: string;
    version?: number;
    timestamp: string;
    correlationId?: string;
    metadata?: Record<string, any>;
    reconnectStrategy?: "canonical_refetch" | "cursor";
    lastEventId?: string | null;
}

export interface FailedJobDto {
    id: string;
    queueName: string;
    organizationId?: string;
    name: string;
    data: any;
    failedReason: string;
    attemptsMade: number;
    timestamp: number;
    failedAt?: number;
}

export type OutboxStatusType = "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED" | "DEAD_LETTER";

export interface OutboxLagMetrics {
    pendingCount: number;
    oldestPendingAgeSeconds: number;
    activeLeasesCount: number;
    staleLeasesCount: number;
    deadLetterCount: number;
}

export interface ProviderHealthStatus {
    provider: string;
    configured: boolean;
    mode: "real" | "disabled";
    error?: string;
}

export interface WorkerHealthDto {
    status: "healthy" | "degraded" | "unhealthy";
    role: "worker";
    workerId: string;
    uptimeSeconds: number;
    timestamp: string;
    database: {
        status: "UP" | "DOWN";
        latencyMs: number;
        error?: string;
    };
    redis: {
        status: "UP" | "DOWN";
        latencyMs: number;
        error?: string;
    };
    outboxLag: OutboxLagMetrics;
    providers: {
        email: ProviderHealthStatus;
        sms: ProviderHealthStatus;
    };
}

