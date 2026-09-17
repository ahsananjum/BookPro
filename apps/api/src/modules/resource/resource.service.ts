import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateResourcePoolDto, CreateResourceDto, UpdateResourceDto, CreateResourceBlockDto } from '@bookpro/contracts';

@Injectable()
export class ResourceService {
    constructor(private readonly prisma: PrismaService) { }

    async getResourcePools(organizationId: string) {
        return this.prisma.resourcePool.findMany({
            where: { organizationId },
            include: {
                resources: {
                    where: { archivedAt: null },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    async createResourcePool(organizationId: string, dto: CreateResourcePoolDto) {
        return this.prisma.resourcePool.create({
            data: {
                organizationId,
                name: dto.name,
                category: dto.category,
            },
        });
    }

    async getResources(organizationId: string, locationId?: string) {
        return this.prisma.resource.findMany({
            where: {
                organizationId,
                archivedAt: null,
                ...(locationId && { locationId }),
            },
            include: {
                location: true,
                pool: true,
                scheduleBlocks: {
                    where: { endAt: { gte: new Date() } },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    async getResourceById(organizationId: string, resourceId: string) {
        const resource = await this.prisma.resource.findFirst({
            where: {
                id: resourceId,
                organizationId,
                archivedAt: null,
            },
            include: {
                location: true,
                pool: true,
                scheduleBlocks: true,
            },
        });

        if (!resource) {
            throw new NotFoundException('Resource not found');
        }

        return resource;
    }

    async createResource(organizationId: string, dto: CreateResourceDto) {
        return this.prisma.resource.create({
            data: {
                organizationId,
                locationId: dto.locationId,
                poolId: dto.poolId,
                name: dto.name,
                type: dto.type,
                quantity: dto.quantity ?? 1,
            },
        });
    }

    async updateResource(organizationId: string, resourceId: string, dto: UpdateResourceDto) {
        await this.getResourceById(organizationId, resourceId);

        return this.prisma.resource.update({
            where: { id: resourceId },
            data: {
                ...(dto.name && { name: dto.name }),
                ...(dto.type && { type: dto.type }),
                ...(dto.quantity !== undefined && { quantity: dto.quantity }),
                ...(dto.locationId && { locationId: dto.locationId }),
                ...(dto.poolId !== undefined && { poolId: dto.poolId }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            },
        });
    }

    async createResourceBlock(organizationId: string, resourceId: string, dto: CreateResourceBlockDto) {
        const resource = await this.getResourceById(organizationId, resourceId);

        return this.prisma.scheduleBlock.create({
            data: {
                organizationId,
                locationId: resource.locationId,
                resourceId,
                startAt: new Date(dto.startAt),
                endAt: new Date(dto.endAt),
                reason: dto.reason || 'Maintenance Block',
                sourceType: 'RESOURCE_MAINTENANCE',
            },
        });
    }

    async archiveResource(organizationId: string, resourceId: string) {
        await this.getResourceById(organizationId, resourceId);

        return this.prisma.resource.update({
            where: { id: resourceId },
            data: { archivedAt: new Date(), isActive: false },
        });
    }
}
