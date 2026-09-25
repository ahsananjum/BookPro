import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RedisService } from '@bookpro/server-core';
import { CreateLocationDto, UpdateLocationDto, LocationHolidayDto } from '@bookpro/contracts';

@Injectable()
export class LocationService {
    private readonly logger = new Logger(LocationService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly realtimeService: RealtimeService,
        private readonly redisService: RedisService,
    ) { }

    private async invalidateAvailabilityCache(organizationId: string) {
        try {
            if (this.redisService && this.redisService.getIsConnected()) {
                await this.redisService.delPrefix(RedisService.buildKey(organizationId, "availability"));
            }
        } catch (err: any) {
            this.logger.warn(`[LocationService] Failed to invalidate slot cache: ${err.message}`);
        }
    }

    private get locationInclude() {
        return {
            staffLocations: {
                include: {
                    staff: {
                        select: {
                            id: true,
                            displayName: true,
                            title: true,
                            avatarUrl: true,
                            bookingVisible: true,
                            membership: {
                                select: {
                                    roleCode: true,
                                },
                            },
                        },
                    },
                },
            },
            resources: {
                select: {
                    id: true,
                    name: true,
                    type: true,
                },
            },
            locationHolidays: {
                where: {
                    date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
                },
                orderBy: { date: 'asc' as const },
                take: 30,
            },
            _count: {
                select: {
                    staffLocations: true,
                    resources: true,
                    appointments: true,
                },
            },
        };
    }

    async getLocations(organizationId: string) {
        return this.prisma.location.findMany({
            where: {
                organizationId,
                archivedAt: null,
            },
            include: this.locationInclude,
            orderBy: { createdAt: 'asc' },
        });
    }

    async getLocationById(organizationId: string, locationId: string) {
        const location = await this.prisma.location.findFirst({
            where: {
                id: locationId,
                organizationId,
                archivedAt: null,
            },
            include: this.locationInclude,
        });

        if (!location) {
            throw new NotFoundException('Location branch not found');
        }

        return location;
    }

    async createLocation(organizationId: string, dto: CreateLocationDto) {
        // Prevent silent overwrite and ensure distinct branch identity
        const existing = await this.prisma.location.findFirst({
            where: {
                organizationId,
                slug: dto.slug,
            },
        });

        if (existing) {
            if (!existing.archivedAt) {
                throw new ConflictException(
                    `A branch location with slug '${dto.slug}' already exists in your organization. Please choose a unique branch name or slug.`
                );
            }
            // If previous branch with this slug was archived, free up the slug
            await this.prisma.location.update({
                where: { id: existing.id },
                data: { slug: `${existing.slug}_archived_${Date.now()}` },
            });
        }

        const created = await this.prisma.$transaction(async (tx) => {
            const loc = await tx.location.create({
                data: {
                    organizationId,
                    name: dto.name,
                    slug: dto.slug,
                    timezone: dto.timezone,
                    address: dto.address,
                    city: dto.city,
                    state: dto.state,
                    postalCode: dto.postalCode,
                    country: dto.country || 'US',
                    phone: dto.phone,
                    email: dto.email,
                    operatingHours: (dto.operatingHours || {}) as any,
                    instructions: dto.instructions,
                    parkingAccess: dto.parkingAccess,
                    taxRatePct: dto.taxRatePct,
                },
            });

            // If staffIds provided, link staff to this location
            if (Array.isArray(dto.staffIds) && dto.staffIds.length > 0) {
                const validStaff = await tx.staffProfile.findMany({
                    where: {
                        organizationId,
                        id: { in: dto.staffIds },
                        archivedAt: null,
                    },
                    select: { id: true },
                });

                if (validStaff.length > 0) {
                    await tx.staffLocation.createMany({
                        data: validStaff.map((s) => ({
                            locationId: loc.id,
                            staffId: s.id,
                        })),
                        skipDuplicates: true,
                    });
                }
            }

            return loc;
        });

        await this.invalidateAvailabilityCache(organizationId);

        // Real-Time live broadcast across cluster & SSE clients
        await this.realtimeService.broadcastEvent({
            type: 'location.created',
            organizationId,
            entityId: created.id,
            timestamp: new Date().toISOString(),
            reconnectStrategy: 'canonical_refetch',
            metadata: { locationId: created.id, name: created.name, slug: created.slug },
        }).catch((err) => this.logger.warn(`[LocationService] Broadcast failed: ${err.message}`));

        return this.getLocationById(organizationId, created.id);
    }

    async updateLocation(organizationId: string, locationId: string, dto: UpdateLocationDto) {
        const currentLoc = await this.getLocationById(organizationId, locationId);

        if (dto.slug && dto.slug !== currentLoc.slug) {
            const conflict = await this.prisma.location.findFirst({
                where: {
                    organizationId,
                    slug: dto.slug,
                    id: { not: locationId },
                    archivedAt: null,
                },
            });
            if (conflict) {
                throw new ConflictException(
                    `A branch location with slug '${dto.slug}' already exists in your organization.`
                );
            }
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.location.update({
                where: { id: locationId },
                data: {
                    ...(dto.name && { name: dto.name }),
                    ...(dto.slug && { slug: dto.slug }),
                    ...(dto.timezone && { timezone: dto.timezone }),
                    ...(dto.address !== undefined && { address: dto.address }),
                    ...(dto.city !== undefined && { city: dto.city }),
                    ...(dto.state !== undefined && { state: dto.state }),
                    ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
                    ...(dto.country && { country: dto.country }),
                    ...(dto.phone !== undefined && { phone: dto.phone }),
                    ...(dto.email !== undefined && { email: dto.email }),
                    ...(dto.operatingHours !== undefined && { operatingHours: dto.operatingHours as any }),
                    ...(dto.instructions !== undefined && { instructions: dto.instructions }),
                    ...(dto.parkingAccess !== undefined && { parkingAccess: dto.parkingAccess }),
                    ...(dto.taxRatePct !== undefined && { taxRatePct: dto.taxRatePct }),
                },
            });

            // Synchronize staff assignments if provided
            if (dto.staffIds !== undefined && Array.isArray(dto.staffIds)) {
                // Delete staff assignments not in dto.staffIds
                await tx.staffLocation.deleteMany({
                    where: {
                        locationId,
                        staffId: { notIn: dto.staffIds },
                    },
                });

                if (dto.staffIds.length > 0) {
                    const validStaff = await tx.staffProfile.findMany({
                        where: {
                            organizationId,
                            id: { in: dto.staffIds },
                            archivedAt: null,
                        },
                        select: { id: true },
                    });

                    for (const st of validStaff) {
                        await tx.staffLocation.upsert({
                            where: {
                                staffId_locationId: {
                                    staffId: st.id,
                                    locationId,
                                },
                            },
                            update: {},
                            create: {
                                locationId,
                                staffId: st.id,
                            },
                        });
                    }
                }
            }
        });

        await this.invalidateAvailabilityCache(organizationId);

        await this.realtimeService.broadcastEvent({
            type: 'location.updated',
            organizationId,
            entityId: locationId,
            timestamp: new Date().toISOString(),
            reconnectStrategy: 'canonical_refetch',
            metadata: { locationId, name: dto.name },
        }).catch((err) => this.logger.warn(`[LocationService] Broadcast failed: ${err.message}`));

        await this.realtimeService.broadcastEvent({
            type: 'schedule.updated',
            organizationId,
            entityId: locationId,
            timestamp: new Date().toISOString(),
            reconnectStrategy: 'canonical_refetch',
            metadata: { locationId },
        }).catch((err) => this.logger.warn(`[LocationService] Schedule broadcast failed: ${err.message}`));

        return this.getLocationById(organizationId, locationId);
    }

    async archiveLocation(organizationId: string, locationId: string) {
        const loc = await this.getLocationById(organizationId, locationId);

        // Safety Guard: Organizations must maintain at least one active branch
        const activeCount = await this.prisma.location.count({
            where: {
                organizationId,
                archivedAt: null,
            },
        });

        if (activeCount <= 1) {
            throw new BadRequestException(
                'Organizations must have at least one active branch location to accept customer appointments. Please create a replacement branch before archiving this one.',
            );
        }

        const updated = await this.prisma.location.update({
            where: { id: locationId },
            data: {
                archivedAt: new Date(),
                slug: `${loc.slug}_archived_${Date.now()}`,
            },
        });

        await this.invalidateAvailabilityCache(organizationId);

        await this.realtimeService.broadcastEvent({
            type: 'location.archived',
            organizationId,
            entityId: locationId,
            timestamp: new Date().toISOString(),
            reconnectStrategy: 'canonical_refetch',
            metadata: { locationId },
        }).catch((err) => this.logger.warn(`[LocationService] Broadcast failed: ${err.message}`));

        return updated;
    }

    // --- Location Holidays & Special Closures ---

    async getLocationHolidays(organizationId: string, locationId: string) {
        await this.getLocationById(organizationId, locationId);

        return this.prisma.locationHoliday.findMany({
            where: {
                organizationId,
                locationId,
            },
            orderBy: { date: 'asc' },
        });
    }

    async addLocationHoliday(organizationId: string, locationId: string, dto: LocationHolidayDto) {
        await this.getLocationById(organizationId, locationId);

        const holidayDate = new Date(dto.date);
        if (isNaN(holidayDate.getTime())) {
            throw new BadRequestException('Invalid date format. Expected YYYY-MM-DD');
        }

        const holiday = await this.prisma.locationHoliday.create({
            data: {
                organizationId,
                locationId,
                date: holidayDate,
                name: dto.name,
                isClosed: dto.isClosed ?? true,
            },
        });

        // Optimizer Sync: Mark insights STALE and revoke pending offers falling on holiday
        if (dto.isClosed ?? true) {
            const startOfDay = new Date(holidayDate);
            startOfDay.setUTCHours(0, 0, 0, 0);
            const endOfDay = new Date(holidayDate);
            endOfDay.setUTCHours(23, 59, 59, 999);

            if (this.prisma.scheduleInsight) {
                await this.prisma.scheduleInsight.updateMany({
                    where: {
                        organizationId,
                        locationId,
                        status: 'ACTIVE',
                        startAt: { gte: startOfDay, lte: endOfDay },
                    },
                    data: { status: 'STALE', staleAt: new Date() },
                }).catch(() => null);
            }

            if (this.prisma.waitlistOffer) {
                const holidayOffers = await this.prisma.waitlistOffer.findMany({
                    where: {
                        organizationId,
                        locationId,
                        status: 'PENDING',
                        startAt: { gte: startOfDay, lte: endOfDay },
                    },
                    include: { waitlistEntry: true },
                });

                for (const off of holidayOffers) {
                    await this.prisma.$transaction(async (tx) => {
                        await tx.waitlistOffer.update({
                            where: { id: off.id },
                            data: { status: 'REVOKED', revokedAt: new Date() },
                        });
                        if (off.bookingHoldId && tx.bookingHold) {
                            await tx.bookingHold.updateMany({
                                where: { id: off.bookingHoldId, status: 'ACTIVE' },
                                data: { status: 'RELEASED' },
                            });
                        }
                        if (tx.waitlistEntry) {
                            await tx.waitlistEntry.update({
                                where: { id: off.waitlistEntryId },
                                data: { status: 'ACTIVE' },
                            });
                        }
                    }).catch(() => null);
                }
            }
        }

        await this.invalidateAvailabilityCache(organizationId);

        await this.realtimeService.broadcastEvent({
            type: 'schedule.updated',
            organizationId,
            entityId: locationId,
            timestamp: new Date().toISOString(),
            reconnectStrategy: 'canonical_refetch',
            metadata: { locationId, holidayId: holiday.id },
        }).catch((err) => this.logger.warn(`[LocationService] Broadcast failed: ${err.message}`));

        return holiday;
    }

    async deleteLocationHoliday(organizationId: string, locationId: string, holidayId: string) {
        await this.getLocationById(organizationId, locationId);

        const existing = await this.prisma.locationHoliday.findFirst({
            where: {
                id: holidayId,
                organizationId,
                locationId,
            },
        });

        if (!existing) {
            throw new NotFoundException('Holiday closure record not found');
        }

        await this.prisma.locationHoliday.delete({
            where: { id: holidayId },
        });

        await this.invalidateAvailabilityCache(organizationId);

        await this.realtimeService.broadcastEvent({
            type: 'schedule.updated',
            organizationId,
            entityId: locationId,
            timestamp: new Date().toISOString(),
            reconnectStrategy: 'canonical_refetch',
            metadata: { locationId, holidayId },
        }).catch((err) => this.logger.warn(`[LocationService] Broadcast failed: ${err.message}`));

        return { success: true };
    }
}
