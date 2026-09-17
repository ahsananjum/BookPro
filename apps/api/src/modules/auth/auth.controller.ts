import { Controller, Post, Get, Delete, Param, Body, Res, Req, HttpCode, HttpStatus, Headers, Query, BadRequestException, UnauthorizedException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { Public, ReqContext, Authenticated } from "@bookpro/server-core";
import { RequestContext } from "@bookpro/contracts";
import { AuthService } from "./auth.service";
import {
    loginSchema,
    acceptInviteSchema,
    registerBusinessSchema,
    registerCustomerSchema,
    selectOrganizationSchema,
    verifyEmailSchema,
    resendVerificationSchema,
    registrationSlugSchema,
    mfaCompleteSchema,
    selectCustomerOrganizationSchema,
} from "@bookpro/validation";

@Controller("auth")
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Public()
    @Post("login")
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 40, ttl: 60000 } })
    async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const validated = loginSchema.parse(body);
        const result = await this.authService.login(validated, this.metadata(req));
        if ("accessToken" in result) this.setSessionCookies(res, result.accessToken, result.refreshToken);
        const { accessToken: _accessToken, refreshToken: _refreshToken, ...safeResult } = result as any;

        return {
            success: true,
            data: safeResult,
        };
    }

    @Public()
    @Post("register-business")
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    async registerBusiness(
        @Body() body: unknown,
        @Headers("x-idempotency-key") idempotencyKey?: string,
    ) {
        const validated = registerBusinessSchema.parse(body);
        if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
            throw new BadRequestException({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Registration request identifier is missing. Refresh and try again." });
        }
        const result = await this.authService.registerBusiness(validated, idempotencyKey);
        return { success: true, data: result };
    }

    @Public()
    @Post("register-customer")
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    async registerCustomer(@Body() body: unknown) {
        return { success: true, data: await this.authService.registerCustomer(registerCustomerSchema.parse(body)) };
    }

    @Public()
    @Post("verify-email")
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    async verifyEmail(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const validated = verifyEmailSchema.parse(body);
        const result = await this.authService.verifyEmail(validated.token, validated.email, this.metadata(req));
        if ("accessToken" in result) this.setSessionCookies(res, result.accessToken, result.refreshToken);
        return { success: true, data: { nextUrl: result.nextUrl } };
    }

    @Public()
    @Post("resend-verification")
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    async resendVerification(@Body() body: unknown, @Req() req: Request) {
        const validated = resendVerificationSchema.parse(body);
        await this.authService.resendVerification(validated.email, this.metadata(req));
        return { success: true, data: { message: "If the account is awaiting verification, a new email is on its way." } };
    }

    @Public()
    @Get("registration/slug-availability")
    @Throttle({ default: { limit: 30, ttl: 60000 } })
    async slugAvailability(@Query() query: unknown) {
        const validated = registrationSlugSchema.parse(query);
        return { success: true, data: { slug: validated.slug, available: await this.authService.isOrganizationSlugAvailable(validated.slug) } };
    }

    @Public()
    @Post("logout")
    @HttpCode(HttpStatus.OK)
    async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const refreshToken = this.readCookie(req, "refresh_token");
        if (refreshToken) await this.authService.revokeByRefreshToken(refreshToken, this.metadata(req));
        this.clearSessionCookies(res);
        return { success: true, message: "Logged out successfully" };
    }

    @Public()
    @Post("refresh")
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 30, ttl: 60000 } })
    async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const token = this.readCookie(req, "refresh_token");
        if (!token) throw new UnauthorizedException({ code: "MISSING_REFRESH_TOKEN", message: "Refresh token is missing" });
        const result = await this.authService.refresh(token, this.metadata(req));
        if (result.refreshToken) {
            this.setSessionCookies(res, result.accessToken, result.refreshToken);
        } else {
            this.setAccessCookie(res, result.accessToken);
        }
        return { success: true };
    }

    @Public()
    @Post("mfa/complete")
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    async completeMfa(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const validated = mfaCompleteSchema.parse(body);
        const result = await this.authService.completeMfa(validated.challengeToken, validated.code, this.metadata(req));
        this.setSessionCookies(res, result.accessToken, result.refreshToken);
        return { success: true, data: { recoveryCodes: result.recoveryCodes } };
    }

    @Get("me")
    @Authenticated()
    async getCurrentUser(@ReqContext() ctx: RequestContext) {
        return { success: true, data: await this.authService.getSessionProfile(ctx) };
    }

    @Get("memberships")
    @Authenticated()
    async getMemberships(@ReqContext() ctx: RequestContext) {
        return { success: true, data: await this.authService.listActiveMemberships(ctx.subjectId) };
    }

    @Post("select-organization")
    @Authenticated()
    @HttpCode(HttpStatus.OK)
    async selectOrganization(
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext,
        @Res({ passthrough: true }) res: Response,
    ) {
        const validated = selectOrganizationSchema.parse(body);
        if (!ctx.sessionId) throw new UnauthorizedException("Session context is missing");
        const result = await this.authService.selectOrganization(ctx.subjectId, validated.organizationId, ctx.sessionId);
        this.setAccessCookie(res, result.accessToken);
        return { success: true, data: { organization: result.organization } };
    }

    @Get("customer-organizations")
    @Authenticated()
    async getCustomerOrganizations(@ReqContext() ctx: RequestContext) {
        return {
            success: true,
            data: await this.authService.listCustomerOrganizations(ctx.subjectId),
        };
    }

    @Post("select-customer-organization")
    @Authenticated()
    @HttpCode(HttpStatus.OK)
    async selectCustomerOrganization(
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext,
        @Res({ passthrough: true }) res: Response,
    ) {
        const validated = selectCustomerOrganizationSchema.parse(body);
        if (!ctx.sessionId) throw new UnauthorizedException("Session context is missing");
        const result = await this.authService.selectCustomerOrganization(ctx.subjectId, validated.organizationId, ctx.sessionId);
        this.setAccessCookie(res, result.accessToken);
        return { success: true, data: { organization: result.organization } };
    }

    @Public()
    @Post("invite/accept")
    @HttpCode(HttpStatus.OK)
    async acceptInvite(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const validated = acceptInviteSchema.parse(body);
        const result = await this.authService.acceptInvite(validated, this.metadata(req));
        if ("accessToken" in result) this.setSessionCookies(res, result.accessToken, result.refreshToken);
        const { accessToken: _accessToken, refreshToken: _refreshToken, ...safeResult } = result as any;

        return {
            success: true,
            data: safeResult,
        };
    }

    private setAccessCookie(res: Response, accessToken: string) {
        res.cookie("access_token", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: this.authService.getJwtExpiresInMs(),
            path: "/",
        });
    }

    @Get("sessions")
    @Authenticated()
    async sessions(@ReqContext() ctx: RequestContext) { return { success: true, data: await this.authService.listSessions(ctx.subjectId, ctx.sessionId) }; }

    @Delete("sessions/:id")
    @Authenticated()
    async revokeDevice(@Param("id") id: string, @Req() req: Request, @ReqContext() ctx: RequestContext, @Res({ passthrough: true }) res: Response) {
        await this.authService.revokeSession(id, "user_revoked_device", this.metadata(req), ctx.subjectId);
        if (id === ctx.sessionId) this.clearSessionCookies(res);
        return { success: true };
    }

    @Post("sessions/revoke-all")
    @Authenticated()
    async revokeAll(@Req() req: Request, @ReqContext() ctx: RequestContext) { return { success: true, data: { revoked: await this.authService.revokeAllSessions(ctx.subjectId, ctx.sessionId, this.metadata(req)) } }; }

    @Post("sessions/revoke-global")
    @Authenticated()
    async revokeGlobal(@Req() req: Request, @ReqContext() ctx: RequestContext, @Res({ passthrough: true }) res: Response) {
        const revoked = await this.authService.revokeAllSessions(ctx.subjectId, undefined, this.metadata(req));
        this.clearSessionCookies(res);
        return { success: true, data: { revoked } };
    }

    private setSessionCookies(res: Response, accessToken: string, refreshToken: string) {
        this.setAccessCookie(res, accessToken);
        res.cookie("refresh_token", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: this.authService.getRefreshLifetimeMs(),
            path: "/api/v1/auth",
        });
    }

    private clearSessionCookies(res: Response) {
        res.clearCookie("access_token", { path: "/" });
        res.clearCookie("refresh_token", { path: "/api/v1/auth" });
    }

    private readCookie(req: Request, name: string) { const match = req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)); return match ? decodeURIComponent(match[1]) : undefined; }
    private metadata(req: Request) { return { ipAddress: req.ip || req.socket.remoteAddress, userAgent: req.header("user-agent") }; }
}
