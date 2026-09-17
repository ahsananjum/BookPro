import {
    Controller,
    Get,
    Post,
    Query,
    Body,
    Headers,
    Res,
    BadRequestException,
    ForbiddenException,
} from "@nestjs/common";
import { Response } from "express";
import { GoogleOAuthService } from "./google-oauth.service";
import { CalendarConnectionService } from "./calendar-connection.service";
import { PrismaService } from "../database/prisma.service";
import { Public, ReqContext, RequirePermissions } from "@bookpro/server-core";
import { RequestContext, SelectGoogleCalendarInput, PermissionKey, ActorType } from "@bookpro/contracts";
import { selectCalendarSchema, staffIdBodySchema } from "@bookpro/validation";

@Controller("integrations/google")
export class CalendarIntegrationController {
    constructor(
        private readonly oauthService: GoogleOAuthService,
        private readonly connectionService: CalendarConnectionService,
        private readonly prisma: PrismaService,
    ) { }

    private resolveOrgId(ctx?: RequestContext, headerOrgId?: string, queryOrgId?: string): string {
        if (!ctx?.organizationId) throw new BadRequestException("An active organization is required.");
        return ctx.organizationId;
    }

    private async assertStaffAccess(ctx: RequestContext, staffId: string) {
        if (ctx.actorType === ActorType.CUSTOMER) {
            throw new ForbiddenException("Customer accounts are not authorized to manage staff calendar integrations");
        }

        if (ctx.isPlatformAdmin) {
            return;
        }

        const hasManage =
            ctx.permissions?.includes(PermissionKey.INTEGRATION_MANAGE) ||
            ctx.permissions?.includes(PermissionKey.STAFF_MANAGE);

        if (hasManage) {
            return;
        }

        // If no manage permission, the staff member can only access their own calendar
        if (ctx.membershipId) {
            const staff = await this.prisma.staffProfile.findFirst({
                where: { membershipId: ctx.membershipId },
                select: { id: true },
            });
            if (staff && staff.id === staffId) {
                return;
            }
        }

        throw new ForbiddenException("You are not authorized to manage this staff member's calendar integration");
    }

    @Get("connect")
    @RequirePermissions(PermissionKey.CALENDAR_MANAGE)
    async getConnectUrl(
        @Query("staffId") staffId: string,
        @Headers("x-organization-id") headerOrgId?: string,
        @Query("organizationId") queryOrgId?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        if (!staffId) {
            throw new BadRequestException("staffId query parameter is required");
        }
        const orgId = this.resolveOrgId(ctx, headerOrgId, queryOrgId);
        if (ctx) {
            await this.assertStaffAccess(ctx, staffId);
        }
        const result = await this.oauthService.generateConnectUrl(orgId, staffId, ctx!.subjectId);
        return { success: true, data: result };
    }

    @Public()
    @Get("callback")
    async handleOAuthCallback(
        @Query("code") code: string,
        @Query("state") state: string,
        @Res() res: Response,
    ) {
        if (!code || !state) {
            throw new BadRequestException("Missing code or state in Google OAuth callback");
        }

        try {
            await this.oauthService.handleOAuthCallback(code, state);
            const webUrl = process.env.WEB_URL || "http://localhost:3000";
            return res.redirect(`${webUrl}/app/integrations/google?status=connected`);
        } catch (err: any) {
            const webUrl = process.env.WEB_URL || "http://localhost:3000";
            return res.redirect(`${webUrl}/app/integrations/google?error=connection_failed`);
        }
    }

    @Get("status")
    @RequirePermissions(PermissionKey.CALENDAR_MANAGE)
    async getConnectionStatus(
        @Query("staffId") staffId: string,
        @Headers("x-organization-id") headerOrgId?: string,
        @Query("organizationId") queryOrgId?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        if (!staffId) {
            throw new BadRequestException("staffId query parameter is required");
        }
        const orgId = this.resolveOrgId(ctx, headerOrgId, queryOrgId);
        if (ctx) {
            await this.assertStaffAccess(ctx, staffId);
        }
        const data = await this.connectionService.getConnectionStatus(orgId, staffId);
        return { success: true, data };
    }

    @Get("calendars")
    @RequirePermissions(PermissionKey.CALENDAR_MANAGE)
    async listStaffCalendars(
        @Query("staffId") staffId: string,
        @Headers("x-organization-id") headerOrgId?: string,
        @Query("organizationId") queryOrgId?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        if (!staffId) {
            throw new BadRequestException("staffId query parameter is required");
        }
        const orgId = this.resolveOrgId(ctx, headerOrgId, queryOrgId);
        if (ctx) {
            await this.assertStaffAccess(ctx, staffId);
        }
        const data = await this.connectionService.listStaffCalendars(orgId, staffId);
        return { success: true, data };
    }

    @Post("select-calendar")
    @RequirePermissions(PermissionKey.CALENDAR_MANAGE)
    async selectCalendar(
        @Body() body: unknown,
        @Headers("x-organization-id") headerOrgId?: string,
        @Query("organizationId") queryOrgId?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const parsed = selectCalendarSchema.parse(body);
        const orgId = this.resolveOrgId(ctx, headerOrgId, queryOrgId);
        if (ctx) {
            await this.assertStaffAccess(ctx, parsed.staffId);
        }
        const input: SelectGoogleCalendarInput = {
            organizationId: orgId,
            staffId: parsed.staffId,
            calendarId: parsed.calendarId,
            calendarName: parsed.calendarName,
        };
        const data = await this.connectionService.selectCalendar(input, ctx?.subjectId);
        return { success: true, data };
    }

    @Post("resync")
    @RequirePermissions(PermissionKey.CALENDAR_MANAGE)
    async triggerResync(
        @Body() body: unknown,
        @Headers("x-organization-id") headerOrgId?: string,
        @Query("organizationId") queryOrgId?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const parsed = staffIdBodySchema.parse(body);
        const orgId = this.resolveOrgId(ctx, headerOrgId, queryOrgId);
        if (ctx) {
            await this.assertStaffAccess(ctx, parsed.staffId);
        }
        const data = await this.connectionService.triggerManualResync(orgId, parsed.staffId);
        return { success: true, data };
    }

    @Post("disconnect")
    @RequirePermissions(PermissionKey.CALENDAR_MANAGE)
    async disconnect(
        @Body() body: unknown,
        @Headers("x-organization-id") headerOrgId?: string,
        @Query("organizationId") queryOrgId?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const parsed = staffIdBodySchema.parse(body);
        const orgId = this.resolveOrgId(ctx, headerOrgId, queryOrgId);
        if (ctx) {
            await this.assertStaffAccess(ctx, parsed.staffId);
        }
        const data = await this.connectionService.disconnect(orgId, parsed.staffId, ctx?.subjectId);
        return { success: true, data };
    }
}
