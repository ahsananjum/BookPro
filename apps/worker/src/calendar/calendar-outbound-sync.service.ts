import { Injectable, Logger, Inject } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { CALENDAR_PROVIDER, CalendarProvider, EncryptionService, RetryClassifier } from "@bookpro/server-core";

@Injectable()
export class CalendarOutboundSyncService {
    private readonly logger = new Logger(CalendarOutboundSyncService.name);

    @Inject(CALENDAR_PROVIDER)
    private readonly calendarProvider!: CalendarProvider;

    constructor(
        private readonly prisma: PrismaService,
    ) { }

    private async getValidAccessToken(connection: any): Promise<string> {
        const now = new Date();
        const bufferMs = 60 * 1000;

        if (
            connection.encryptedAccessToken &&
            connection.accessTokenExpiresAt &&
            new Date(connection.accessTokenExpiresAt).getTime() > now.getTime() + bufferMs
        ) {
            return EncryptionService.decrypt(connection.encryptedAccessToken);
        }

        const rawRefreshToken = EncryptionService.decrypt(connection.encryptedRefreshToken);
        const { accessToken, expiresIn } = await this.calendarProvider.refreshAccessToken(rawRefreshToken);
        const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

        await this.prisma.googleCalendarConnection.update({
            where: { id: connection.id },
            data: {
                encryptedAccessToken: EncryptionService.encrypt(accessToken),
                accessTokenExpiresAt: newExpiresAt,
                status: "CONNECTED",
                lastError: null,
            },
        });

        return accessToken;
    }

    /**
     * Handles appointment.confirmed outbox event -> creates event in staff's Google Calendar
     */
    async handleAppointmentConfirmed(payload: { appointmentId: string; organizationId: string }): Promise<void> {
        const { appointmentId, organizationId } = payload;

        const appointment = await this.prisma.appointment.findUnique({
            where: { id: appointmentId },
            include: {
                staff: true,
                service: true,
                customer: true,
                location: true,
            },
        });

        if (!appointment || !appointment.staffId) {
            return;
        }

        const connection = await this.prisma.googleCalendarConnection.findUnique({
            where: {
                organizationId_staffId_provider: {
                    organizationId,
                    staffId: appointment.staffId,
                    provider: "GOOGLE",
                },
            },
        });

        if (!connection || connection.status === "DISCONNECTED") {
            return;
        }

        try {
            const accessToken = await this.getValidAccessToken(connection);
            const calendarId = connection.selectedCalendarId || "primary";

            const summary = `${appointment.service.name} - ${appointment.customer.fullName}`;
            const description = `BookPro Confirmed Booking\nService: ${appointment.service.name}\nCustomer: ${appointment.customer.fullName} (${appointment.customer.email})\nAppointment ID: ${appointment.id}\nVersion: ${appointment.version}`;

            const googleEvent = await this.calendarProvider.createEvent(accessToken, calendarId, {
                summary,
                description,
                location: appointment.location ? `${appointment.location.name}, ${appointment.location.address || ""}` : undefined,
                start: {
                    dateTime: appointment.startAt.toISOString(),
                    timeZone: appointment.location?.timezone || "UTC",
                },
                end: {
                    dateTime: appointment.endAt.toISOString(),
                    timeZone: appointment.location?.timezone || "UTC",
                },
                attendees: appointment.customer?.email ? [
                    {
                        email: appointment.customer.email,
                        displayName: appointment.customer.fullName || undefined,
                        responseStatus: "accepted",
                    },
                ] : undefined,
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: "popup", minutes: 60 },
                        { method: "email", minutes: 1440 },
                    ],
                },
                transparency: "opaque",
                extendedProperties: {
                    private: {
                        bookProAppointmentId: appointment.id,
                        organizationId: appointment.organizationId,
                        version: String(appointment.version),
                    },
                },
            });

            // Upsert mapping record in ExternalCalendarEvent (isBusy: false for BookPro mapped events to avoid duplicate blocking)
            await this.prisma.externalCalendarEvent.upsert({
                where: {
                    connectionId_providerEventId: {
                        connectionId: connection.id,
                        providerEventId: googleEvent.id,
                    },
                },
                create: {
                    organizationId,
                    staffId: appointment.staffId,
                    connectionId: connection.id,
                    providerEventId: googleEvent.id,
                    calendarId,
                    appointmentId: appointment.id,
                    title: summary,
                    startAt: appointment.startAt,
                    endAt: appointment.endAt,
                    isAllDay: false,
                    isBusy: false, // Mapped BookPro events do not duplicate busy block in availability
                    etag: googleEvent.etag,
                    status: "CONFIRMED",
                    version: appointment.version,
                    lastSyncedAt: new Date(),
                },
                update: {
                    appointmentId: appointment.id,
                    startAt: appointment.startAt,
                    endAt: appointment.endAt,
                    etag: googleEvent.etag,
                    status: "CONFIRMED",
                    version: appointment.version,
                    lastSyncedAt: new Date(),
                },
            });

            await this.prisma.googleCalendarConnection.update({
                where: { id: connection.id },
                data: {
                    status: "CONNECTED",
                    lastSuccessAt: new Date(),
                    lastSyncAt: new Date(),
                    lastError: null,
                },
            });

            this.logger.log(`[GoogleOutbound] Pushed appointment ${appointment.id} to Google Calendar (Event: ${googleEvent.id})`);
        } catch (err: any) {
            this.logger.error(`[GoogleOutbound] Failed to push appointment ${appointment.id} to Google: ${err.message}`);
            // Invariance: Internal BookPro appointment remains 100% authoritative and valid
            const isTerminal = err.message?.includes("invalid_grant") || err.status === 401;
            await this.prisma.googleCalendarConnection.update({
                where: { id: connection.id },
                data: {
                    status: isTerminal ? "ACTION_REQUIRED" : "DEGRADED",
                    lastError: `Outbound push error: ${err.message}`,
                },
            });
        }
    }

    /**
     * Handles appointment.rescheduled outbox event -> updates event in staff's Google Calendar
     */
    async handleAppointmentRescheduled(payload: { appointmentId: string; organizationId: string }): Promise<void> {
        const { appointmentId, organizationId } = payload;

        const appointment = await this.prisma.appointment.findUnique({
            where: { id: appointmentId },
            include: {
                staff: true,
                service: true,
                customer: true,
                location: true,
            },
        });

        if (!appointment || !appointment.staffId) return;

        const connection = await this.prisma.googleCalendarConnection.findUnique({
            where: {
                organizationId_staffId_provider: {
                    organizationId,
                    staffId: appointment.staffId,
                    provider: "GOOGLE",
                },
            },
        });

        if (!connection || connection.status === "DISCONNECTED") return;

        const externalEvent = await this.prisma.externalCalendarEvent.findFirst({
            where: {
                connectionId: connection.id,
                appointmentId: appointment.id,
            },
        });

        if (!externalEvent) {
            // If not found in mapping, create fresh
            return this.handleAppointmentConfirmed(payload);
        }

        try {
            const accessToken = await this.getValidAccessToken(connection);
            const calendarId = connection.selectedCalendarId || "primary";

            const summary = `${appointment.service.name} - ${appointment.customer.fullName}`;
            const description = `BookPro Confirmed Booking (Rescheduled)\nService: ${appointment.service.name}\nCustomer: ${appointment.customer.fullName} (${appointment.customer.email})\nAppointment ID: ${appointment.id}\nVersion: ${appointment.version}`;

            const updatedGoogleEvent = await this.calendarProvider.updateEvent(
                accessToken,
                calendarId,
                externalEvent.providerEventId,
                {
                    summary,
                    description,
                    location: appointment.location ? `${appointment.location.name}, ${appointment.location.address || ""}` : undefined,
                    start: {
                        dateTime: appointment.startAt.toISOString(),
                        timeZone: appointment.location?.timezone || "UTC",
                    },
                    end: {
                        dateTime: appointment.endAt.toISOString(),
                        timeZone: appointment.location?.timezone || "UTC",
                    },
                    attendees: appointment.customer?.email ? [
                        {
                            email: appointment.customer.email,
                            displayName: appointment.customer.fullName || undefined,
                            responseStatus: "accepted",
                        },
                    ] : undefined,
                    reminders: {
                        useDefault: false,
                        overrides: [
                            { method: "popup", minutes: 60 },
                            { method: "email", minutes: 1440 },
                        ],
                    },
                    transparency: "opaque",
                    extendedProperties: {
                        private: {
                            bookProAppointmentId: appointment.id,
                            organizationId: appointment.organizationId,
                            version: String(appointment.version),
                        },
                    },
                }
            );

            await this.prisma.externalCalendarEvent.update({
                where: { id: externalEvent.id },
                data: {
                    startAt: appointment.startAt,
                    endAt: appointment.endAt,
                    etag: updatedGoogleEvent.etag,
                    version: appointment.version,
                    lastSyncedAt: new Date(),
                },
            });

            await this.prisma.googleCalendarConnection.update({
                where: { id: connection.id },
                data: {
                    status: "CONNECTED",
                    lastSuccessAt: new Date(),
                    lastSyncAt: new Date(),
                    lastError: null,
                },
            });

            this.logger.log(`[GoogleOutbound] Updated rescheduled appointment ${appointment.id} in Google Calendar`);
        } catch (err: any) {
            this.logger.error(`[GoogleOutbound] Failed to update rescheduled appointment ${appointment.id} in Google: ${err.message}`);
            await this.prisma.googleCalendarConnection.update({
                where: { id: connection.id },
                data: {
                    status: "DEGRADED",
                    lastError: `Reschedule sync error: ${err.message}`,
                },
            });
        }
    }

    /**
     * Handles appointment.cancelled outbox event -> deletes event from all synced Google Calendars (staff and owner)
     */
    async handleAppointmentCancelled(payload: { appointmentId: string; organizationId: string }): Promise<void> {
        const { appointmentId, organizationId } = payload;

        const externalEvents = await this.prisma.externalCalendarEvent.findMany({
            where: { appointmentId, organizationId },
            include: { connection: true },
        });

        if (!externalEvents || externalEvents.length === 0) return;

        for (const externalEvent of externalEvents) {
            if (!externalEvent || !externalEvent.connection) continue;

            const connection = externalEvent.connection;
            if (connection.status === "DISCONNECTED") continue;

            try {
                const accessToken = await this.getValidAccessToken(connection);
                const calendarId = connection.selectedCalendarId || "primary";

                await this.calendarProvider.deleteEvent(accessToken, calendarId, externalEvent.providerEventId);

                await this.prisma.externalCalendarEvent.update({
                    where: { id: externalEvent.id },
                    data: {
                        status: "CANCELLED",
                        lastSyncedAt: new Date(),
                    },
                });

                await this.prisma.googleCalendarConnection.update({
                    where: { id: connection.id },
                    data: {
                        lastSuccessAt: new Date(),
                        lastSyncAt: new Date(),
                    },
                });

                this.logger.log(`[GoogleOutbound] Deleted cancelled appointment ${appointmentId} from Google Calendar (${calendarId})`);
            } catch (err: any) {
                this.logger.warn(`[GoogleOutbound] Non-critical warning deleting appointment ${appointmentId} from Google Calendar: ${err.message}`);
            }
        }
    }
}
