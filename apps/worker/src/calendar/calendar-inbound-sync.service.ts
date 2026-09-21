import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { CalendarProvider, EncryptionService, RedisService } from "@bookpro/server-core";

@Injectable()
export class CalendarInboundSyncService {
    private readonly logger = new Logger(CalendarInboundSyncService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly calendarProvider: CalendarProvider,
        private readonly redisService?: RedisService,
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
     * Executes inbound synchronization for a specific Google Calendar connection
     */
    async syncConnection(connectionId: string): Promise<{ syncedCount: number; conflictsCount: number; isFullResync: boolean }> {
        const connection = await this.prisma.googleCalendarConnection.findUnique({
            where: { id: connectionId },
            include: { staff: true },
        });

        if (!connection || connection.status === "DISCONNECTED") {
            return { syncedCount: 0, conflictsCount: 0, isFullResync: false };
        }

        let syncedCount = 0;
        let conflictsCount = 0;
        let isFullResync = false;

        try {
            const accessToken = await this.getValidAccessToken(connection);
            const calendarId = connection.selectedCalendarId || "primary";

            // Bounded window for initial/full resync: -7 days to +90 days
            const timeMin = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

            const syncResult = await this.calendarProvider.syncEvents(
                accessToken,
                calendarId,
                connection.syncCursor || undefined,
                timeMin,
                timeMax
            );

            isFullResync = !!syncResult.isFullResync;

            const items = syncResult.items || [];
            for (const item of items) {
                // Handle cancellation
                if (item.status === "cancelled") {
                    await this.prisma.externalCalendarEvent.updateMany({
                        where: {
                            connectionId: connection.id,
                            providerEventId: item.id,
                        },
                        data: {
                            status: "CANCELLED",
                            lastSyncedAt: new Date(),
                        },
                    });
                    syncedCount++;
                    continue;
                }

                // Determine start and end timestamps (normalizing all-day events)
                let startAt: Date;
                let endAt: Date;
                let isAllDay = false;

                if (item.start?.date) {
                    isAllDay = true;
                    // All-day event: 'YYYY-MM-DD'
                    startAt = new Date(`${item.start.date}T00:00:00.000Z`);
                    // Google all-day end date is exclusive next day
                    const rawEndDate = item.end?.date ? new Date(`${item.end.date}T00:00:00.000Z`) : new Date(startAt.getTime() + 24 * 60 * 60 * 1000);
                    endAt = new Date(rawEndDate.getTime() - 1); // 23:59:59.999Z
                } else if (item.start?.dateTime) {
                    startAt = new Date(item.start.dateTime);
                    endAt = item.end?.dateTime ? new Date(item.end.dateTime) : new Date(startAt.getTime() + 60 * 60 * 1000);
                } else {
                    continue; // Skip invalid event payload
                }

                // Check Loop Prevention: Does this event originate from BookPro? (Architecture §78 / PRD §74)
                const bookProAppointmentId =
                    item.extendedProperties?.private?.bookProAppointmentId ||
                    item.extendedProperties?.shared?.bookProAppointmentId;

                // Check existing mapping
                const existingMapping = await this.prisma.externalCalendarEvent.findUnique({
                    where: {
                        connectionId_providerEventId: {
                            connectionId: connection.id,
                            providerEventId: item.id,
                        },
                    },
                });

                let linkedApptId: string | null = null;
                if (bookProAppointmentId) {
                    const appt = await this.prisma.appointment.findUnique({
                        where: { id: bookProAppointmentId },
                    });
                    if (appt) linkedApptId = appt.id;
                } else if (existingMapping?.appointmentId) {
                    linkedApptId = existingMapping.appointmentId;
                }

                const isBookProOrigin = !!linkedApptId;

                const isBusy = item.transparency !== "transparent";

                if (isBookProOrigin) {
                    // Loop Prevention: Update metadata, but do NOT duplicate external busy block (isBusy: false)
                    await this.prisma.externalCalendarEvent.upsert({
                        where: {
                            connectionId_providerEventId: {
                                connectionId: connection.id,
                                providerEventId: item.id,
                            },
                        },
                        create: {
                            organizationId: connection.organizationId,
                            staffId: connection.staffId,
                            connectionId: connection.id,
                            providerEventId: item.id,
                            calendarId,
                            appointmentId: linkedApptId,
                            title: item.summary || "BookPro Appointment",
                            startAt,
                            endAt,
                            isAllDay,
                            isBusy: false, // Prevent duplicate block in availability
                            etag: item.etag,
                            status: "CONFIRMED",
                            lastSyncedAt: new Date(),
                        },
                        update: {
                            appointmentId: linkedApptId || undefined,
                            startAt,
                            endAt,
                            isAllDay,
                            isBusy: false,
                            etag: item.etag,
                            status: "CONFIRMED",
                            lastSyncedAt: new Date(),
                        },
                    });
                } else {
                    // Pure External Google Calendar Event (e.g. personal dentist appointment, meeting)
                    const externalRecord = await this.prisma.externalCalendarEvent.upsert({
                        where: {
                            connectionId_providerEventId: {
                                connectionId: connection.id,
                                providerEventId: item.id,
                            },
                        },
                        create: {
                            organizationId: connection.organizationId,
                            staffId: connection.staffId,
                            connectionId: connection.id,
                            providerEventId: item.id,
                            calendarId,
                            appointmentId: null,
                            title: item.summary || "Busy (External Event)", // Stored for internal staff view only
                            startAt,
                            endAt,
                            isAllDay,
                            isBusy,
                            etag: item.etag,
                            status: "CONFIRMED",
                            lastSyncedAt: new Date(),
                        },
                        update: {
                            title: item.summary || "Busy (External Event)",
                            startAt,
                            endAt,
                            isAllDay,
                            isBusy,
                            etag: item.etag,
                            status: "CONFIRMED",
                            lastSyncedAt: new Date(),
                        },
                    });

                    // External Conflict Detection (Architecture §79 / PRD §74):
                    // If external busy block overlaps an already-confirmed BookPro booking -> record conflict without cancelling booking
                    if (isBusy) {
                        const overlappingAppts = await this.prisma.appointment.findMany({
                            where: {
                                organizationId: connection.organizationId,
                                staffId: connection.staffId,
                                status: { in: ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] },
                                startAt: { lt: endAt },
                                endAt: { gt: startAt },
                            },
                        });

                        for (const appt of overlappingAppts) {
                            await this.prisma.calendarSyncConflict.upsert({
                                where: {
                                    appointmentId_externalEventId: {
                                        appointmentId: appt.id,
                                        externalEventId: externalRecord.id,
                                    },
                                },
                                create: {
                                    organizationId: connection.organizationId,
                                    staffId: connection.staffId,
                                    appointmentId: appt.id,
                                    externalEventId: externalRecord.id,
                                    conflictStartAt: startAt > appt.startAt ? startAt : appt.startAt,
                                    conflictEndAt: endAt < appt.endAt ? endAt : appt.endAt,
                                    resolved: false,
                                },
                                update: {
                                    conflictStartAt: startAt > appt.startAt ? startAt : appt.startAt,
                                    conflictEndAt: endAt < appt.endAt ? endAt : appt.endAt,
                                },
                            });
                            conflictsCount++;
                            this.logger.warn(
                                `[GoogleInbound] Conflict detected: External event ${item.id} overlaps BookPro appointment ${appt.id}. BookPro appointment preserved.`
                            );
                        }
                    }
                }
                syncedCount++;
            }

            // Save new sync cursor and mark connection healthy
            await this.prisma.googleCalendarConnection.update({
                where: { id: connection.id },
                data: {
                    syncCursor: syncResult.nextSyncToken || connection.syncCursor,
                    status: "CONNECTED",
                    lastSuccessAt: new Date(),
                    lastSyncAt: new Date(),
                    lastError: null,
                },
            });

            // Availability Cache Invalidation & SSE broadcast (PRD §63 / Architecture §120)
            if (this.redisService && this.redisService.getIsConnected()) {
                await this.redisService.delPrefix(`bookpro:${connection.organizationId}:availability:`);
                await this.redisService.publish(`realtime:${connection.organizationId}`, {
                    type: "availability.updated",
                    entityId: connection.staffId,
                    organizationId: connection.organizationId,
                    timestamp: new Date().toISOString(),
                });
            }

            this.logger.log(
                `[GoogleInbound] Synced ${syncedCount} events for staff ${connection.staffId} (Full Resync: ${isFullResync}, Conflicts: ${conflictsCount})`
            );

            return { syncedCount, conflictsCount, isFullResync };
        } catch (err: any) {
            this.logger.error(`[GoogleInbound] Sync failed for connection ${connectionId}: ${err.message}`);
            const isTerminal = err.message?.includes("invalid_grant") || err.status === 401;
            await this.prisma.googleCalendarConnection.update({
                where: { id: connection.id },
                data: {
                    status: isTerminal ? "ACTION_REQUIRED" : "DEGRADED",
                    lastError: `Inbound sync error: ${err.message}`,
                },
            });
            throw err;
        }
    }
}
