import { Injectable, Logger, Inject, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { EncryptionService, CALENDAR_PROVIDER, CalendarProvider } from "@bookpro/server-core";
import * as crypto from "crypto";

@Injectable()
export class GoogleOAuthService {
    private readonly logger = new Logger(GoogleOAuthService.name);

    constructor(
        private readonly prisma: PrismaService,
        @Inject(CALENDAR_PROVIDER) private readonly calendarProvider: CalendarProvider,
    ) { }

    private getRedirectUri(): string {
        const baseUrl = process.env.API_BASE_URL || "http://localhost:4000";
        return `${baseUrl}/api/v1/integrations/google/callback`;
    }

    /**
     * Generates a tamper-proof OAuth connect URL bound to tenant, staff, and timestamp
     */
    async generateConnectUrl(organizationId: string, staffId: string, userId: string): Promise<{ url: string; state: string }> {
        const state = EncryptionService.generateOAuthState({
            organizationId,
            staffId,
            userId,
        });
        const payload = EncryptionService.verifyOAuthState(state);
        await this.prisma.googleOAuthState.create({ data: {
            nonceHash: this.hash(payload.nonce), organizationId, staffId, actorId: userId,
            expiresAt: new Date(payload.timestamp + 15 * 60 * 1000),
        }});

        const redirectUri = this.getRedirectUri();
        const url = this.calendarProvider.getAuthUrl(state, redirectUri);

        return { url, state };
    }

    /**
     * Completes OAuth code exchange server-side, encrypts refresh token, and creates connection
     */
    async handleOAuthCallback(code: string, state: string) {
        // Step 1: Cryptographic state validation (PRD §74 / Architecture §74)
        const statePayload = EncryptionService.verifyOAuthState(state);
        const { organizationId, staffId, userId, nonce } = statePayload;
        if (!userId) throw new BadRequestException("OAuth state is not bound to an actor");
        const consumed = await this.prisma.googleOAuthState.updateMany({
            where: { nonceHash: this.hash(nonce), organizationId, staffId, actorId: userId, usedAt: null, expiresAt: { gt: new Date() } },
            data: { usedAt: new Date() },
        });
        if (consumed.count !== 1) throw new BadRequestException("OAuth state is expired, invalid, or has already been used");

        const staff = await this.prisma.staffProfile.findFirst({
            where: { id: staffId, organizationId },
        });

        if (!staff) {
            throw new NotFoundException(`Staff profile ${staffId} in organization ${organizationId} not found`);
        }

        // Step 2: Code exchange
        const redirectUri = this.getRedirectUri();
        const tokens = await this.calendarProvider.exchangeOAuthCode(code, redirectUri);

        if (!tokens.refreshToken) {
            // Check if existing connection already has a refresh token
            const existing = await this.prisma.googleCalendarConnection.findUnique({
                where: {
                    organizationId_staffId_provider: {
                        organizationId,
                        staffId,
                        provider: "GOOGLE",
                    },
                },
            });

            if (!existing?.encryptedRefreshToken) {
                throw new BadRequestException(
                    "Google did not return a refresh token. Please revoke access and connect again with prompt=consent."
                );
            }
        }

        const encryptedRefreshToken = tokens.refreshToken
            ? EncryptionService.encrypt(tokens.refreshToken)
            : undefined;

        const expiresAt = new Date(Date.now() + (tokens.expiresIn || 3600) * 1000);

        // Step 3: Register push watch notification channel
        const channelId = crypto.randomUUID();
        const channelToken = crypto.randomBytes(32).toString("base64url");
        const webhookUrl = process.env.GOOGLE_WEBHOOK_URL;
        if (!webhookUrl) throw new Error("GOOGLE_WEBHOOK_URL must be configured for Google Calendar push notifications");
        const parsedWebhookUrl = new URL(webhookUrl);
        if (process.env.NODE_ENV === "production" && parsedWebhookUrl.protocol !== "https:") {
            throw new Error("GOOGLE_WEBHOOK_URL must use HTTPS in production");
        }

        let watchResult: any = null;
        try {
            watchResult = await this.calendarProvider.registerWatch(
                tokens.accessToken,
                "primary",
                webhookUrl,
                channelId,
                channelToken,
            );
        } catch (err: any) {
            this.logger.warn(`Google registerWatch warning (non-fatal): ${err.message}`);
        }

        // Step 4: Upsert durable connection
        const connection = await this.prisma.googleCalendarConnection.upsert({
            where: {
                organizationId_staffId_provider: {
                    organizationId,
                    staffId,
                    provider: "GOOGLE",
                },
            },
            create: {
                organizationId,
                staffId,
                provider: "GOOGLE",
                encryptedRefreshToken: encryptedRefreshToken!,
                encryptedAccessToken: EncryptionService.encrypt(tokens.accessToken),
                accessTokenExpiresAt: expiresAt,
                selectedCalendarId: "primary",
                selectedCalendarName: "Primary Calendar",
                channelId: watchResult?.channelId || null,
                resourceId: watchResult?.resourceId || null,
                channelTokenHash: watchResult ? this.hash(channelToken) : null,
                lastMessageNumber: null,
                channelExpiration: watchResult?.expiration ? new Date(Number(watchResult.expiration)) : null,
                status: "CONNECTED",
                lastSuccessAt: new Date(),
                lastError: null,
            },
            update: {
                encryptedRefreshToken: encryptedRefreshToken || undefined,
                encryptedAccessToken: EncryptionService.encrypt(tokens.accessToken),
                accessTokenExpiresAt: expiresAt,
                channelId: watchResult?.channelId || null,
                resourceId: watchResult?.resourceId || null,
                channelTokenHash: watchResult ? this.hash(channelToken) : null,
                lastMessageNumber: null,
                channelExpiration: watchResult?.expiration ? new Date(Number(watchResult.expiration)) : null,
                status: "CONNECTED",
                lastSuccessAt: new Date(),
                lastError: null,
            },
        });

        await this.prisma.auditLog.create({ data: {
            organizationId, actorType: "STAFF", actorId: userId,
            action: "calendar.google.connected", resourceType: "GoogleCalendarConnection", resourceId: connection.id,
            payload: { staffId, provider: "GOOGLE", scopes: tokens.scope?.split(" ").filter(Boolean) || [] },
        }});

        this.logger.log(`[GoogleOAuth] Staff ${staffId} successfully connected Google Calendar.`);

        return connection;
    }

    /**
     * Resolves a valid access token, auto-refreshing via encrypted refresh token if expired
     */
    async getValidAccessToken(connectionId: string): Promise<string> {
        const connection = await this.prisma.googleCalendarConnection.findUnique({
            where: { id: connectionId },
        });

        if (!connection) {
            throw new NotFoundException(`Google Calendar connection ${connectionId} not found`);
        }

        const now = new Date();
        const bufferMs = 60 * 1000; // 1 minute safety buffer

        if (
            connection.encryptedAccessToken &&
            connection.accessTokenExpiresAt &&
            connection.accessTokenExpiresAt.getTime() > now.getTime() + bufferMs
        ) {
            return EncryptionService.decrypt(connection.encryptedAccessToken);
        }

        // Token expired -> refresh via encrypted refresh token
        const rawRefreshToken = EncryptionService.decrypt(connection.encryptedRefreshToken);

        try {
            const { accessToken, expiresIn } = await this.calendarProvider.refreshAccessToken(rawRefreshToken);
            const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

            await this.prisma.googleCalendarConnection.update({
                where: { id: connection.id },
                data: {
                    encryptedAccessToken: EncryptionService.encrypt(accessToken),
                    accessTokenExpiresAt: newExpiresAt,
                    status: "CONNECTED",
                    lastError: null,
                },
            });

            return accessToken;
        } catch (err: any) {
            this.logger.error(`[GoogleOAuth] Token refresh failed for connection ${connectionId}: ${err.message}`);
            // Check if invalid_grant
            if (err.message?.includes("invalid_grant") || err.status === 401) {
                await this.prisma.googleCalendarConnection.update({
                    where: { id: connection.id },
                    data: {
                        status: "ACTION_REQUIRED",
                        lastError: "Google authorization revoked or expired. Please reconnect.",
                    },
                });
            }
            throw err;
        }
    }

    private hash(value: string): string {
        return crypto.createHash("sha256").update(value, "utf8").digest("hex");
    }
}
