export interface OAuthTokens {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    tokenType?: string;
    scope?: string;
}

export interface GoogleCalendarListItem {
    id: string;
    summary: string;
    description?: string;
    primary?: boolean;
    timeZone?: string;
    accessRole?: string;
}

export interface GoogleEventDateTime {
    dateTime?: string;
    date?: string;
    timeZone?: string;
}

export interface GoogleEventPayload {
    id?: string;
    summary: string;
    description?: string;
    location?: string;
    start: GoogleEventDateTime;
    end: GoogleEventDateTime;
    transparency?: "opaque" | "transparent"; // opaque = busy, transparent = free
    extendedProperties?: {
        private?: Record<string, string>;
        shared?: Record<string, string>;
    };
}

export interface GoogleSyncResponse {
    items: any[];
    nextSyncToken?: string;
    nextPageToken?: string;
    isFullResync?: boolean;
}

export interface GoogleWatchResponse {
    channelId: string;
    resourceId: string;
    expiration: string;
}

export interface CalendarProvider {
    getAuthUrl(state: string, redirectUri: string): string;
    exchangeOAuthCode(code: string, redirectUri: string): Promise<OAuthTokens>;
    refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }>;
    listCalendars(accessToken: string): Promise<GoogleCalendarListItem[]>;
    createEvent(accessToken: string, calendarId: string, event: GoogleEventPayload): Promise<any>;
    updateEvent(accessToken: string, calendarId: string, eventId: string, event: GoogleEventPayload): Promise<any>;
    deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>;
    syncEvents(accessToken: string, calendarId: string, syncToken?: string, timeMin?: Date, timeMax?: Date): Promise<GoogleSyncResponse>;
    registerWatch(accessToken: string, calendarId: string, webhookUrl: string, channelId: string, channelToken: string): Promise<GoogleWatchResponse>;
    stopWatch(accessToken: string, channelId: string, resourceId: string): Promise<void>;
    revokeToken(token: string): Promise<void>;
}

export const CALENDAR_PROVIDER = Symbol("CALENDAR_PROVIDER");
