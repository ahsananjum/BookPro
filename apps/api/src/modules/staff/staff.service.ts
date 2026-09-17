import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CreateStaffDto, UpdateStaffDto, SetStaffAvailabilityDto, CreateStaffLeaveDto } from '@bookpro/contracts';

@Injectable()
export class StaffService {
    private readonly logger = new Logger(StaffService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly realtimeService: RealtimeService,
    ) { }

    private async notifyStaffUpdated(organizationId: string, staffId?: string) {
        try {
            await this.realtimeService.broadcastEvent({
                type: 'staff.updated',
                organizationId,
                entityId: staffId,
                timestamp: new Date().toISOString(),
            });
        } catch (err: any) {
            this.logger.warn(`Failed to broadcast realtime staff event: ${err.message}`);
        }
    }

    async getStaffMembers(
        organizationId: string,
        filters?: {
            locationId?: string;
            serviceId?: string;
            activeOnly?: boolean;
            bookingVisibleOnly?: boolean;
        },
    ) {
        return this.prisma.staffProfile.findMany({
            where: {
                organizationId,
                archivedAt: null,
                ...(filters?.activeOnly ? { isActive: true } : {}),
                ...(filters?.bookingVisibleOnly ? { bookingVisible: true } : {}),
                ...(filters?.locationId ? { staffLocations: { some: { locationId: filters.locationId } } } : {}),
                ...(filters?.serviceId ? { staffServices: { some: { serviceId: filters.serviceId } } } : {}),
            },
            include: {
                membership: {
                    include: { user: { select: { id: true, email: true, fullName: true, phone: true } } },
                },
                staffLocations: {
                    include: {
                        location: true,
                    },
                },
                staffServices: {
                    include: {
                        service: true,
                    },
                },
                availabilities: true,
                breaks: true,
                leaves: {
                    where: { endDate: { gte: new Date() } },
                    orderBy: { startDate: 'asc' },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    async getStaffById(organizationId: string, staffId: string) {
        const staff = await this.prisma.staffProfile.findFirst({
            where: {
                id: staffId,
                organizationId,
                archivedAt: null,
            },
            include: {
                membership: {
                    include: { user: { select: { id: true, email: true, fullName: true, phone: true } } },
                },
                staffLocations: { include: { location: true } },
                staffServices: { include: { service: true } },
                availabilities: true,
                breaks: true,
                leaves: {
                    orderBy: { startDate: 'asc' },
                },
            },
        });

        if (!staff) {
            throw new NotFoundException('Staff profile not found');
        }

        return staff;
    }

    async createStaffMember(organizationId: string, dto: CreateStaffDto) {
        if ((dto.bookingVisible ?? true) && (!dto.locationIds?.length || !dto.serviceIds?.length)) {
            throw new BadRequestException('Booking-visible staff must be assigned to at least one location and one service.');
        }

        let user: { id: string; email: string; fullName: string } | null = null;
        if (dto.userId) {
            user = await this.prisma.user.findUnique({
                where: { id: dto.userId },
                select: { id: true, email: true, fullName: true },
            });
        }

        if (!user && dto.email) {
            user = await this.prisma.user.findUnique({
                where: { email: dto.email.toLowerCase() },
                select: { id: true, email: true, fullName: true },
            });
        }

        if (!user) {
            user = await this.prisma.user.create({
                data: {
                    email: dto.email.toLowerCase(),
                    fullName: dto.fullName || dto.displayName,
                },
                select: { id: true, email: true, fullName: true },
            });
        }

        let membership = await this.prisma.membership.findUnique({
            where: {
                organizationId_userId: {
                    organizationId,
                    userId: user.id,
                },
            },
        });

        if (!membership) {
            membership = await this.prisma.membership.create({
                data: {
                    organizationId,
                    userId: user.id,
                    roleCode: (dto.roleCode as any) || 'STAFF',
                    status: 'ACTIVE',
                },
            });
        } else if (dto.roleCode && membership.roleCode !== dto.roleCode) {
            membership = await this.prisma.membership.update({
                where: { id: membership.id },
                data: { roleCode: dto.roleCode as any },
            });
        }

        // Check if staff profile already exists for this membership
        let staff = await this.prisma.staffProfile.findUnique({
            where: { membershipId: membership.id },
        });

        if (staff) {
            staff = await this.prisma.staffProfile.update({
                where: { id: staff.id },
                data: {
                    displayName: dto.displayName,
                    title: dto.title !== undefined ? dto.title : staff.title,
                    bio: dto.bio !== undefined ? dto.bio : staff.bio,
                    avatarUrl: dto.avatarUrl !== undefined ? dto.avatarUrl : staff.avatarUrl,
                    skills: dto.skills || (staff.skills as any) || [],
                    calendarColor: dto.calendarColor || staff.calendarColor,
                    bookingVisible: dto.bookingVisible ?? staff.bookingVisible,
                    isActive: true,
                    archivedAt: null,
                },
            });
        } else {
            staff = await this.prisma.staffProfile.create({
                data: {
                    organizationId,
                    membershipId: membership.id,
                    displayName: dto.displayName,
                    title: dto.title,
                    bio: dto.bio,
                    avatarUrl: dto.avatarUrl,
                    skills: dto.skills || [],
                    calendarColor: dto.calendarColor || '#3B82F6',
                    bookingVisible: dto.bookingVisible ?? true,
                },
            });
        }

        if (dto.locationIds && dto.locationIds.length > 0) {
            await this.prisma.staffLocation.deleteMany({ where: { staffId: staff.id } });
            await this.prisma.staffLocation.createMany({
                data: dto.locationIds.map((locId: string) => ({
                    staffId: staff.id,
                    locationId: locId,
                })),
                skipDuplicates: true,
            });
        }

        if (dto.serviceIds && dto.serviceIds.length > 0) {
            const overrideMap = new Map<string, { customPriceCents?: number; customDurationMin?: number }>();
            if (dto.serviceOverrides) {
                for (const ov of dto.serviceOverrides) {
                    overrideMap.set(ov.serviceId, ov);
                }
            }

            await this.prisma.staffService.deleteMany({ where: { staffId: staff.id } });
            await this.prisma.staffService.createMany({
                data: dto.serviceIds.map((svcId: string) => {
                    const ov = overrideMap.get(svcId);
                    return {
                        staffId: staff.id,
                        serviceId: svcId,
                        customPriceCents: ov?.customPriceCents,
                        customDurationMin: ov?.customDurationMin,
                    };
                }),
                skipDuplicates: true,
            });
        }

        await this.notifyStaffUpdated(organizationId, staff.id);
        return this.getStaffById(organizationId, staff.id);
    }

    async updateStaffMember(organizationId: string, staffId: string, dto: UpdateStaffDto) {
        const existing = await this.getStaffById(organizationId, staffId);
        const bookingVisible = dto.bookingVisible ?? existing.bookingVisible;
        const locationIds = dto.locationIds ?? existing.staffLocations.map((item: any) => item.locationId);
        const serviceIds = dto.serviceIds ?? existing.staffServices.map((item: any) => item.serviceId);
        if (bookingVisible && (!locationIds.length || !serviceIds.length)) {
            throw new BadRequestException('Booking-visible staff must be assigned to at least one location and one service.');
        }

        // Update User & Membership if roleCode or user details changed
        if (dto.roleCode && existing.membershipId) {
            await this.prisma.membership.update({
                where: { id: existing.membershipId },
                data: { roleCode: dto.roleCode as any },
            });
        }

        const userId = existing.membership?.user?.id;
        if (userId && (dto.fullName || dto.email)) {
            await this.prisma.user.update({
                where: { id: userId },
                data: {
                    ...(dto.fullName && { fullName: dto.fullName }),
                    ...(dto.email && { email: dto.email.toLowerCase().trim() }),
                },
            });
        }

        await this.prisma.staffProfile.update({
            where: { id: staffId },
            data: {
                ...(dto.displayName && { displayName: dto.displayName }),
                ...(dto.title !== undefined && { title: dto.title }),
                ...(dto.bio !== undefined && { bio: dto.bio }),
                ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
                ...(dto.skills !== undefined && { skills: dto.skills }),
                ...(dto.calendarColor && { calendarColor: dto.calendarColor }),
                ...(dto.bookingVisible !== undefined && { bookingVisible: dto.bookingVisible }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            },
        });

        if (dto.locationIds) {
            await this.prisma.staffLocation.deleteMany({ where: { staffId } });
            await this.prisma.staffLocation.createMany({
                data: dto.locationIds.map((locId: string) => ({
                    staffId,
                    locationId: locId,
                })),
            });
        }

        if (dto.serviceIds) {
            const overrideMap = new Map<string, { customPriceCents?: number; customDurationMin?: number }>();
            if (dto.serviceOverrides) {
                for (const ov of dto.serviceOverrides) {
                    overrideMap.set(ov.serviceId, ov);
                }
            }

            await this.prisma.staffService.deleteMany({ where: { staffId } });
            await this.prisma.staffService.createMany({
                data: dto.serviceIds.map((svcId: string) => {
                    const ov = overrideMap.get(svcId);
                    return {
                        staffId,
                        serviceId: svcId,
                        customPriceCents: ov?.customPriceCents,
                        customDurationMin: ov?.customDurationMin,
                    };
                }),
            });
        }

        await this.notifyStaffUpdated(organizationId, staffId);
        return this.getStaffById(organizationId, staffId);
    }

    async setStaffAvailability(organizationId: string, staffId: string, dto: SetStaffAvailabilityDto) {
        await this.getStaffById(organizationId, staffId);

        await this.prisma.staffAvailability.deleteMany({ where: { staffId } });
        await this.prisma.staffAvailability.createMany({
            data: dto.availabilities.map((avail: any) => ({
                organizationId,
                staffId,
                locationId: avail.locationId,
                dayOfWeek: avail.dayOfWeek,
                startTime: avail.startTime,
                endTime: avail.endTime,
            })),
        });

        if (dto.breaks) {
            await this.prisma.staffBreak.deleteMany({ where: { staffId } });
            await this.prisma.staffBreak.createMany({
                data: dto.breaks.map((brk: any) => ({
                    organizationId,
                    staffId,
                    dayOfWeek: brk.dayOfWeek,
                    startTime: brk.startTime,
                    endTime: brk.endTime,
                    label: brk.label,
                })),
            });
        }

        await this.notifyStaffUpdated(organizationId, staffId);
        return this.getStaffById(organizationId, staffId);
    }

    async createStaffLeave(organizationId: string, staffId: string, dto: CreateStaffLeaveDto, actorId?: string) {
        await this.getStaffById(organizationId, staffId);

        const startDate = new Date(dto.startDate);
        const endDate = new Date(dto.endDate);

        const leave = await this.prisma.staffLeave.create({
            data: {
                organizationId,
                staffId,
                startDate,
                endDate,
                reason: dto.reason,
                status: 'APPROVED',
                approvedBy: actorId,
                approvedAt: new Date(),
            },
        });

        // Optimizer Sync: Invalidate overlapping insights and gracefully revoke pending offers
        if (this.prisma.scheduleInsight && this.prisma.waitlistOffer) {
            await this.prisma.scheduleInsight.updateMany({
                where: {
                    organizationId,
                    staffId,
                    status: 'ACTIVE',
                    startAt: { gte: startDate },
                    endAt: { lte: endDate },
                },
                data: { status: 'STALE', staleAt: new Date() },
            }).catch(() => null);

            const conflictingOffers = await this.prisma.waitlistOffer.findMany({
                where: {
                    organizationId,
                    staffId,
                    status: 'PENDING',
                    startAt: { gte: startDate },
                    endAt: { lte: endDate },
                },
                include: { waitlistEntry: { include: { customer: true } } },
            }).catch(() => []);

            for (const off of conflictingOffers) {
                await this.prisma.$transaction(async (tx) => {
                    await tx.waitlistOffer.update({
                        where: { id: off.id },
                        data: { status: 'REVOKED', revokedAt: new Date() },
                    });
                    if (off.bookingHoldId) {
                        await tx.bookingHold.updateMany({
                            where: { id: off.bookingHoldId, status: 'ACTIVE' },
                            data: { status: 'RELEASED' },
                        });
                    }
                    await tx.waitlistEntry.update({
                        where: { id: off.waitlistEntryId },
                        data: { status: 'ACTIVE' },
                    });
                    await tx.outboxEvent.create({
                        data: {
                            organizationId,
                            aggregateType: 'WaitlistOffer',
                            aggregateId: off.id,
                            eventType: 'waitlist.offer_revoked',
                            payload: {
                                offerId: off.id,
                                waitlistEntryId: off.waitlistEntryId,
                                reason: 'Specialist unavailable due to approved leave',
                                customerEmail: off.waitlistEntry?.customer?.email,
                                customerName: off.waitlistEntry?.customer?.fullName,
                            },
                        },
                    });
                }).catch(() => null);
            }
        }

        await this.notifyStaffUpdated(organizationId, staffId);
        return leave;
    }

    async deleteStaffLeave(organizationId: string, staffId: string, leaveId: string) {
        await this.prisma.staffLeave.deleteMany({
            where: { id: leaveId, organizationId, staffId },
        });

        await this.notifyStaffUpdated(organizationId, staffId);
        return { success: true };
    }

    async archiveStaff(organizationId: string, staffId: string) {
        const staff = await this.prisma.staffProfile.findFirst({
            where: { id: staffId, organizationId },
        });

        if (!staff) {
            throw new NotFoundException("Staff profile not found");
        }

        const updated = await this.prisma.staffProfile.update({
            where: { id: staffId },
            data: { archivedAt: new Date(), isActive: false },
        });

        // Optimizer Sync: Mark active staff insights STALE and revoke pending offers
        if (this.prisma.scheduleInsight && this.prisma.waitlistOffer) {
            await this.prisma.scheduleInsight.updateMany({
                where: { organizationId, staffId, status: 'ACTIVE' },
                data: { status: 'STALE', staleAt: new Date() },
            }).catch(() => null);

            const pendingOffers = await this.prisma.waitlistOffer.findMany({
                where: { organizationId, staffId, status: 'PENDING' },
                select: { id: true, bookingHoldId: true, waitlistEntryId: true },
            }).catch(() => []);

            for (const off of pendingOffers) {
                await this.prisma.$transaction(async (tx) => {
                    await tx.waitlistOffer.update({
                        where: { id: off.id },
                        data: { status: 'REVOKED', revokedAt: new Date() },
                    });
                    if (off.bookingHoldId) {
                        await tx.bookingHold.updateMany({
                            where: { id: off.bookingHoldId, status: 'ACTIVE' },
                            data: { status: 'RELEASED' },
                        });
                    }
                    await tx.waitlistEntry.update({
                        where: { id: off.waitlistEntryId },
                        data: { status: 'ACTIVE' },
                    });
                }).catch(() => null);
            }
        }

        await this.notifyStaffUpdated(organizationId, staffId);
        return updated;
    }
}
