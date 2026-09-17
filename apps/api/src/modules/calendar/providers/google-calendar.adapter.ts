import { Injectable, Logger, BadRequestException, UnauthorizedException, NotFoundException } from "@nestjs/common";
import {
    CalendarProvider,
    OAuthTokens,
    GoogleCalendarListItem,
    GoogleEventPayload,
    GoogleSyncResponse,
    GoogleWatchResponse,
} from "../interfaces/calendar-provider.interface";

@Injectable()
export class GoogleCalendarAdapter implements CalendarProvider {
    private readonly logger = new Logger(GoogleCalendarAdapter.name);

    private getCredentials(): { clientId: string; clientSecret: string } {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        if (!clientId || !clientSecret) throw new Error("Google Calendar integration is not configured");
        return { clientId, clientSecret };
    }

    getAuthUrl(state: string, redirectUri: string): string {
        const scopes = [
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
        ].join(" ");

        const params = new URLSearchParams({
            client_id: this.getCredentials().clientId,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: scopes,
            access_type: "offline",
            prompt: "consent",
            state,
        });

        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    async exchangeOAuthCode(code: string, redirectUri: string): Promise<OAuthTokens> {
        const { clientId, clientSecret } = this.getCredentials();
        const body = new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        });

        const res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
        });

        const data = await res.json();
        if (!res.ok) {
            this.logger.warn(`Google OAuth code exchange rejected (status=${res.status}, error=${data.error || "unknown"})`);
            throw new BadRequestException(data.error_description || data.error || "Failed to exchange Google authorization code");
        }

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in || 3600,
            tokenType: data.token_type,
            scope: data.scope,
        };
    }

    async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
        const { clientId, clientSecret } = this.getCredentials();
        const body = new URLSearchParams({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "refresh_token",
        });

        const res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
        });

        const data = await res.json();
        if (!res.ok) {
            if (data.error === "invalid_grant" || res.status === 400 || res.status === 401) {
                this.logger.warn(`Google refresh token is revoked or expired: ${data.error}`);
                throw new UnauthorizedException("Google refresh token expired or revoked (invalid_grant)");
            }
            throw new Error(`Google token refresh error: ${data.error_description || data.error}`);
        }

        return {
            accessToken: data.access_token,
            expiresIn: data.expires_in || 3600,
        };
    }

    async listCalendars(accessToken: string): Promise<GoogleCalendarListItem[]> {
        const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(`Failed to list Google calendars: ${data.error?.message || res.statusText}`);
        }

        return (data.items || []).map((item: any) => ({
            id: item.id,
            summary: item.summary,
            description: item.description,
            primary: !!item.primary,
            timeZone: item.timeZone,
            accessRole: item.accessRole,
        }));
    }

    async createEvent(accessToken: string, calendarId: string, event: GoogleEventPayload): Promise<any> {
        const encodedCalId = encodeURIComponent(calendarId);
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodedCalId}/events`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(event),
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(`Google createEvent failed (${res.status}): ${data.error?.message || res.statusText}`);
        }

        return data;
    }

    async updateEvent(accessToken: string, calendarId: string, eventId: string, event: GoogleEventPayload): Promise<any> {
        const encodedCalId = encodeURIComponent(calendarId);
        const encodedEventId = encodeURIComponent(eventId);
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodedCalId}/events/${encodedEventId}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(event),
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(`Google updateEvent failed (${res.status}): ${data.error?.message || res.statusText}`);
        }

        return data;
    }

    async deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
        const encodedCalId = encodeURIComponent(calendarId);
        const encodedEventId = encodeURIComponent(eventId);
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodedCalId}/events/${encodedEventId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok && res.status !== 404 && res.status !== 410) {
            const data = await res.json().catch(() => ({}));
            throw new Error(`Google deleteEvent failed (${res.status}): ${data.error?.message || res.statusText}`);
        }
    }

    async syncEvents(
        accessToken: string,
        calendarId: string,
        syncToken?: string,
        timeMin?: Date,
        timeMax?: Date
    ): Promise<GoogleSyncResponse> {
        const encodedCalId = encodeURIComponent(calendarId);
        const params = new URLSearchParams({
            singleEvents: "true",
            maxResults: "250",
        });

        if (syncToken) {
            params.set("syncToken", syncToken);
        } else {
            if (timeMin) params.set("timeMin", timeMin.toISOString());
            if (timeMax) params.set("timeMax", timeMax.toISOString());
        }

        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodedCalId}/events?${params.toString()}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (res.status === 410) {
            // Sync token is invalid or expired -> signal full resync required (PRD §74 / Architecture §80)
            this.logger.warn(`Google Calendar syncToken expired (HTTP 410 Gone). Triggering bounded full resync.`);
            const fallbackMin = timeMin || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const fallbackMax = timeMax || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
            return this.syncEvents(accessToken, calendarId, undefined, fallbackMin, fallbackMax).then((r) => ({
                ...r,
                isFullResync: true,
            }));
        }

        const data = await res.json();
        if (!res.ok) {
            throw new Error(`Google syncEvents failed (${res.status}): ${data.error?.message || res.statusText}`);
        }

        return {
            items: data.items || [],
            nextSyncToken: data.nextSyncToken,
            nextPageToken: data.nextPageToken,
        };
    }

    async registerWatch(accessToken: string, calendarId: string, webhookUrl: string, channelId: string, channelToken: string): Promise<GoogleWatchResponse> {
        const encodedCalId = encodeURIComponent(calendarId);
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodedCalId}/events/watch`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                id: channelId,
                type: "web_hook",
                address: webhookUrl,
                token: channelToken,
            }),
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(`Google registerWatch failed (${res.status}): ${data.error?.message || res.statusText}`);
        }

        return {
            channelId: data.id,
            resourceId: data.resourceId,
            expiration: data.expiration,
        };
    }

    async stopWatch(accessToken: string, channelId: string, resourceId: string): Promise<void> {
        const res = await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ id: channelId, resourceId }),
        });

        if (!res.ok && res.status !== 404) {
            const data = await res.json().catch(() => ({}));
            this.logger.warn(`Google stopWatch failed (${res.status}): ${data.error?.message || res.statusText}`);
        }
    }

    async revokeToken(token: string): Promise<void> {
        const body = new URLSearchParams({ token });
        await fetch("https://oauth2.googleapis.com/revoke", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
        }).catch((err) => {
            this.logger.warn(`Google revokeToken warning: ${err.message}`);
        });
    }
}
