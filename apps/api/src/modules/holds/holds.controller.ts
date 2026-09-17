import {
    Controller,
    Post,
    Put,
    Get,
    Delete,
    Body,
    Param,
    Query,
    Headers,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { BookingHoldService, CreateHoldInput } from './booking-hold.service';
import { ReqContext, Public, RequirePermissions } from '@bookpro/server-core';
import { RequestContext, PermissionKey, ActorType } from '@bookpro/contracts';
import { OrganizationService } from '../organization/organization.service';
import { PrismaService } from '../database/prisma.service';
import { publicCreateHoldSchema, publicHoldDetailsSchema, publicReleaseHoldSchema } from '@bookpro/validation';

@Controller('holds')
export class HoldsController {
    constructor(
        private readonly bookingHoldService: BookingHoldService,
        private readonly organizations: OrganizationService,
        private readonly prisma: PrismaService,
    ) { }

    private resolveOrgId(ctx?: RequestContext, headerOrgId?: string, queryOrgId?: string, bodyOrgId?: string): string {
        const organizationId = ctx?.organizationId || headerOrgId || queryOrgId || bodyOrgId;
        if (!organizationId) throw new BadRequestException('Organization context is required');
        return organizationId;
    }

    private toUuidOrNull(val?: string | null): string | null {
        if (!val) return null;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val) ? val : null;
    }

    private async resolveOrgFromRequest(
        tenantSlug?: string,
        headerOrgId?: string,
        holdId?: string,
        serviceId?: string,
        ctx?: RequestContext,
    ): Promise<string> {
        let organizationId = headerOrgId || ctx?.organizationId;
        if (!organizationId && tenantSlug) {
            try {
                organizationId = await this.organizations.resolvePublishedOrganizationId(tenantSlug);
            } catch {
                const org = await this.prisma.organization.findFirst({
                    where: { slug: tenantSlug.toLowerCase(), archivedAt: null },
                    select: { id: true },
                });
                if (org) organizationId = org.id;
            }
        }
        if (!organizationId && holdId) {
            const hold = await this.prisma.bookingHold.findUnique({
                where: { id: holdId },
                select: { organizationId: true },
            });
            if (hold) organizationId = hold.organizationId;
        }
        if (!organizationId && serviceId) {
            const srv = await this.prisma.service.findUnique({
                where: { id: serviceId },
                select: { organizationId: true },
            });
            if (srv) organizationId = srv.organizationId;
        }
        if (!organizationId) {
            throw new BadRequestException('Organization context or x-tenant-slug is required');
        }
        return organizationId;
    }

    @Public()
    @Post()
    async createHold(
        @Body() body: unknown,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') tenantSlug?: string,
        @Headers('x-idempotency-key') idempotencyKey?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const parsed = publicCreateHoldSchema.parse(body);
        const organizationId = await this.resolveOrgFromRequest(
            tenantSlug,
            (body as any)?.organizationId || headerOrgId,
            undefined,
            parsed.serviceId,
            ctx,
        );

        if (ctx?.actorType === ActorType.CUSTOMER) {
            if (!ctx.customerId || !ctx.organizationId || ctx.organizationId !== organizationId) {
                throw new ForbiddenException({
                    code: 'CUSTOMER_ORGANIZATION_REQUIRED',
                    message: 'Select a joined organization from your customer portal before booking.',
                });
            }
        }

        // Derive customer identity strictly from verified server auth context if logged in as customer
        const customerId = ctx?.actorType === ActorType.CUSTOMER && ctx?.customerId ? ctx.customerId : null;

        return this.bookingHoldService.createHold({
            organizationId,
            locationId: parsed.locationId,
            serviceId: parsed.serviceId,
            staffId: parsed.staffId,
            startAt: parsed.startAt,
            endAt: parsed.endAt,
            partySize: parsed.partySize,
            guestName: parsed.guestName,
            guestEmail: parsed.guestEmail,
            guestPhone: parsed.guestPhone,
            customerId,
            idempotencyKey: idempotencyKey || parsed.idempotencyKey || null,
            createdById: this.toUuidOrNull(ctx?.subjectId),
        });
    }

    @Public()
    @Put('public/:id/details')
    async persistHoldDetails(
        @Param('id') id: string,
        @Body() body: unknown,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') tenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const parsed = publicHoldDetailsSchema.parse(body);
        const organizationId = await this.resolveOrgFromRequest(tenantSlug, headerOrgId, id, undefined, ctx);

        return this.bookingHoldService.persistHoldDetails(id, organizationId, parsed);
    }

    @Public()
    @Get('public/:id')
    async getPublicHoldReview(
        @Param('id') id: string,
        @Query('guestToken') guestToken?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') tenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const organizationId = await this.resolveOrgFromRequest(tenantSlug, headerOrgId, id, undefined, ctx);
        const customerId = ctx?.actorType === ActorType.CUSTOMER ? ctx?.customerId : undefined;

        return this.bookingHoldService.getCanonicalHoldReview(id, organizationId, guestToken, customerId);
    }

    @Public()
    @Delete('public/:id')
    async releasePublicHold(
        @Param('id') id: string,
        @Query('guestToken') queryGuestToken?: string,
        @Body() body?: unknown,
        @Headers('x-organization-id') headerOrgId?: string,
        @Headers('x-tenant-slug') tenantSlug?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const guestToken = queryGuestToken || (body ? publicReleaseHoldSchema.parse(body).guestToken : undefined);
        const organizationId = await this.resolveOrgFromRequest(tenantSlug, headerOrgId, id, undefined, ctx);

        return this.bookingHoldService.cancelHold(id, organizationId, guestToken);
    }

    @RequirePermissions(PermissionKey.APPOINTMENT_READ)
    @Get(':id')
    async getHold(
        @Param('id') id: string,
        @Query('organizationId') queryOrgId?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const organizationId = this.resolveOrgId(ctx, headerOrgId, queryOrgId);
        return this.bookingHoldService.getHold(id, organizationId);
    }

    @RequirePermissions(PermissionKey.APPOINTMENT_MUTATE)
    @Delete(':id')
    async cancelHold(
        @Param('id') id: string,
        @Query('organizationId') queryOrgId?: string,
        @Headers('x-organization-id') headerOrgId?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const organizationId = this.resolveOrgId(ctx, headerOrgId, queryOrgId);
        return this.bookingHoldService.cancelHold(id, organizationId);
    }
}
