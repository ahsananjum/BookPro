import { BadRequestException, ConflictException, Inject, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { STRIPE_CONNECT_PROVIDER, StripeConnectProvider } from "./stripe-connect-provider.interface";
import * as crypto from "crypto";

interface StateClaims { organizationId: string; actorId: string; nonce: string; expiresAt: number; }

@Injectable()
export class StripeConnectService {
    private readonly logger = new Logger(StripeConnectService.name);
    private readonly stateTtlMs = 10 * 60 * 1000;

    constructor(
        private readonly prisma: PrismaService,
        @Inject(STRIPE_CONNECT_PROVIDER) private readonly provider: StripeConnectProvider,
    ) { }

    async getStatus(organizationId: string) {
        const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: {
            stripeAccountId: true, stripeConnectedAt: true, paymentIntent: true,
            stripeChargesEnabled: true, stripePayoutsEnabled: true, stripeDetailsSubmitted: true,
        }});
        if (!org) throw new BadRequestException("Organization not found");

        let chargesEnabled = org.stripeChargesEnabled;
        let payoutsEnabled = org.stripePayoutsEnabled;
        let detailsSubmitted = org.stripeDetailsSubmitted;
        let connectedAt = org.stripeConnectedAt;

        if (org.stripeAccountId && (!chargesEnabled || !detailsSubmitted) && this.provider.isConfigured()) {
            try {
                const live = await this.provider.retrieveAccount(org.stripeAccountId);
                if (live.chargesEnabled !== chargesEnabled || live.detailsSubmitted !== detailsSubmitted) {
                    chargesEnabled = live.chargesEnabled;
                    payoutsEnabled = live.payoutsEnabled;
                    detailsSubmitted = live.detailsSubmitted;
                    connectedAt = new Date();
                    await this.prisma.organization.update({
                        where: { id: organizationId },
                        data: {
                            stripeChargesEnabled: chargesEnabled,
                            stripePayoutsEnabled: payoutsEnabled,
                            stripeDetailsSubmitted: detailsSubmitted,
                            stripeConnectedAt: connectedAt,
                        },
                    });
                }
            } catch (err: any) {
                this.logger.warn(`Could not sync live Stripe status for ${org.stripeAccountId}: ${err.message}`);
            }
        }

        return {
            connected: Boolean(org.stripeAccountId), accountId: org.stripeAccountId,
            connectedAt: connectedAt?.toISOString() || null,
            paymentIntent: org.paymentIntent || (org.stripeAccountId ? "ONLINE" : "IN_PERSON"),
            chargesEnabled, payoutsEnabled,
            detailsSubmitted,
        };
    }

    async begin(organizationId: string, actorId: string, requestedReturnPath?: string) {
        if (!this.provider.isConfigured()) throw new ServiceUnavailableException("Payment onboarding is temporarily unavailable");
        const returnPath = this.safeReturnPath(requestedReturnPath);
        const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, email: true, country: true, stripeAccountId: true } });
        if (!org) throw new BadRequestException("Organization not found");

        if (this.provider.usesOAuth()) {
            const claims: StateClaims = { organizationId, actorId, nonce: crypto.randomBytes(32).toString("base64url"), expiresAt: Date.now() + this.stateTtlMs };
            const state = this.signState(claims);
            await this.prisma.stripeOAuthState.create({ data: {
                nonceHash: this.hash(claims.nonce), organizationId, actorId, returnPath, expiresAt: new Date(claims.expiresAt),
            }});
            return { url: this.provider.buildOAuthUrl(state), accountId: org.stripeAccountId };
        }

        try {
            let accountId = org.stripeAccountId;
            if (!accountId) {
                let email = org.email;
                if (!email && actorId) {
                    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { email: true } });
                    email = actor?.email || null;
                }
                if (!email) throw new BadRequestException("Add an organization email before starting payment onboarding");

                accountId = await this.provider.createAccount({
                    country: /^[A-Za-z]{2}$/.test(org.country) ? org.country.toUpperCase() : "US",
                    email, businessName: org.name, organizationId,
                });
                await this.claimAccount(organizationId, accountId);
            } else {
                await this.verifyOwnedAccount(organizationId, accountId);
            }
            const webBaseUrl = this.webBaseUrl();
            return { url: await this.provider.createOnboardingLink(accountId, `${webBaseUrl}${returnPath}`), accountId };
        } catch (err: any) {
            if (err instanceof BadRequestException || err instanceof UnauthorizedException || err instanceof ConflictException) {
                throw err;
            }
            const message = (err as any).cause?.message || err.message || "Failed to initialize Stripe Connect account";
            this.logger.error(`Stripe Connect initiation error: ${message}`, err.stack);
            throw new BadRequestException(`Stripe Connect setup error: ${message}`);
        }
    }


    async completeOAuth(code: string, state: string): Promise<string> {
        const { claims, row } = await this.consumeState(state);
        const accountId = await this.provider.exchangeOAuthCode(code);
        await this.claimAccount(claims.organizationId, accountId);
        return `${this.webBaseUrl()}${row.returnPath}`;
    }

    async abandonOAuth(state: string): Promise<void> {
        await this.consumeState(state);
    }

    private async consumeState(state: string) {
        const claims = this.verifyState(state);
        const row = await this.prisma.stripeOAuthState.findUnique({ where: { nonceHash: this.hash(claims.nonce) } });
        if (!row || row.organizationId !== claims.organizationId || row.actorId !== claims.actorId || row.usedAt || row.expiresAt <= new Date()) {
            throw new UnauthorizedException("Authorization request is invalid, expired, or already used");
        }
        const consumed = await this.prisma.stripeOAuthState.updateMany({
            where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() },
        });
        if (consumed.count !== 1) throw new UnauthorizedException("Authorization request is invalid, expired, or already used");
        return { claims, row };
    }

    async disconnect(organizationId: string) {
        await this.prisma.organization.update({ where: { id: organizationId }, data: {
            stripeAccountId: null, stripeConnectedAt: null, stripeChargesEnabled: false,
            stripePayoutsEnabled: false, stripeDetailsSubmitted: false,
        }});
    }

    private async claimAccount(organizationId: string, accountId: string) {
        const owner = await this.prisma.organization.findFirst({ where: { stripeAccountId: accountId }, select: { id: true } });
        if (owner && owner.id !== organizationId) {
            this.logger.warn(`Rejected attempt to attach a Stripe account already owned by another tenant`);
            throw new ConflictException("This payment account is already connected to another organization");
        }
        await this.prisma.organization.update({ where: { id: organizationId }, data: { stripeAccountId: accountId, paymentIntent: "ONLINE" } });
    }

    private async verifyOwnedAccount(organizationId: string, accountId: string) {
        const count = await this.prisma.organization.count({ where: { id: organizationId, stripeAccountId: accountId } });
        if (count !== 1) throw new UnauthorizedException("Payment account ownership could not be verified");
    }

    private safeReturnPath(value?: string) {
        const candidate = value || "/onboarding?step=8";
        if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return "/onboarding?step=8";
        return candidate;
    }

    private webBaseUrl() {
        const url = new URL(process.env.WEB_URL || "http://localhost:3000");
        return url.origin;
    }

    private signState(claims: StateClaims) {
        const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
        return `${body}.${crypto.createHmac("sha256", this.stateSecret()).update(body).digest("base64url")}`;
    }

    private verifyState(state: string): StateClaims {
        const [body, signature, extra] = (state || "").split(".");
        if (!body || !signature || extra) throw new UnauthorizedException("Invalid authorization state");
        const actual = Buffer.from(signature, "base64url");
        const expected = crypto.createHmac("sha256", this.stateSecret()).update(body).digest();
        if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw new UnauthorizedException("Invalid authorization state");
        try {
            const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StateClaims;
            if (!claims.organizationId || !claims.actorId || !claims.nonce || !Number.isFinite(claims.expiresAt) || claims.expiresAt <= Date.now()) throw new Error();
            return claims;
        } catch { throw new UnauthorizedException("Invalid or expired authorization state"); }
    }

    private stateSecret() {
        const secret = process.env.OAUTH_STATE_SECRET;
        if (!secret || secret.length < 32) throw new ServiceUnavailableException("Payment onboarding is temporarily unavailable");
        return secret;
    }
    private hash(value: string) { return crypto.createHash("sha256").update(value).digest("hex"); }
}
