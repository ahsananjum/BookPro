import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import {
    CalendarProvider,
    OAuthTokens,
    GoogleCalendarListItem,
    GoogleEventPayload,
    GoogleSyncResponse,
    GoogleWatchResponse,
} from "./calendar-provider.interface";
import * as crypto from "crypto";

export interface MockStoreCalendarEvent extends GoogleEventPayload {
    id: string;
    etag: string;
    updated: string;
    status: "confirmed" | "cancelled";
}

@Injectable()
export class MockGoogleCalendarAdapter implements CalendarProvider {
    private readonly logger = new Logger(MockGoogleCalendarAdapter.name);

    public eventsStore = new Map<string, Map<string, MockStoreCalendarEvent>>();
    public simulatedErrors: {
        shouldFailRefresh?: boolean;
        shouldFailSyncWith410?: boolean;
        shouldFailTransient?: boolean;
        shouldFailOutbound?: boolean;
    } = {};

    constructor() {
        this.eventsStore.set("primary", new Map());
    }

    clear() {
        this.eventsStore.clear();
        this.eventsStore.set("primary", new Map());
        this.simulatedErrors = {};
    }

    getAuthUrl(state: string, redirectUri: string): string {
        return `https://accounts.google.com/o/oauth2/v2/auth?client_id=mock_client&redirect_uri=${encodeURIComponent(
            redirectUri
        )}&state=${encodeURIComponent(state)}&response_type=code&scope=calendar`;
    }

    async exchangeOAuthCode(code: string, redirectUri: string): Promise<OAuthTokens> {
        return {
            accessToken: `mock_access_${crypto.randomBytes(8).toString("hex")}`,
            refreshToken: `mock_refresh_${crypto.randomBytes(16).toString("hex")}`,
            expiresIn: 3600,
            tokenType: "Bearer",
            scope: "https://www.googleapis.com/auth/calendar.events",
        };
    }

    async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
        if (this.simulatedErrors.shouldFailRefresh || refreshToken.includes("invalid_grant")) {
            throw new UnauthorizedException("Google refresh token expired or revoked (invalid_grant)");
        }
        return {
            accessToken: `mock_access_refreshed_${crypto.randomBytes(8).toString("hex")}`,
            expiresIn: 3600,
        };
    }

    async listCalendars(accessToken: string): Promise<GoogleCalendarListItem[]> {
        return [
            {
                id: "primary",
                summary: "Staff Primary Calendar",
                primary: true,
                timeZone: "America/New_York",
                accessRole: "owner",
            },
            {
                id: "cal_personal_123",
                summary: "Personal Appointments",
                primary: false,
                timeZone: "America/New_York",
                accessRole: "owner",
            },
        ];
    }

    async createEvent(accessToken: string, calendarId: string, event: GoogleEventPayload): Promise<any> {
        if (this.simulatedErrors.shouldFailTransient) {
            throw new Error("Google Calendar API rate limit exceeded (HTTP 429)");
        }
        if (this.simulatedErrors.shouldFailOutbound) {
            throw new Error("Google Calendar API Service Unavailable (HTTP 503)");
        }

        const id = event.id || `g_evt_${crypto.randomBytes(8).toString("hex")}`;
        const storedEvent: MockStoreCalendarEvent = {
            ...event,
            id,
            etag: `"etag_${Date.now()}"`,
            updated: new Date().toISOString(),
            status: "confirmed",
        };

        let calMap = this.eventsStore.get(calendarId);
        if (!calMap) {
            calMap = new Map();
            this.eventsStore.set(calendarId, calMap);
        }
        calMap.set(id, storedEvent);

        return storedEvent;
    }

    async updateEvent(accessToken: string, calendarId: string, eventId: string, event: GoogleEventPayload): Promise<any> {
        if (this.simulatedErrors.shouldFailTransient) {
            throw new Error("Google Calendar API rate limit exceeded (HTTP 429)");
        }

        let calMap = this.eventsStore.get(calendarId);
        if (!calMap) {
            calMap = new Map();
            this.eventsStore.set(calendarId, calMap);
        }

        const updatedEvent: MockStoreCalendarEvent = {
            ...event,
            id: eventId,
            etag: `"etag_${Date.now()}"`,
            updated: new Date().toISOString(),
            status: "confirmed",
        };
        calMap.set(eventId, updatedEvent);

        return updatedEvent;
    }

    async deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
        const calMap = this.eventsStore.get(calendarId);
        if (calMap && calMap.has(eventId)) {
            const existing = calMap.get(eventId)!;
            existing.status = "cancelled";
            existing.updated = new Date().toISOString();
        }
    }

    async syncEvents(
        accessToken: string,
        calendarId: string,
        syncToken?: string,
        timeMin?: Date,
        timeMax?: Date
    ): Promise<GoogleSyncResponse> {
        if (this.simulatedErrors.shouldFailSyncWith410 && syncToken) {
            this.logger.warn("[MockGoogleCalendarAdapter] Simulating HTTP 410 Gone for expired syncToken.");
            this.simulatedErrors.shouldFailSyncWith410 = false;
            const calMap = this.eventsStore.get(calendarId) || new Map();
            const items = Array.from(calMap.values());
            return {
                items,
                nextSyncToken: `sync_fresh_${Date.now()}`,
                isFullResync: true,
            };
        }

        const calMap = this.eventsStore.get(calendarId) || new Map();
        const items = Array.from(calMap.values());

        return {
            items,
            nextSyncToken: `sync_${Date.now()}`,
        };
    }

    async registerWatch(accessToken: string, calendarId: string, webhookUrl: string, channelId: string, channelToken: string): Promise<GoogleWatchResponse> {
        return {
            channelId,
            resourceId: `res_${crypto.randomBytes(8).toString("hex")}`,
            expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
        };
    }

    async stopWatch(accessToken: string, channelId: string, resourceId: string): Promise<void> {
        // No-op for mock
    }

    async revokeToken(token: string): Promise<void> {
        // No-op for mock
    }
}
