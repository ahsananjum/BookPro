import { Injectable, Logger, Inject, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { OutboxService } from "../outbox/outbox.service";
import { GoogleOAuthService } from "./google-oauth.service";
import { CALENDAR_PROVIDER, CalendarProvider, EncryptionService } from "@bookpro/server-core";
import {
    GoogleConnectionStatusDto,
    GoogleCalendarSummaryDto,
    SelectGoogleCalendarInput,
    CalendarConnectionStatusEnum,
} from "@bookpro/contracts";

@Injectable()
export class CalendarConnectionService {
    private readonly logger = new Logger(CalendarConnectionService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly outboxService: OutboxService,
        private readonly oauthService: GoogleOAuthService,
        @Inject(CALENDAR_PROVIDER) private readonly calendarProvider: CalendarProvider,
    ) { }

    async getConnectionStatus(organizationId: string, staffId: string): Promise<GoogleConnectionStatusDto> {
        const connection = await this.prisma.googleCalendarConnection.findUnique({
            where: {
                organizationId_staffId_provider: {
                    organizationId,
                    staffId,
                    provider: "GOOGLE",
                },
            },
        });

        if (!connection) {
            return {
                organizationId,
                staffId,
                provider: "GOOGLE",
                status: CalendarConnectionStatusEnum.DISCONNECTED,
                isHealthy: false,
            };
        }

        return {
            id: connection.id,
            organizationId: connection.organizationId,
            staffId: connection.staffId,
            provider: connection.provider,
            selectedCalendarId: connection.selectedCalendarId,
            selectedCalendarName: connection.selectedCalendarName,
            status: connection.status as CalendarConnectionStatusEnum,
            lastSyncAt: connection.lastSyncAt ? connection.lastSyncAt.toISOString() : null,
            lastSuccessAt: connection.lastSuccessAt ? connection.lastSuccessAt.toISOString() : null,
            lastError: connection.lastError,
            channelExpiration: connection.channelExpiration ? connection.channelExpiration.toISOString() : null,
            isHealthy: connection.status === "CONNECTED",
        };
    }

    async listStaffCalendars(organizationId: string, staffId: string): Promise<GoogleCalendarSummaryDto[]> {
        const connection = await this.prisma.googleCalendarConnection.findUnique({
            where: {
                organizationId_staffId_provider: {
                    organizationId,
                    staffId,
                    provider: "GOOGLE",
                },
            },
        });

        if (!connection || connection.status === "DISCONNECTED") {
            throw new NotFoundException("Google Calendar is not connected for this staff member");
        }

        const accessToken = await this.oauthService.getValidAccessToken(connection.id);
        const calendars = await this.calendarProvider.listCalendars(accessToken);

        return calendars.map((cal) => ({
            id: cal.id,
            summary: cal.summary,
            description: cal.description,
            primary: cal.primary,
            timeZone: cal.timeZone,
            accessRole: cal.accessRole,
        }));
    }

    async selectCalendar(input: SelectGoogleCalendarInput, actorId?: string): Promise<GoogleConnectionStatusDto> {
        const { organizationId, staffId, calendarId, calendarName } = input;

        const connection = await this.prisma.googleCalendarConnection.findUnique({
            where: {
                organizationId_staffId_provider: {
                    organizationId,
                    staffId,
                    provider: "GOOGLE",
                },
            },
        });

        if (!connection) {
            throw new NotFoundException("Google Calendar is not connected for this staff member");
        }

        const updated = await this.prisma.googleCalendarConnection.update({
            where: { id: connection.id },
            data: {
                selectedCalendarId: calendarId,
                selectedCalendarName: calendarName || calendarId,
                syncCursor: null, // Reset cursor to trigger fresh sync for selected calendar
                status: "CONNECTED",
            },
        });

        // Trigger background initial sync for new calendar
        await this.triggerManualResync(organizationId, staffId);
        await this.prisma.auditLog.create({ data: { organizationId, actorType: "STAFF", actorId: actorId || "system", action: "calendar.google.calendar_selected", resourceType: "GoogleCalendarConnection", resourceId: updated.id, payload: { staffId, calendarId } } });

        return this.getConnectionStatus(organizationId, staffId);
    }

    async triggerManualResync(organizationId: string, staffId: string) {
        const connection = await this.prisma.googleCalendarConnection.findUnique({
            where: {
                organizationId_staffId_provider: {
                    organizationId,
                    staffId,
                    provider: "GOOGLE",
                },
            },
        });

        if (!connection) {
            throw new NotFoundException("Google Calendar is not connected");
        }

        await this.outboxService.emit({
            organizationId,
            aggregateType: "GoogleCalendarConnection",
            aggregateId: connection.id,
            eventType: "calendar.inbound_sync_requested",
            payload: {
                organizationId,
                staffId,
                connectionId: connection.id,
                reason: "MANUAL",
            },
        });

        return { success: true, message: "Manual synchronization requested" };
    }

    async disconnect(organizationId: string, staffId: string, actorId?: string) {
        const connection = await this.prisma.googleCalendarConnection.findUnique({
            where: {
                organizationId_staffId_provider: {
                    organizationId,
                    staffId,
                    provider: "GOOGLE",
                },
            },
        });

        if (!connection) {
            return { success: true, message: "Already disconnected" };
        }

        // Stop watch channel if registered
        if (connection.channelId && connection.resourceId) {
            try {
                const accessToken = await this.oauthService.getValidAccessToken(connection.id);
                await this.calendarProvider.stopWatch(accessToken, connection.channelId, connection.resourceId);
            } catch (err: any) {
                this.logger.warn(`Stop watch warning on disconnect: ${err.message}`);
            }
        }

        // Revoke token with Google
        try {
            const rawRefreshToken = EncryptionService.decrypt(connection.encryptedRefreshToken);
            await this.calendarProvider.revokeToken(rawRefreshToken);
        } catch (err: any) {
            this.logger.warn(`Revoke token warning on disconnect: ${err.message}`);
        }

        // Delete connection and imported external events
        await this.prisma.$transaction(async (tx) => {
            await tx.externalCalendarEvent.deleteMany({
                where: { connectionId: connection.id },
            });
            await tx.googleCalendarConnection.delete({
                where: { id: connection.id },
            });
            await tx.auditLog.create({ data: { organizationId, actorType: "STAFF", actorId: actorId || "system", action: "calendar.google.disconnected", resourceType: "GoogleCalendarConnection", resourceId: connection.id, payload: { staffId, provider: "GOOGLE" } } });
        });

        this.logger.log(`[GoogleConnection] Disconnected Google Calendar for staff ${staffId}`);

        return { success: true, message: "Google Calendar disconnected and external events removed" };
    }
}
