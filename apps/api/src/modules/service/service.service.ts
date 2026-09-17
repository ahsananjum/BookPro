import { Injectable, NotFoundException, BadRequestException, Optional, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateServiceDto, UpdateServiceDto } from '@bookpro/contracts';
import { RealtimeService } from '../realtime/realtime.service';
import { RedisService } from '@bookpro/server-core';

@Injectable()
export class ServiceService {
    private readonly logger = new Logger(ServiceService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly realtimeService: RealtimeService,
        @Optional() private readonly redisService?: RedisService,
    ) { }

    private async invalidateAvailabilityCache(organizationId: string): Promise<void> {
        if (this.redisService && this.redisService.getIsConnected()) {
            try {
                const prefix = RedisService.buildKey(organizationId, "availability");
                await this.redisService.delPrefix(prefix);
                this.logger.log(`[ServiceService] Purged Redis availability cache for org ${organizationId}`);
            } catch (err: any) {
                this.logger.warn(`[ServiceService] Cache invalidation warning: ${err.message}`);
            }
        }
    }

    async getServices(organizationId: string, activeOnly = false) {
        return this.prisma.service.findMany({
            where: {
                organizationId,
                archivedAt: null,
                ...(activeOnly ? { isActive: true } : {}),
            },
            include: {
                _count: {
                    select: {
                        appointments: true,
                    },
                },
                staffServices: {
                    include: {
                        staff: true,
                    },
                },
                serviceResources: {
                    include: {
                        resourcePool: true,
                        resource: true,
                    },
                },
                serviceIntakeForms: {
                    include: {
                        intakeForm: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    async getServiceById(organizationId: string, serviceId: string) {
        const service = await this.prisma.service.findFirst({
            where: {
                id: serviceId,
                organizationId,
                archivedAt: null,
            },
            include: {
                _count: {
                    select: {
                        appointments: true,
                    },
                },
                staffServices: { include: { staff: true } },
                serviceResources: { include: { resourcePool: true, resource: true } },
                serviceIntakeForms: { include: { intakeForm: true } },
            },
        });

        if (!service) {
            throw new NotFoundException('Service not found');
        }

        return service;
    }

    async createService(organizationId: string, dto: CreateServiceDto) {
        if (dto.minParticipants && dto.maxParticipants && dto.minParticipants > dto.maxParticipants) {
            throw new BadRequestException('minParticipants cannot exceed maxParticipants');
        }

        const service = await this.prisma.service.create({
            data: {
                organizationId,
                name: dto.name,
                description: dto.description,
                category: dto.category,
                imageUrl: dto.imageUrl,
                durationMin: dto.durationMin,
                preBufferMin: dto.preBufferMin ?? 0,
                postBufferMin: dto.postBufferMin ?? 0,
                priceCents: dto.priceCents,
                currency: dto.currency || 'USD',
                depositType: dto.depositType || 'NONE',
                depositValue: dto.depositValue ?? 0,
                taxBehavior: dto.taxBehavior || 'EXCLUSIVE',
                capacity: dto.capacity ?? 1,
                minParticipants: dto.minParticipants ?? 1,
                maxParticipants: dto.maxParticipants ?? 1,
                preparationInstructions: dto.preparationInstructions,
                version: 1,
            },
        });

        // 1. Staff Assignments & Custom Pricing/Durations
        if (dto.staffPricing && dto.staffPricing.length > 0) {
            await this.prisma.staffService.createMany({
                data: dto.staffPricing.map((st) => ({
                    serviceId: service.id,
                    staffId: st.staffId,
                    customPriceCents: st.customPriceCents ?? null,
                    customDurationMin: st.customDurationMin ?? null,
                })),
            });
        } else if (dto.eligibleStaffIds && dto.eligibleStaffIds.length > 0) {
            await this.prisma.staffService.createMany({
                data: dto.eligibleStaffIds.map((staffId: string) => ({
                    serviceId: service.id,
                    staffId,
                })),
            });
        }

        // 2. Resource Pool Dependencies
        if (dto.requiredResourcePools && dto.requiredResourcePools.length > 0) {
            await this.prisma.serviceResource.createMany({
                data: dto.requiredResourcePools.map((poolReq: any) => ({
                    serviceId: service.id,
                    resourcePoolId: poolReq.poolId,
                    quantityRequired: poolReq.quantity,
                })),
            });
        }

        // 3. Intake Form Associations
        if (dto.intakeFormIds && dto.intakeFormIds.length > 0) {
            await this.prisma.serviceIntakeForm.createMany({
                data: dto.intakeFormIds.map((intakeFormId: string, index: number) => ({
                    serviceId: service.id,
                    intakeFormId,
                    sortOrder: index,
                    isRequired: true,
                })),
            });
        }

        // Invalidate cached slots & broadcast real-time sync
        await this.invalidateAvailabilityCache(organizationId);
        await this.realtimeService.broadcastEvent({
            type: 'service.created',
            organizationId,
            entityId: service.id,
            timestamp: new Date().toISOString(),
            reconnectStrategy: 'canonical_refetch',
            metadata: { serviceId: service.id, name: service.name },
        }).catch((err) => this.logger.warn(`Broadcast failed: ${err.message}`));

        return this.getServiceById(organizationId, service.id);
    }

    async updateService(organizationId: string, serviceId: string, dto: UpdateServiceDto) {
        const existing = await this.getServiceById(organizationId, serviceId);

        const minPart = dto.minParticipants ?? existing.minParticipants;
        const maxPart = dto.maxParticipants ?? existing.maxParticipants;
        if (minPart > maxPart) {
            throw new BadRequestException('minParticipants cannot exceed maxParticipants');
        }

        await this.prisma.service.update({
            where: { id: serviceId },
            data: {
                ...(dto.name && { name: dto.name }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.category !== undefined && { category: dto.category }),
                ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
                ...(dto.durationMin && { durationMin: dto.durationMin }),
                ...(dto.preBufferMin !== undefined && { preBufferMin: dto.preBufferMin }),
                ...(dto.postBufferMin !== undefined && { postBufferMin: dto.postBufferMin }),
                ...(dto.priceCents !== undefined && { priceCents: dto.priceCents }),
                ...(dto.currency && { currency: dto.currency }),
                ...(dto.depositType && { depositType: dto.depositType }),
                ...(dto.depositValue !== undefined && { depositValue: dto.depositValue }),
                ...(dto.taxBehavior && { taxBehavior: dto.taxBehavior }),
                ...(dto.capacity && { capacity: dto.capacity }),
                ...(dto.minParticipants && { minParticipants: dto.minParticipants }),
                ...(dto.maxParticipants && { maxParticipants: dto.maxParticipants }),
                ...(dto.preparationInstructions !== undefined && { preparationInstructions: dto.preparationInstructions }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
                version: { increment: 1 },
            },
        });

        // 1. Staff Assignments & Custom Pricing/Durations
        if (dto.staffPricing !== undefined) {
            await this.prisma.staffService.deleteMany({ where: { serviceId } });
            if (dto.staffPricing.length > 0) {
                await this.prisma.staffService.createMany({
                    data: dto.staffPricing.map((st) => ({
                        serviceId,
                        staffId: st.staffId,
                        customPriceCents: st.customPriceCents ?? null,
                        customDurationMin: st.customDurationMin ?? null,
                    })),
                });
            }
        } else if (dto.eligibleStaffIds !== undefined) {
            await this.prisma.staffService.deleteMany({ where: { serviceId } });
            if (dto.eligibleStaffIds.length > 0) {
                await this.prisma.staffService.createMany({
                    data: dto.eligibleStaffIds.map((staffId: string) => ({
                        serviceId,
                        staffId,
                    })),
                });
            }
        }

        // 2. Resource Pool Dependencies
        if (dto.requiredResourcePools !== undefined) {
            await this.prisma.serviceResource.deleteMany({ where: { serviceId } });
            if (dto.requiredResourcePools.length > 0) {
                await this.prisma.serviceResource.createMany({
                    data: dto.requiredResourcePools.map((poolReq: any) => ({
                        serviceId,
                        resourcePoolId: poolReq.poolId,
                        quantityRequired: poolReq.quantity,
                    })),
                });
            }
        }

        // 3. Intake Form Associations
        if (dto.intakeFormIds !== undefined) {
            await this.prisma.serviceIntakeForm.deleteMany({ where: { serviceId } });
            if (dto.intakeFormIds.length > 0) {
                await this.prisma.serviceIntakeForm.createMany({
                    data: dto.intakeFormIds.map((intakeFormId: string, index: number) => ({
                        serviceId,
                        intakeFormId,
                        sortOrder: index,
                        isRequired: true,
                    })),
                });
            }
        }

        // Invalidate cached slots & broadcast real-time sync
        await this.invalidateAvailabilityCache(organizationId);

        // Synchronize with Schedule Optimizer: Mark insights stale if gap no longer accommodates new duration
        if (dto.durationMin !== undefined || dto.preBufferMin !== undefined || dto.postBufferMin !== undefined) {
            const newDuration = dto.durationMin ?? existing.durationMin;
            const newPre = dto.preBufferMin ?? existing.preBufferMin;
            const newPost = dto.postBufferMin ?? existing.postBufferMin;
            const requiredMin = newDuration + newPre + newPost;
            if (this.prisma.scheduleInsight) {
                await this.prisma.scheduleInsight.updateMany({
                    where: {
                        organizationId,
                        serviceId,
                        status: 'ACTIVE',
                        gapDurationMin: { lt: requiredMin },
                    },
                    data: { status: 'STALE', staleAt: new Date() },
                }).catch(() => null);
            }
        }

        await this.realtimeService.broadcastEvent({
            type: 'service.updated',
            organizationId,
            entityId: serviceId,
            timestamp: new Date().toISOString(),
            reconnectStrategy: 'canonical_refetch',
            metadata: { serviceId, isActive: dto.isActive ?? existing.isActive },
        }).catch((err) => this.logger.warn(`Broadcast failed: ${err.message}`));

        return this.getServiceById(organizationId, serviceId);
    }

    async archiveService(organizationId: string, serviceId: string) {
        await this.getServiceById(organizationId, serviceId);

        const updated = await this.prisma.service.update({
            where: { id: serviceId },
            data: { archivedAt: new Date(), isActive: false },
        });

        // Invalidate active optimizer insights and revoke pending offers for archived service
        if (this.prisma.scheduleInsight) {
            await this.prisma.scheduleInsight.updateMany({
                where: { organizationId, serviceId, status: 'ACTIVE' },
                data: { status: 'STALE', staleAt: new Date() },
            }).catch(() => null);
        }

        if (this.prisma.waitlistOffer) {
            const pendingOffers = await this.prisma.waitlistOffer.findMany({
                where: { organizationId, serviceId, status: 'PENDING' },
                select: { id: true, bookingHoldId: true },
            });
            if (pendingOffers.length > 0) {
                await this.prisma.waitlistOffer.updateMany({
                    where: { id: { in: pendingOffers.map((o) => o.id) } },
                    data: { status: 'REVOKED', revokedAt: new Date() },
                });
                const holdIds = pendingOffers.map((o) => o.bookingHoldId).filter(Boolean) as string[];
                if (holdIds.length > 0 && this.prisma.bookingHold) {
                    await this.prisma.bookingHold.updateMany({
                        where: { id: { in: holdIds }, status: 'ACTIVE' },
                        data: { status: 'RELEASED' },
                    });
                }
            }
        }

        // Invalidate cached slots & broadcast real-time sync
        await this.invalidateAvailabilityCache(organizationId);
        await this.realtimeService.broadcastEvent({
            type: 'service.archived',
            organizationId,
            entityId: serviceId,
            timestamp: new Date().toISOString(),
            reconnectStrategy: 'canonical_refetch',
            metadata: { serviceId },
        }).catch((err) => this.logger.warn(`Broadcast failed: ${err.message}`));

        return updated;
    }
}
