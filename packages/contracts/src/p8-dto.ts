export enum CalendarConnectionStatusEnum {
    CONNECTED = "CONNECTED",
    DEGRADED = "DEGRADED",
    DISCONNECTED = "DISCONNECTED",
    ACTION_REQUIRED = "ACTION_REQUIRED",
}

export interface GoogleConnectUrlResponse {
    url: string;
    state: string;
}

export interface GoogleOAuthCallbackQuery {
    code: string;
    state: string;
}

export interface GoogleCalendarSummaryDto {
    id: string;
    summary: string;
    description?: string;
    primary?: boolean;
    timeZone?: string;
    accessRole?: string;
}

export interface SelectGoogleCalendarInput {
    organizationId: string;
    staffId: string;
    calendarId: string;
    calendarName?: string;
}

export interface GoogleConnectionStatusDto {
    id?: string;
    organizationId: string;
    staffId: string;
    provider: string;
    selectedCalendarId?: string | null;
    selectedCalendarName?: string | null;
    status: CalendarConnectionStatusEnum;
    lastSyncAt?: string | null;
    lastSuccessAt?: string | null;
    lastError?: string | null;
    channelExpiration?: string | null;
    isHealthy: boolean;
}

export interface GoogleCalendarSyncJobPayload {
    organizationId: string;
    staffId: string;
    connectionId: string;
    reason?: "WEBHOOK" | "OUTBOX_CHANGE" | "MANUAL" | "POLL" | "RESYNC";
    fullResync?: boolean;
}

export interface CalendarSyncConflictDto {
    id: string;
    organizationId: string;
    staffId: string;
    appointmentId: string;
    externalEventId: string;
    conflictStartAt: string;
    conflictEndAt: string;
    resolved: boolean;
    resolvedAt?: string | null;
    appointmentSummary?: string;
    externalEventTitle?: string;
}
