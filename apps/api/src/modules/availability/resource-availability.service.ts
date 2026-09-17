import { Injectable, ConflictException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { TimeInterval, Instant } from "@bookpro/server-core";

@Injectable()
export class ResourceAvailabilityService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Checks whether all required service resources or pool allocations are available
     * for the given candidate interval.
     */
    async checkResourceAvailability(
        organizationId: string,
        locationId: string,
        serviceId: string,
        candidateInterval: TimeInterval,
        requestedResourceIds: string[] = [],
    ): Promise<{ isAvailable: boolean; allocatedResourceIds: string[]; reason?: string }> {
        const serviceResources = await this.prisma.serviceResource.findMany({
            where: { serviceId },
            include: {
                resource: true,
                resourcePool: {
                    include: { resources: true },
                },
            },
        });

        if (serviceResources.length === 0 && requestedResourceIds.length === 0) {
            return { isAvailable: true, allocatedResourceIds: [] };
        }

        const allocatedResourceIds: string[] = [];

        // Fetch all schedule blocks impacting resources
        const blocks = await this.prisma.scheduleBlock.findMany({
            where: {
                organizationId,
                resourceId: { not: null },
            },
        });

        const isResourceBlocked = (resourceId: string): boolean => {
            const resBlocks = blocks.filter((b) => b.resourceId === resourceId);
            for (const b of resBlocks) {
                const bInt = new TimeInterval(Instant.fromDate(b.startAt), Instant.fromDate(b.endAt));
                if (candidateInterval.intersects(bInt)) {
                    return true;
                }
            }
            return false;
        };

        // 1. Direct explicit requested resources check
        for (const rId of requestedResourceIds) {
            if (isResourceBlocked(rId)) {
                return {
                    isAvailable: false,
                    allocatedResourceIds: [],
                    reason: `Requested resource ${rId} is blocked or unavailable during interval`,
                };
            }
            allocatedResourceIds.push(rId);
        }

        // 2. Service-level required resources & pools
        for (const sr of serviceResources) {
            if (sr.resourceId) {
                if (isResourceBlocked(sr.resourceId)) {
                    return {
                        isAvailable: false,
                        allocatedResourceIds: [],
                        reason: `Required resource ${sr.resource?.name || sr.resourceId} is unavailable`,
                    };
                }
                allocatedResourceIds.push(sr.resourceId);
            } else if (sr.resourcePoolId && sr.resourcePool) {
                const activePoolResources = sr.resourcePool.resources.filter(
                    (r) => r.isActive && r.locationId === locationId && !r.archivedAt,
                );
                const availableFromPool = activePoolResources.filter((r) => !isResourceBlocked(r.id));
                if (availableFromPool.length < sr.quantityRequired) {
                    return {
                        isAvailable: false,
                        allocatedResourceIds: [],
                        reason: `Resource pool ${sr.resourcePool.name} lacks ${sr.quantityRequired} available units`,
                    };
                }
                for (let i = 0; i < sr.quantityRequired; i++) {
                    allocatedResourceIds.push(availableFromPool[i].id);
                }
            }
        }

        return {
            isAvailable: true,
            allocatedResourceIds: Array.from(new Set(allocatedResourceIds)),
        };
    }
}
