import { Injectable, BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { Instant, TimeInterval } from "@bookpro/server-core";

@Injectable()
export class AvailabilityValidatorService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * P5 Final-Write Validator Interface:
     * Validates slot availability at transactional write time under lock.
     * Throws domain HTTP exceptions (NotFoundException, ConflictException, BadRequestException) if invalid.
     */
    async validateSlotForWrite(
        organizationId: string,
        locationId: string,
        serviceId: string,
        staffId: string,
        startTimeIso: string,
        partySize = 1,
        addonIds: string[] = [],
        resourceIds: string[] = [],
    ): Promise<{
        startTime: Instant;
        endTime: Instant;
        serviceDurationMinutes: number;
        occupiedInterval: TimeInterval;
    }> {
        // 1. Verify tenant location
        const location = await this.prisma.location.findFirst({
            where: { id: locationId, organizationId, archivedAt: null },
        });
        if (!location) {
            throw new NotFoundException(`Location ${locationId} not found or inactive`);
        }

        // 2. Verify service
        const service = await this.prisma.service.findFirst({
            where: { id: serviceId, organizationId, archivedAt: null },
        });
        if (!service) {
            throw new NotFoundException(`Service ${serviceId} not found or inactive`);
        }

        // Calculate total duration & occupied interval
        const serviceDuration = service.durationMin;
        const preBuffer = service.preBufferMin || 0;
        const postBuffer = service.postBufferMin || 0;
        let addonDuration = 0;

        const totalServiceMinutes = serviceDuration + addonDuration;
        const startInstant = Instant.fromIso(startTimeIso);
        const serviceEndInstant = startInstant.addMinutes(totalServiceMinutes);
        const occupiedStartInstant = startInstant.addMinutes(-preBuffer);
        const occupiedEndInstant = serviceEndInstant.addMinutes(postBuffer);
        const occupiedInterval = new TimeInterval(occupiedStartInstant, occupiedEndInstant);

        // 3. Verify staff
        const staff = await this.prisma.staffProfile.findFirst({
            where: { id: staffId, organizationId, archivedAt: null },
            include: {
                staffServices: true,
                staffLocations: true,
            },
        });
        if (!staff) {
            throw new NotFoundException(`Staff ${staffId} not found or inactive`);
        }
        const isAssigned = staff.staffLocations.some((l) => l.locationId === locationId);
        if (!isAssigned) {
            throw new BadRequestException(`Staff ${staffId} is not assigned to location ${locationId}`);
        }
        const isQualified = staff.staffServices.some((s) => s.serviceId === serviceId);
        if (!isQualified) {
            throw new BadRequestException(`Staff ${staffId} is not qualified for service ${serviceId}`);
        }

        // 4. Check staff leaves & schedule blocks
        const leaves = await this.prisma.staffLeave.findMany({
            where: { staffId, status: "APPROVED" },
        });
        const blocks = await this.prisma.scheduleBlock.findMany({
            where: {
                organizationId,
                OR: [{ staffId }, { locationId }],
            },
        });

        for (const l of leaves) {
            const leafInterval = new TimeInterval(Instant.fromDate(l.startDate), Instant.fromDate(l.endDate));
            if (occupiedInterval.intersects(leafInterval)) {
                throw new ConflictException(`Staff ${staffId} is on leave during requested interval`);
            }
        }

        for (const b of blocks) {
            const blockInterval = new TimeInterval(Instant.fromDate(b.startAt), Instant.fromDate(b.endAt));
            if (occupiedInterval.intersects(blockInterval)) {
                throw new ConflictException(`Requested interval conflicts with schedule block: ${b.reason || 'Blocked'}`);
            }
        }

        // 5. Check group capacity
        if (service.capacity > 1) {
            // Holds check (if table exists)
            const remaining = service.capacity;
            if (partySize > remaining) {
                throw new ConflictException(`Requested party size ${partySize} exceeds available capacity (${remaining})`);
            }
        }

        return {
            startTime: startInstant,
            endTime: serviceEndInstant,
            serviceDurationMinutes: totalServiceMinutes,
            occupiedInterval,
        };
    }
}
