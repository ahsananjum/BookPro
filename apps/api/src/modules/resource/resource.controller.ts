import { Controller, Get, Post, Put, Delete, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { ReqContext, RequirePermissions } from '@bookpro/server-core';
import { RequestContext, CreateResourcePoolDto, CreateResourceDto, UpdateResourceDto, CreateResourceBlockDto, PermissionKey } from '@bookpro/contracts';
import { createResourcePoolSchema, createResourceSchema, updateResourceSchema, createResourceBlockSchema } from '@bookpro/validation';
import { ResourceService } from './resource.service';

@Controller('resources')
export class ResourceController {
    constructor(private readonly resourceService: ResourceService) { }

    private getOrgId(ctx: RequestContext): string {
        if (!ctx.organizationId) {
            throw new BadRequestException('Organization context is required');
        }
        return ctx.organizationId;
    }

    @Get('pools')
    @RequirePermissions(PermissionKey.RESOURCE_READ)
    async getResourcePools(@ReqContext() ctx: RequestContext) {
        const data = await this.resourceService.getResourcePools(this.getOrgId(ctx));
        return { success: true, data };
    }

    @Post('pools')
    @RequirePermissions(PermissionKey.RESOURCE_MANAGE)
    async createResourcePool(@ReqContext() ctx: RequestContext, @Body() body: CreateResourcePoolDto) {
        const validated = createResourcePoolSchema.parse(body);
        const data = await this.resourceService.createResourcePool(this.getOrgId(ctx), validated);
        return { success: true, data };
    }

    @Get()
    @RequirePermissions(PermissionKey.RESOURCE_READ)
    async getResources(@ReqContext() ctx: RequestContext, @Query('locationId') locationId?: string) {
        const data = await this.resourceService.getResources(this.getOrgId(ctx), locationId);
        return { success: true, data };
    }

    @Get(':id')
    @RequirePermissions(PermissionKey.RESOURCE_READ)
    async getResourceById(@ReqContext() ctx: RequestContext, @Param('id') id: string) {
        const data = await this.resourceService.getResourceById(this.getOrgId(ctx), id);
        return { success: true, data };
    }

    @Post()
    @RequirePermissions(PermissionKey.RESOURCE_MANAGE)
    async createResource(@ReqContext() ctx: RequestContext, @Body() body: CreateResourceDto) {
        const validated = createResourceSchema.parse(body);
        const data = await this.resourceService.createResource(this.getOrgId(ctx), validated);
        return { success: true, data };
    }

    @Put(':id')
    @RequirePermissions(PermissionKey.RESOURCE_MANAGE)
    async updateResource(
        @ReqContext() ctx: RequestContext,
        @Param('id') id: string,
        @Body() body: UpdateResourceDto,
    ) {
        const validated = updateResourceSchema.parse(body);
        const data = await this.resourceService.updateResource(this.getOrgId(ctx), id, validated);
        return { success: true, data };
    }

    @Post(':id/blocks')
    @RequirePermissions(PermissionKey.RESOURCE_MANAGE)
    async createResourceBlock(
        @ReqContext() ctx: RequestContext,
        @Param('id') id: string,
        @Body() body: CreateResourceBlockDto,
    ) {
        const validated = createResourceBlockSchema.parse(body);
        const data = await this.resourceService.createResourceBlock(this.getOrgId(ctx), id, validated);
        return { success: true, data };
    }

    @Delete(':id')
    @RequirePermissions(PermissionKey.RESOURCE_MANAGE)
    async archiveResource(@ReqContext() ctx: RequestContext, @Param('id') id: string) {
        const data = await this.resourceService.archiveResource(this.getOrgId(ctx), id);
        return { success: true, data };
    }
}
