import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { TimeInterval, Instant } from "@bookpro/server-core";

export interface BusyInterval {
    interval: TimeInterval;
    source: "APPOINTMENT" | "HOLD" | "SCHEDULE_BLOCK" | "EXTERNAL";
    staffId?: string | null;
    locationId?: string | null;
    resourceId?: string | null;
}

@Injectable()
export class BusyIntervalRepository {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Fetches all active busy intervals for staff, location, or resources,
     * including ScheduleBlocks, confirmed Appointments, active non-expired Holds.
     */
    async fetchBusyIntervals(
        organizationId: string,
        locationId: string,
        staffIds: string[],
        startInstant: Instant,
        endInstant: Instant,
    ): Promise<BusyInterval[]> {
        const busyIntervals: BusyInterval[] = [];

        // 1. Fetch ScheduleBlocks
        const scheduleBlocks = await this.prisma.scheduleBlock.findMany({
            where: {
                organizationId,
                OR: [
                    { locationId },
                    { staffId: { in: staffIds } },
                    { staffId: null, locationId: null },
                ],
                startAt: { lt: endInstant.toDate() },
                endAt: { gt: startInstant.toDate() },
            },
        });

        for (const b of scheduleBlocks) {
            busyIntervals.push({
                interval: new TimeInterval(Instant.fromDate(b.startAt), Instant.fromDate(b.endAt)),
                source: "SCHEDULE_BLOCK",
                staffId: b.staffId,
                locationId: b.locationId,
                resourceId: b.resourceId,
            });
        }

        // 2. Fetch Appointments & Booking Holds dynamically if Prisma delegate exists
        const prismaAny = this.prisma as any;

        if (prismaAny.appointment) {
            const appointments = await prismaAny.appointment.findMany({
                where: {
                    organizationId,
                    locationId,
                    staffId: { in: staffIds },
                    status: { notIn: ["CANCELLED", "NO_SHOW"] },
                    startAt: { lt: endInstant.toDate() },
                    endAt: { gt: startInstant.toDate() },
                },
            });
            for (const app of appointments) {
                busyIntervals.push({
                    interval: new TimeInterval(Instant.fromDate(app.startAt), Instant.fromDate(app.endAt)),
                    source: "APPOINTMENT",
                    staffId: app.staffId,
                    locationId: app.locationId,
                });
            }
        }

        if (prismaAny.bookingHold) {
            const now = new Date();
            const holds = await prismaAny.bookingHold.findMany({
                where: {
                    organizationId,
                    locationId,
                    OR: [{ staffId: { in: staffIds } }, { staffId: null }],
                    status: { in: ["ACTIVE", "HELD"] },
                    expiresAt: { gt: now },
                    startAt: { lt: endInstant.toDate() },
                    endAt: { gt: startInstant.toDate() },
                },
            });
            for (const hold of holds) {
                busyIntervals.push({
                    interval: new TimeInterval(Instant.fromDate(hold.startAt), Instant.fromDate(hold.endAt)),
                    source: "HOLD",
                    staffId: hold.staffId,
                    locationId: hold.locationId,
                });
            }
        }

        // 3. Fetch Normalized External Calendar Busy Blocks (Phase P8 / PRD §74 / Architecture §75)
        if (prismaAny.externalCalendarEvent) {
            const externalEvents = await prismaAny.externalCalendarEvent.findMany({
                where: {
                    organizationId,
                    staffId: { in: staffIds },
                    isBusy: true,
                    status: "CONFIRMED",
                    appointmentId: null, // Loop Prevention: mapped BookPro appointments are already counted in (2)
                    startAt: { lt: endInstant.toDate() },
                    endAt: { gt: startInstant.toDate() },
                },
            });
            for (const evt of externalEvents) {
                busyIntervals.push({
                    interval: new TimeInterval(Instant.fromDate(evt.startAt), Instant.fromDate(evt.endAt)),
                    source: "EXTERNAL",
                    staffId: evt.staffId,
                });
            }
        }

        return busyIntervals;
    }
}
