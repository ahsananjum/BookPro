import { BadRequestException, Controller, Get, Post, Body, Query, Req, Res } from "@nestjs/common";
import { Public, ReqContext, RequirePermissions } from "@bookpro/server-core";
import { PermissionKey, RequestContext } from "@bookpro/contracts";
import { Request, Response } from "express";
import { StripeConnectService } from "./stripe-connect.service";

@Controller("payments/stripe")
export class StripeConnectController {
    constructor(private readonly connect: StripeConnectService) { }

    @Get("status")
    @RequirePermissions(PermissionKey.PAYMENT_READ)
    async getStatus(@ReqContext() ctx: RequestContext) {
        return { success: true, data: await this.connect.getStatus(this.organizationId(ctx)) };
    }

    @Post("connect")
    @RequirePermissions(PermissionKey.FINANCIAL_ADMIN)
    async beginConnect(@ReqContext() ctx: RequestContext, @Req() req: Request, @Body() body?: { returnPath?: string }) {
        this.assertSameOrigin(req);
        return { success: true, data: await this.connect.begin(this.organizationId(ctx), ctx.subjectId, body?.returnPath) };
    }

    @Public()
    @Get("connect-callback")
    async handleCallback(@Query("code") code: string, @Query("state") state: string, @Query("error") error: string | undefined, @Res() res: Response) {
        const fallback = `${new URL(process.env.WEB_URL || "http://localhost:3000").origin}/onboarding?step=8`;
        if (error) {
            if (state) await this.connect.abandonOAuth(state).catch(() => undefined);
            return res.redirect(`${fallback}&stripe_result=authorization_denied`);
        }
        if (!code || !state) return res.redirect(`${fallback}&stripe_result=invalid_callback`);
        try {
            return res.redirect(`${await this.connect.completeOAuth(code, state)}&stripe_result=pending_verification`);
        } catch {
            return res.redirect(`${fallback}&stripe_result=connection_failed`);
        }
    }

    @Post("disconnect")
    @RequirePermissions(PermissionKey.FINANCIAL_ADMIN)
    async disconnect(@ReqContext() ctx: RequestContext, @Req() req: Request) {
        this.assertSameOrigin(req);
        await this.connect.disconnect(this.organizationId(ctx));
        return { success: true, data: { connected: false } };
    }

    private organizationId(ctx: RequestContext) {
        if (!ctx.organizationId) throw new BadRequestException("Organization context is required");
        return ctx.organizationId;
    }

    private assertSameOrigin(req: Request) {
        const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000")
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

        const expected = new URL(process.env.WEB_URL || "http://localhost:3000").origin.toLowerCase();
        if (!allowedOrigins.includes(expected)) {
            allowedOrigins.push(expected);
        }

        const supplied = (req.header("origin") || this.originFromReferer(req.header("referer")) || "").toLowerCase();
        if (
            !supplied ||
            (!allowedOrigins.includes(supplied) &&
                !(process.env.NODE_ENV !== "production" && (supplied.includes("localhost") || supplied.includes("127.0.0.1")))) ||
            req.header("sec-fetch-site") === "cross-site"
        ) {
            throw new BadRequestException("Request origin could not be verified");
        }
    }

    private originFromReferer(referer?: string) {
        try { return referer ? new URL(referer).origin : undefined; } catch { return undefined; }
    }
}

