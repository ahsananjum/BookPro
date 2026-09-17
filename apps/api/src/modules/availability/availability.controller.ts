import { Controller, Get, Post, Body, Query, UseGuards, Headers, BadRequestException } from "@nestjs/common";
import { AvailabilityService } from "./availability.service";
import {
    searchAvailabilitySchema,
    validateAvailabilitySchema,
    SearchAvailabilityInput,
    ValidateAvailabilityInput,
} from "@bookpro/validation";
import { AuthGuard } from "../auth/auth.guard";
import { PermissionsGuard, Public } from "@bookpro/server-core";
import { OrganizationService } from "../organization/organization.service";
import { PrismaService } from "../database/prisma.service";

@Public()
@Controller("availability")
@UseGuards(AuthGuard, PermissionsGuard)
export class AvailabilityController {
    constructor(
        private readonly availabilityService: AvailabilityService,
        private readonly organizations: OrganizationService,
        private readonly prisma: PrismaService,
    ) { }

    @Get()
    async getAvailability(
        @Query("locationId") locationId?: string,
        @Query("serviceId") serviceId?: string,
        @Query("startDate") startDate?: string,
        @Query("endDate") endDate?: string,
        @Query("organizationId") organizationIdQuery?: string,
        @Query("staffId") staffId?: string,
        @Query("partySize") partySizeStr?: string,
        @Headers("x-organization-id") headerOrgId?: string,
        @Headers("x-tenant-slug") tenantSlug?: string,
    ) {
        return this.getSlots(
            locationId,
            serviceId,
            startDate,
            endDate,
            organizationIdQuery,
            staffId,
            partySizeStr,
            headerOrgId,
            tenantSlug,
        );
    }

    @Get("slots")
    async getSlots(
        @Query("locationId") locationId?: string,
        @Query("serviceId") serviceId?: string,
        @Query("startDate") startDate?: string,
        @Query("endDate") endDate?: string,
        @Query("organizationId") organizationIdQuery?: string,
        @Query("staffId") staffId?: string,
        @Query("partySize") partySizeStr?: string,
        @Headers("x-organization-id") headerOrgId?: string,
        @Headers("x-tenant-slug") tenantSlug?: string,
    ) {
        let organizationId = organizationIdQuery || headerOrgId;
        if (!organizationId && tenantSlug) {
            organizationId = await this.organizations.resolvePublishedOrganizationId(tenantSlug).catch(() => undefined);
        }
        if (!organizationId && serviceId) {
            const srv = await this.prisma.service.findUnique({
                where: { id: serviceId },
                select: { organizationId: true },
            });
            if (srv) organizationId = srv.organizationId;
        }
        if (!organizationId) {
            throw new BadRequestException("Organization context is required to query availability slots");
        }

        let resolvedLocationId = locationId;
        if (!resolvedLocationId) {
            const firstLoc = await this.prisma.location.findFirst({
                where: { organizationId, archivedAt: null },
                select: { id: true },
            });
            if (firstLoc) resolvedLocationId = firstLoc.id;
        }

        // If no serviceId was provided, resolve the first active service for the organization
        let resolvedServiceId = serviceId;
        if (!resolvedServiceId) {
            const firstSrv = await this.prisma.service.findFirst({
                where: { organizationId, archivedAt: null, isActive: true },
                select: { id: true },
            });
            if (firstSrv) resolvedServiceId = firstSrv.id;
        }

        const dateStr = startDate || new Date().toISOString().split("T")[0];
        const endStr = endDate || dateStr;

        const parsed: SearchAvailabilityInput = {
            organizationId,
            locationId: resolvedLocationId || "",
            serviceId: resolvedServiceId || "",
            startDate: dateStr,
            endDate: endStr,
            staffId: staffId || undefined,
            partySize: partySizeStr ? parseInt(partySizeStr, 10) : 1,
        };

        const result = await this.availabilityService.searchAvailability(parsed);
        const nowMs = Date.now();
        const normalizedSlots = (result.slots || [])
            .map((s: any) => {
                const start = s.startAt || s.startTime;
                const end = s.endAt || s.endTime;
                return {
                    ...s,
                    startAt: start,
                    startTime: start,
                    endAt: end,
                    endTime: end,
                };
            })
            .filter((s: any) => {
                const startMs = new Date(s.startAt).getTime();
                return !isNaN(startMs) && startMs > nowMs;
            });

        return {
            success: true,
            data: normalizedSlots,
            totalAvailableSlots: normalizedSlots.length,
            startDate: result.startDate,
            endDate: result.endDate,
            presentationTimezone: result.presentationTimezone,
        };
    }

    @Get("search")
    async getSearch(
        @Query("locationId") locationId?: string,
        @Query("serviceId") serviceId?: string,
        @Query("startDate") startDate?: string,
        @Query("endDate") endDate?: string,
        @Query("organizationId") organizationIdQuery?: string,
        @Query("staffId") staffId?: string,
        @Query("partySize") partySizeStr?: string,
        @Headers("x-organization-id") headerOrgId?: string,
        @Headers("x-tenant-slug") tenantSlug?: string,
    ) {
        return this.getSlots(
            locationId,
            serviceId,
            startDate,
            endDate,
            organizationIdQuery,
            staffId,
            partySizeStr,
            headerOrgId,
            tenantSlug,
        );
    }

    @Post("search")
    async searchAvailability(
        @Body() body: any,
        @Headers("x-tenant-slug") tenantSlug?: string,
        @Headers("x-organization-id") headerOrgId?: string,
    ) {
        let organizationId = body.organizationId || headerOrgId;
        if (!organizationId && tenantSlug) {
            organizationId = await this.organizations.resolvePublishedOrganizationId(tenantSlug);
        }
        if (!organizationId && body.serviceId) {
            const srv = await this.prisma.service.findUnique({
                where: { id: body.serviceId },
                select: { organizationId: true },
            });
            if (srv) organizationId = srv.organizationId;
        }
        if (!organizationId) {
            throw new BadRequestException("Organization context is required");
        }

        const parsed = searchAvailabilitySchema.parse({
            ...body,
            organizationId,
        });

        const result = await this.availabilityService.searchAvailability(parsed);
        return {
            success: true,
            data: result.slots,
            totalAvailableSlots: result.totalAvailableSlots,
            startDate: result.startDate,
            endDate: result.endDate,
            presentationTimezone: result.presentationTimezone,
        };
    }

    @Post("validate")
    async validateAvailability(
        @Body() body: any,
        @Headers("x-tenant-slug") tenantSlug?: string,
        @Headers("x-organization-id") headerOrgId?: string,
    ) {
        let organizationId = body.organizationId || headerOrgId;
        if (!organizationId && tenantSlug) {
            organizationId = await this.organizations.resolvePublishedOrganizationId(tenantSlug);
        }
        if (!organizationId && body.serviceId) {
            const srv = await this.prisma.service.findUnique({
                where: { id: body.serviceId },
                select: { organizationId: true },
            });
            if (srv) organizationId = srv.organizationId;
        }
        if (!organizationId) {
            throw new BadRequestException("Organization context is required");
        }

        const parsed = validateAvailabilitySchema.parse({
            ...body,
            organizationId,
        });

        const result = await this.availabilityService.validateAvailability(parsed);
        return {
            success: true,
            data: result,
        };
    }
}
