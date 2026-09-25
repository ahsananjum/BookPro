import { Injectable, BadRequestException } from "@nestjs/common";
import { TimeInterval, Instant } from "@bookpro/server-core";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class CapacityAvailabilityService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Validates whether candidate interval has sufficient remaining capacity.
     * `maxCapacity - confirmedUnits - activeHoldUnits >= requestedPartySize`
     */
    async checkCapacity(
        organizationId: string,
        locationId: string,
        serviceId: string,
        candidateInterval: TimeInterval,
        requestedPartySize: number,
        serviceCapacity: number,
        staffId?: string | null,
    ): Promise<{ hasCapacity: boolean; availableCapacity: number; reason?: string }> {
        if (requestedPartySize > serviceCapacity) {
            return {
                hasCapacity: false,
                availableCapacity: 0,
                reason: `Requested party size ${requestedPartySize} exceeds maximum service capacity ${serviceCapacity}`,
            };
        }

        let confirmedCount = 0;
        let holdCount = 0;

        const prismaAny = this.prisma as any;

        // Count confirmed/in-progress appointments overlapping candidate interval
        if (prismaAny.appointment) {
            const appointments = await prismaAny.appointment.findMany({
                where: {
                    organizationId,
                    locationId,
                    OR: [
                        { serviceId },
                        ...(staffId ? [{ staffId }] : []),
                    ],
                    status: { notIn: ["CANCELLED", "NO_SHOW"] },
                    startAt: { lt: candidateInterval.end.toDate() },
                    endAt: { gt: candidateInterval.start.toDate() },
                },
            });
            for (const app of appointments) {
                confirmedCount += app.partySize || 1;
            }
        }

        // Count active non-expired holds overlapping candidate interval
        if (prismaAny.bookingHold) {
            const now = new Date();
            const holds = await prismaAny.bookingHold.findMany({
                where: {
                    organizationId,
                    locationId,
                    OR: [
                        { serviceId },
                        ...(staffId ? [{ staffId }] : []),
                    ],
                    status: { in: ["ACTIVE", "HELD"] },
                    expiresAt: { gt: now },
                    startAt: { lt: candidateInterval.end.toDate() },
                    endAt: { gt: candidateInterval.start.toDate() },
                },
            });
            for (const hold of holds) {
                holdCount += hold.partySize || 1;
            }
        }

        const availableCapacity = serviceCapacity - (confirmedCount + holdCount);

        if (availableCapacity < requestedPartySize) {
            return {
                hasCapacity: false,
                availableCapacity: Math.max(0, availableCapacity),
                reason: `Insufficient capacity: remaining ${Math.max(0, availableCapacity)} < requested ${requestedPartySize}`,
            };
        }

        return {
            hasCapacity: true,
            availableCapacity,
        };
    }
}
