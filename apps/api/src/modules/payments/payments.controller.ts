import { Controller, Post, Get, Body, Param, Query, Headers, Req, ForbiddenException, BadRequestException } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { CreatePaymentIntentDto, ProcessWebhookDto, PermissionKey, RequestContext } from "@bookpro/contracts";
import { Public, ReqContext, RequirePermissions } from "@bookpro/server-core";
import { OrganizationService } from "../organization/organization.service";
import { PrismaService } from "../database/prisma.service";
import { Request } from "express";
import { createPaymentIntentSchema, publicCreatePaymentIntentSchema } from "@bookpro/validation";

@Controller("payments")
export class PaymentsController {
    constructor(
        private readonly paymentsService: PaymentsService,
        private readonly organizations: OrganizationService,
        private readonly prisma: PrismaService,
    ) { }

    @Get("organizations/:orgId")
    @RequirePermissions(PermissionKey.PAYMENT_READ)
    async listPayments(
        @Param("orgId") orgId: string,
        @Query("status") status?: any,
        @Query("customerId") customerId?: string,
        @Query("appointmentId") appointmentId?: string,
        @Query("startDate") startDate?: string,
        @Query("endDate") endDate?: string,
        @Query("search") search?: string,
        @Query("limit") limit?: string,
        @Query("offset") offset?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        if (orgId && ctx?.organizationId && !ctx?.isPlatformAdmin && ctx?.organizationId !== orgId) {
            throw new ForbiddenException("Payment resource not found");
        }
        return this.paymentsService.listPayments(orgId, {
            status,
            customerId,
            appointmentId,
            startDate,
            endDate,
            search,
            limit: limit ? parseInt(limit, 10) : undefined,
            offset: offset ? parseInt(offset, 10) : undefined,
        });
    }

    @Get("organizations/:orgId/summary")
    @RequirePermissions(PermissionKey.PAYMENT_READ)
    async getPaymentsSummary(
        @Param("orgId") orgId: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        if (orgId && ctx?.organizationId && !ctx?.isPlatformAdmin && ctx?.organizationId !== orgId) {
            throw new ForbiddenException("Payment resource not found");
        }
        return this.paymentsService.getPaymentsSummary(orgId);
    }

    @Public()
    @Post("public/intents")
    async createPublicPaymentIntent(
        @Body() body: unknown,
        @Headers("x-tenant-slug") tenantSlug?: string,
        @Headers("x-idempotency-key") idempotencyKey?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        let organizationId = "";
        if (tenantSlug) {
            organizationId = await this.organizations.resolvePublishedOrganizationId(tenantSlug).catch(() => "");
        }
        if (!organizationId && (body as any)?.bookingHoldId) {
            const hold = await this.prisma.bookingHold.findUnique({
                where: { id: (body as any).bookingHoldId },
                select: { organizationId: true },
            });
            if (hold) organizationId = hold.organizationId;
        }
        if (!organizationId && (body as any)?.organizationId) {
            organizationId = (body as any).organizationId;
        }
        if (!organizationId) {
            throw new BadRequestException("Organization context is required for payment initialization");
        }

        const rawBody = (typeof body === "object" && body !== null ? body : {}) as any;
        const bookingHoldId = rawBody.bookingHoldId;
        if (!bookingHoldId) {
            throw new BadRequestException("bookingHoldId is required");
        }

        const parsed = {
            bookingHoldId: String(bookingHoldId).trim(),
            guestToken: rawBody.guestToken ? String(rawBody.guestToken).trim() : undefined,
            idempotencyKey: (idempotencyKey || rawBody.idempotencyKey) ? String(idempotencyKey || rawBody.idempotencyKey).trim() : undefined,
            organizationId: rawBody.organizationId ? String(rawBody.organizationId).trim() : undefined,
        };

        return this.paymentsService.createPublicPaymentIntent({
            organizationId,
            body: parsed,
            idempotencyKey: idempotencyKey || parsed.idempotencyKey,
            ctx,
        });
    }

    @Public()
    @Post("public/payment-intent")
    async createPublicPaymentIntentAlias(
        @Body() body: unknown,
        @Headers("x-tenant-slug") tenantSlug?: string,
        @Headers("x-idempotency-key") idempotencyKey?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        return this.createPublicPaymentIntent(body, tenantSlug, idempotencyKey, ctx);
    }

    @Post("organizations/:orgId/intents")
    @RequirePermissions(PermissionKey.PAYMENT_MANAGE)
    async createPaymentIntent(
        @Param("orgId") orgId: string,
        @Body() body: unknown,
        @Headers("x-idempotency-key") idempotencyKey?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const organizationId = ctx?.organizationId || orgId;
        const dto: CreatePaymentIntentDto = createPaymentIntentSchema.parse(body);
        if (orgId && ctx?.organizationId && !ctx?.isPlatformAdmin && ctx?.organizationId !== orgId) {
            throw new ForbiddenException("Payment resource not found");
        }
        return this.paymentsService.createPaymentIntent(organizationId, {
            ...dto,
            idempotencyKey: idempotencyKey || dto.idempotencyKey,
        });
    }

    @Public()
    @Post("webhook")
    async processWebhook(
        @Req() req: Request & { rawBody?: Buffer },
        @Headers("stripe-signature") signatureHeader?: string,
        @Body() body?: unknown
    ) {
        const rawSignature = signatureHeader || req.headers["stripe-signature"];
        const signature = Array.isArray(rawSignature) ? rawSignature[0] : rawSignature;
        if (!signature) {
            throw new BadRequestException("Missing payment provider signature header (stripe-signature)");
        }

        const rawBody = req.rawBody || (typeof req.body === "string" ? req.body : (Buffer.isBuffer(req.body) ? req.body : JSON.stringify(body || {})));
        const payload = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

        return this.paymentsService.processWebhook({
            rawBody,
            signature,
            payload,
            eventId: typeof payload.id === "string" ? payload.id : "",
            eventType: typeof payload.type === "string" ? payload.type : "",
        });
    }
}

@Controller("organizations/:orgId/payments")
export class OrganizationPaymentsController {
    constructor(private readonly paymentsService: PaymentsService) { }

    @Get()
    @RequirePermissions(PermissionKey.PAYMENT_READ)
    async listPayments(
        @Param("orgId") orgId: string,
        @Query("status") status?: any,
        @Query("customerId") customerId?: string,
        @Query("appointmentId") appointmentId?: string,
        @Query("startDate") startDate?: string,
        @Query("endDate") endDate?: string,
        @Query("search") search?: string,
        @Query("limit") limit?: string,
        @Query("offset") offset?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        if (orgId && ctx?.organizationId && !ctx?.isPlatformAdmin && ctx?.organizationId !== orgId) {
            throw new ForbiddenException("Payment resource not found");
        }
        return this.paymentsService.listPayments(orgId, {
            status,
            customerId,
            appointmentId,
            startDate,
            endDate,
            search,
            limit: limit ? parseInt(limit, 10) : undefined,
            offset: offset ? parseInt(offset, 10) : undefined,
        });
    }

    @Get("summary")
    @RequirePermissions(PermissionKey.PAYMENT_READ)
    async getPaymentsSummary(
        @Param("orgId") orgId: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        if (orgId && ctx?.organizationId && !ctx?.isPlatformAdmin && ctx?.organizationId !== orgId) {
            throw new ForbiddenException("Payment resource not found");
        }
        return this.paymentsService.getPaymentsSummary(orgId);
    }
}
