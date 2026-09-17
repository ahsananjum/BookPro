import { Injectable, UnauthorizedException, BadRequestException, NotFoundException, ConflictException, HttpException, HttpStatus } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { LoginDto, AcceptInviteDto, RegisterBusinessDto, RegisterCustomerDto } from "@bookpro/validation";
import { DEFAULT_ROLE_PERMISSIONS, PermissionKey, RoleCode, ActorType, RequestContext } from "@bookpro/contracts";
import { EncryptionService } from "@bookpro/server-core";

export interface AuthRequestMetadata {
    ipAddress?: string;
    userAgent?: string;
}

export interface JwtPayload {
    sub: string;
    email: string;
    organizationId?: string;
    membershipId?: string;
    roleCode?: RoleCode;
    isPlatformAdmin: boolean;
    sid: string;
    amr: string[];
    iat?: number;
    exp?: number;
}

export function parseDurationToMs(duration: string | undefined, defaultMs: number): number {
    if (!duration) return defaultMs;
    const trimmed = duration.trim();
    const match = trimmed.match(/^(\d+)\s*([smhdw]?)$/i);
    if (!match) return defaultMs;
    const val = parseInt(match[1], 10);
    const unit = (match[2] || "s").toLowerCase();
    switch (unit) {
        case "s": return val * 1000;
        case "m": return val * 60 * 1000;
        case "h": return val * 60 * 60 * 1000;
        case "d": return val * 24 * 60 * 60 * 1000;
        case "w": return val * 7 * 24 * 60 * 60 * 1000;
        default: return defaultMs;
    }
}

@Injectable()
export class AuthService {
    private readonly jwtSecret = this.getRequiredJwtSecret();
    private readonly jwtExpiresIn = process.env.JWT_EXPIRES_IN || "7d";
    private readonly jwtExpiresInMs = parseDurationToMs(process.env.JWT_EXPIRES_IN || "7d", 7 * 24 * 60 * 60 * 1000);
    private readonly refreshLifetimeMs = parseDurationToMs(process.env.SESSION_EXPIRES_IN || "30d", 30 * 24 * 60 * 60 * 1000);

    constructor(private readonly prisma: PrismaService) { }

    getJwtExpiresIn(): string {
        return this.jwtExpiresIn;
    }

    getJwtExpiresInMs(): number {
        return this.jwtExpiresInMs;
    }

    getRefreshLifetimeMs(): number {
        return this.refreshLifetimeMs;
    }

    private getRequiredJwtSecret(): string {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32) throw new Error("JWT_SECRET must be configured with at least 32 characters");
        return secret;
    }

    private signAccessToken(payload: JwtPayload): string {
        return jwt.sign(payload, this.jwtSecret, { expiresIn: Math.floor(this.jwtExpiresInMs / 1000) });
    }

    async login(dto: LoginDto, metadata: AuthRequestMetadata = {}) {
        const normalizedEmail = dto.email.toLowerCase().trim();
        await this.enforceRateLimit("login-account", normalizedEmail, 8, 15 * 60, 30 * 60);
        await this.enforceRateLimit("login-ip", metadata.ipAddress || "unknown", 30, 15 * 60, 30 * 60);
        const user = await this.prisma.user.findUnique({
            where: { email: normalizedEmail },
            include: {
                memberships: {
                    include: {
                        organization: true,
                    },
                },
                customers: true,
            },
        });

        if (!user || !user.isActive) {
            await this.recordSecurityEvent("identity.login_failed", undefined, undefined, metadata, { emailHash: this.hashToken(normalizedEmail) });
            throw new UnauthorizedException({
                code: "INVALID_CREDENTIALS",
                message: "Invalid email or password",
            });
        }

        if (!user.passwordHash) {
            throw new UnauthorizedException({
                code: "NO_PASSWORD_SET",
                message: "Account does not have a password configured. Please check invitation email.",
            });
        }

        const isValidPassword = await bcrypt.compare(dto.password, user.passwordHash);
        if (!isValidPassword) {
            await this.recordSecurityEvent("identity.login_failed", user.id, undefined, metadata);
            throw new UnauthorizedException({
                code: "INVALID_CREDENTIALS",
                message: "Invalid email or password",
            });
        }

        // Pick active membership
        const activeMembership = user.memberships.find((m) => m.status === "ACTIVE");
        const activeCustomer = user.customers[0];

        const organizationId = activeMembership?.organizationId || activeCustomer?.organizationId;
        const privileged = user.isPlatformAdmin || user.memberships.some((membership) => membership.status === "ACTIVE" && (membership.roleCode === "OWNER" || membership.roleCode === "ADMIN"));
        if (privileged) {
            const credential = await this.prisma.mfaCredential.findUnique({ where: { userId: user.id } });
            const challenge = await this.createMfaChallenge(user.id, organizationId, credential ? "VERIFY" : "ENROLL", metadata);
            await this.recordSecurityEvent(credential ? "identity.mfa_challenge_issued" : "identity.mfa_enrollment_required", user.id, organizationId, metadata);
            return {
                mfaRequired: true as const,
                setupRequired: !credential,
                challengeToken: challenge.token,
                ...(challenge.secret ? {
                    totpSecret: challenge.secret,
                    otpauthUri: this.buildOtpAuthUri(user.email, challenge.secret),
                } : {}),
                user: { id: user.id, email: user.email, fullName: user.fullName, isPlatformAdmin: user.isPlatformAdmin },
                organization: activeMembership?.organization ? { id: activeMembership.organization.id, name: activeMembership.organization.name, slug: activeMembership.organization.slug, roleCode: activeMembership.roleCode } : null,
            };
        }

        const session = await this.createSession(user, activeMembership, activeCustomer, metadata, ["pwd"]);
        await this.clearRateLimits("login-account", normalizedEmail, "login-ip", metadata.ipAddress || "unknown");
        await this.recordSecurityEvent("identity.login_succeeded", user.id, organizationId, metadata, { sessionId: session.sessionId });

        return {
            ...session,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                isPlatformAdmin: user.isPlatformAdmin,
            },
            organization: activeMembership?.organization
                ? {
                    id: activeMembership.organization.id,
                    name: activeMembership.organization.name,
                    slug: activeMembership.organization.slug,
                    roleCode: activeMembership.roleCode,
                }
                : null,
        };
    }

    async registerBusiness(dto: RegisterBusinessDto, idempotencyKey: string) {
        const normalizedEmail = dto.email.toLowerCase();
        const requestFingerprint = crypto.createHash("sha256").update(JSON.stringify({ ...dto, email: normalizedEmail })).digest("hex");
        const prior = await this.prisma.registrationRequest.findUnique({
            where: { idempotencyKey },
            include: { user: true, organization: true },
        });
        if (prior) return this.registrationReplay(prior, requestFingerprint);

        const [existingUser, existingOrganization] = await Promise.all([
            this.prisma.user.findUnique({ where: { email: normalizedEmail }, include: { memberships: true } }),
            this.prisma.organization.findUnique({ where: { slug: dto.organizationSlug } }),
        ]);

        if (existingUser && existingUser.isActive && existingUser.emailVerifiedAt) {
            throw new BadRequestException({
                code: "REGISTRATION_UNAVAILABLE",
                message: "An active account with that email already exists. Please sign in instead.",
            });
        }
        if (existingOrganization && (!existingUser || !existingUser.memberships.some(m => m.organizationId === existingOrganization.id))) {
            throw new BadRequestException({
                code: "ORGANIZATION_SLUG_UNAVAILABLE",
                message: "That business URL is unavailable. Choose another.",
            });
        }
        if (existingUser) {
            throw new BadRequestException({
                code: "REGISTRATION_VERIFICATION_PENDING",
                message: "Registration is already awaiting email confirmation. Open the verification page to request a new code.",
            });
        }

        try {
            new Intl.DateTimeFormat("en-US", { timeZone: dto.timezone }).format(new Date());
        } catch {
            throw new BadRequestException({ code: "INVALID_TIMEZONE", message: "Choose a valid IANA timezone." });
        }

        const passwordHash = await bcrypt.hash(dto.password, 12);
        const rawVerificationCode = this.generateVerificationCode(normalizedEmail);
        const tokenHash = this.hashVerificationCode(normalizedEmail, rawVerificationCode);
        let result;
        try {
          result = await this.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: { email: normalizedEmail, fullName: dto.fullName, passwordHash, isActive: false },
            });
            const organization = await tx.organization.create({
                data: {
                    name: dto.organizationName,
                    slug: dto.organizationSlug,
                    timezone: dto.timezone,
                    currency: dto.currency,
                    email: normalizedEmail,
                    bookingEnabled: false,
                    onboardingStep: 1,
                    onboardingCompleted: false,
                },
            });
            const membership = await tx.membership.create({
                data: {
                    organizationId: organization.id,
                    userId: user.id,
                    roleCode: RoleCode.OWNER,
                    status: "ACTIVE",
                },
            });
            await tx.auditLog.create({
                data: {
                    organizationId: organization.id,
                    actorType: ActorType.STAFF,
                    actorId: user.id,
                    action: "organization.registered",
                    resourceType: "Organization",
                    resourceId: organization.id,
                    payload: { membershipId: membership.id },
                },
            });
            await tx.emailVerificationToken.create({
                data: {
                    userId: user.id,
                    organizationId: organization.id,
                    tokenHash,
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes OTP expiry
                },
            });
            await tx.registrationRequest.create({
                data: { idempotencyKey, requestFingerprint, userId: user.id, organizationId: organization.id },
            });
            await tx.outboxEvent.create({
                data: {
                    organizationId: organization.id,
                    aggregateType: "User",
                    aggregateId: user.id,
                    eventType: "identity.email_verification_requested",
                    payload: {
                        userId: user.id,
                        organizationId: organization.id,
                        recipientEmail: normalizedEmail,
                        fullName: user.fullName,
                        verificationCode: rawVerificationCode,
                    },
                },
            });
            return { user, organization, membership, verificationCode: rawVerificationCode };
          });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                const replay = await this.prisma.registrationRequest.findUnique({
                    where: { idempotencyKey }, include: { user: true, organization: true },
                });
                if (replay) return this.registrationReplay(replay, requestFingerprint);
                throw new ConflictException({
                    code: "REGISTRATION_CONFLICT",
                    message: "Those account details became unavailable. Review the email and business URL, then try again.",
                });
            }
            throw error;
        }

        return {
            status: "VERIFICATION_REQUIRED" as const,
            email: result.user.email,
            organization: {
                id: result.organization.id,
                name: result.organization.name,
                slug: result.organization.slug,
            },
        };
    }

    async registerCustomer(dto: RegisterCustomerDto) {
        const normalizedEmail = dto.email.toLowerCase().trim();
        const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existing) {
            throw new ConflictException({ code: "ACCOUNT_EXISTS", message: "An account already exists for this email. Sign in instead." });
        }
        const passwordHash = await bcrypt.hash(dto.password, 12);
        const rawVerificationCode = this.generateVerificationCode(normalizedEmail);
        const tokenHash = this.hashVerificationCode(normalizedEmail, rawVerificationCode);
        await this.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({ data: { email: normalizedEmail, fullName: dto.fullName, phone: dto.phone, passwordHash, isActive: false, accountType: "CUSTOMER" } });
            await tx.emailVerificationToken.create({ data: { userId: user.id, organizationId: null, tokenHash, expiresAt: new Date(Date.now() + 15 * 60 * 1000) } });
            await tx.outboxEvent.create({ data: { organizationId: null, aggregateType: "User", aggregateId: user.id, eventType: "identity.email_verification_requested", payload: { userId: user.id, recipientEmail: normalizedEmail, fullName: user.fullName, verificationCode: rawVerificationCode } } });
        });
        return { status: "VERIFICATION_REQUIRED" as const, email: normalizedEmail };
    }

    async verifyEmail(tokenOrCode: string, email: string, metadata: AuthRequestMetadata = {}) {
        await this.enforceRateLimit("verify-account", email.toLowerCase().trim(), 8, 15 * 60, 30 * 60);
        await this.enforceRateLimit("verify-ip", metadata.ipAddress || "unknown", 30, 15 * 60, 30 * 60);
        const cleanCode = tokenOrCode.trim();
        const normalizedEmail = email.toLowerCase().trim();
        const record = await this.prisma.emailVerificationToken.findFirst({
            where: {
                consumedAt: null,
                user: { email: normalizedEmail },
            },
            include: { user: true, organization: true },
            orderBy: { createdAt: "desc" },
        });

        if (!record || record.expiresAt <= new Date() || record.attempts >= 5) {
            throw new BadRequestException({
                code: "VERIFICATION_CODE_INVALID",
                message: "This code is no longer valid. Request a new code and try again.",
            });
        }

        const submittedHash = this.hashVerificationCode(normalizedEmail, cleanCode);
        const submitted = Buffer.from(submittedHash, "hex");
        const expected = Buffer.from(record.tokenHash, "hex");
        if (submitted.length !== expected.length || !crypto.timingSafeEqual(submitted, expected)) {
            const attempts = record.attempts + 1;
            await this.prisma.emailVerificationToken.update({
                where: { id: record.id },
                data: { attempts, ...(attempts >= 5 ? { consumedAt: new Date() } : {}) },
            });
            throw new BadRequestException({
                code: attempts >= 5 ? "VERIFICATION_CODE_LOCKED" : "VERIFICATION_CODE_INCORRECT",
                message: attempts >= 5 ? "Too many incorrect attempts. Request a new code." : "That code does not match. Check the email and try again.",
            });
        }

        const membership = await this.prisma.$transaction(async (tx) => {
            await tx.emailVerificationToken.update({
                where: { id: record.id },
                data: { consumedAt: new Date() },
            });
            await tx.user.update({
                where: { id: record.userId },
                data: { isActive: true, emailVerifiedAt: new Date() },
            });
            const ownerMembership = record.organizationId ? await tx.membership.findFirstOrThrow({
                where: { userId: record.userId, organizationId: record.organizationId, status: "ACTIVE" },
            }) : null;
            await tx.auditLog.create({
                data: {
                    organizationId: record.organizationId,
                    actorType: record.user.accountType === "CUSTOMER" ? ActorType.CUSTOMER : ActorType.STAFF,
                    actorId: record.userId,
                    action: "identity.email_verified",
                    resourceType: "User",
                    resourceId: record.userId,
                },
            });
            return ownerMembership;
        });

        if (membership && (membership.roleCode === "OWNER" || membership.roleCode === "ADMIN")) {
            await this.recordSecurityEvent("identity.mfa_enrollment_required", record.user.id, record.organizationId || undefined, metadata);
            return { mfaRequired: true as const, nextUrl: "/login" };
        }

        const session = await this.createSession(record.user, membership || undefined, undefined, metadata, ["email"]);
        await this.recordSecurityEvent("identity.session_created", record.user.id, record.organizationId || undefined, metadata, { sessionId: session.sessionId });
        return { ...session, nextUrl: membership ? "/onboarding" : "/customer" };
    }

    async resendVerification(email: string, metadata: AuthRequestMetadata = {}) {
        const normalizedEmail = email.trim().toLowerCase();
        await this.enforceRateLimit("resend-account", normalizedEmail, 3, 15 * 60, 60 * 60);
        await this.enforceRateLimit("resend-ip", metadata.ipAddress || "unknown", 12, 15 * 60, 60 * 60);
        const user = await this.prisma.user.findUnique({
            where: { email: normalizedEmail },
            include: {
                memberships: { take: 1, include: { organization: true } },
                emailVerificationTokens: {
                    where: { consumedAt: null },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { tokenHash: true },
                },
            },
        });
        if (!user || user.emailVerifiedAt || user.isActive) {
            return { success: true };
        }
        const membership = user.memberships[0];
        const rawCode = this.generateVerificationCode(normalizedEmail, user.emailVerificationTokens[0]?.tokenHash);
        const tokenHash = this.hashVerificationCode(normalizedEmail, rawCode);

        await this.prisma.$transaction(async (tx) => {
            await tx.emailVerificationToken.updateMany({
                where: { userId: user.id, consumedAt: null },
                data: { consumedAt: new Date() },
            });
            await tx.emailVerificationToken.create({
                data: {
                    userId: user.id,
                    organizationId: membership?.organizationId || null,
                    tokenHash,
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes OTP
                },
            });
            await tx.outboxEvent.create({
                data: {
                    organizationId: membership?.organizationId || null,
                    aggregateType: "User",
                    aggregateId: user.id,
                    eventType: "identity.email_verification_requested",
                    payload: {
                        userId: user.id,
                        organizationId: membership?.organizationId || null,
                        recipientEmail: normalizedEmail,
                        fullName: user.fullName,
                        verificationCode: rawCode,
                    },
                },
            });
        });

        return {
            success: true,
        };
    }

    async isOrganizationSlugAvailable(slug: string): Promise<boolean> {
        return (await this.prisma.organization.count({ where: { slug } })) === 0;
    }

    private hashToken(token: string): string {
        return crypto.createHash("sha256").update(token).digest("hex");
    }

    private async createSession(user: any, membership: any, customer: any, metadata: AuthRequestMetadata, amr: string[]) {
        const expiresAt = new Date(Date.now() + this.refreshLifetimeMs);
        const rawRefreshToken = crypto.randomBytes(48).toString("base64url");
        const deviceName = this.describeDevice(metadata.userAgent);
        const session = await this.prisma.$transaction(async (tx) => {
            const created = await tx.authSession.create({
                data: {
                    userId: user.id,
                    organizationId: membership?.organizationId || customer?.organizationId,
                    deviceName,
                    authLevel: amr.join(","),
                    userAgent: metadata.userAgent,
                    ipAddress: metadata.ipAddress,
                    expiresAt,
                },
            });
            await tx.authRefreshToken.create({
                data: { sessionId: created.id, tokenHash: this.hashToken(rawRefreshToken), expiresAt },
            });
            return created;
        });
        return {
            accessToken: this.signAccessToken({
                sub: user.id,
                email: user.email,
                organizationId: membership?.organizationId || customer?.organizationId,
                membershipId: membership?.id,
                roleCode: membership?.roleCode as RoleCode | undefined,
                isPlatformAdmin: user.isPlatformAdmin,
                sid: session.id,
                amr,
            }),
            refreshToken: rawRefreshToken,
            sessionId: session.id,
        };
    }

    async refresh(rawToken: string, metadata: AuthRequestMetadata = {}) {
        const tokenHash = this.hashToken(rawToken);
        const existing = await this.prisma.authRefreshToken.findUnique({
            where: { tokenHash },
            include: { session: { include: { user: { include: { memberships: true, customers: true } } } } },
        });
        if (!existing) throw new UnauthorizedException({ code: "INVALID_REFRESH_TOKEN", message: "Session is no longer valid" });
        const now = new Date();
        if (existing.usedAt) {
            const gracePeriodMs = 15000;
            if (now.getTime() - existing.usedAt.getTime() < gracePeriodMs) {
                const latestToken = await this.prisma.authRefreshToken.findFirst({
                    where: { sessionId: existing.sessionId, usedAt: null, expiresAt: { gt: now } },
                    orderBy: { createdAt: "desc" },
                });
                if (latestToken && !existing.session.revokedAt && existing.session.user.isActive) {
                    const user = existing.session.user;
                    const orgId = existing.session.organizationId || undefined;
                    const membership = orgId ? user.memberships.find((m: any) => m.organizationId === orgId && m.status === "ACTIVE") : user.memberships.find((m: any) => m.status === "ACTIVE");
                    const customer = orgId ? user.customers.find((c: any) => c.organizationId === orgId) : user.customers[0];
                    return {
                        accessToken: this.signAccessToken({ sub: user.id, email: user.email, organizationId: orgId, membershipId: membership?.id, roleCode: membership?.roleCode as RoleCode | undefined, isPlatformAdmin: user.isPlatformAdmin, sid: existing.sessionId, amr: existing.session.authLevel.split(",") }),
                        refreshToken: undefined,
                    };
                }
            }

            await this.revokeSession(existing.sessionId, "refresh_token_reuse", metadata);
            await this.recordSecurityEvent("identity.refresh_token_reuse", existing.session.userId, existing.session.organizationId || undefined, metadata, { sessionId: existing.sessionId });
            throw new UnauthorizedException({ code: "REFRESH_TOKEN_REUSED", message: "Session was revoked because a refresh token was reused" });
        }
        if (existing.expiresAt <= now || existing.session.expiresAt <= now || existing.session.revokedAt || !existing.session.user.isActive) {
            throw new UnauthorizedException({ code: "SESSION_EXPIRED", message: "Session has expired" });
        }

        const nextRaw = crypto.randomBytes(48).toString("base64url");
        const rotated = await this.prisma.$transaction(async (tx) => {
            const claimed = await tx.authRefreshToken.updateMany({ where: { id: existing.id, usedAt: null }, data: { usedAt: now } });
            if (claimed.count !== 1) return false;
            await tx.authRefreshToken.create({ data: { sessionId: existing.sessionId, tokenHash: this.hashToken(nextRaw), expiresAt: existing.expiresAt } });
            await tx.authSession.update({ where: { id: existing.sessionId }, data: { lastSeenAt: now, ipAddress: metadata.ipAddress || undefined } });
            return true;
        });
        if (!rotated) {
            await this.revokeSession(existing.sessionId, "refresh_token_race", metadata);
            throw new UnauthorizedException({ code: "REFRESH_TOKEN_REUSED", message: "Session was revoked because a refresh token was reused" });
        }

        const user = existing.session.user;
        const orgId = existing.session.organizationId || undefined;
        const membership = orgId ? user.memberships.find((m: any) => m.organizationId === orgId && m.status === "ACTIVE") : user.memberships.find((m: any) => m.status === "ACTIVE");
        const customer = orgId ? user.customers.find((c: any) => c.organizationId === orgId) : user.customers[0];
        return {
            accessToken: this.signAccessToken({ sub: user.id, email: user.email, organizationId: orgId, membershipId: membership?.id, roleCode: membership?.roleCode as RoleCode | undefined, isPlatformAdmin: user.isPlatformAdmin, sid: existing.sessionId, amr: existing.session.authLevel.split(",") }),
            refreshToken: nextRaw,
        };
    }

    async validateSession(sessionId: string, userId: string): Promise<void> {
        const session = await this.prisma.authSession.findFirst({ where: { id: sessionId, userId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
        if (!session) throw new UnauthorizedException({ code: "SESSION_REVOKED", message: "Session has been revoked or expired" });
    }

    async listSessions(userId: string, currentSessionId?: string) {
        const rows = await this.prisma.authSession.findMany({
            where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
            select: { id: true, deviceName: true, ipAddress: true, lastSeenAt: true, createdAt: true, expiresAt: true },
            orderBy: { lastSeenAt: "desc" },
        });
        return rows.map((row) => ({ ...row, current: row.id === currentSessionId }));
    }

    async revokeSession(sessionId: string, reason: string, metadata: AuthRequestMetadata = {}, actorUserId?: string) {
        const session = await this.prisma.authSession.findFirst({ where: { id: sessionId, ...(actorUserId ? { userId: actorUserId } : {}) } });
        if (!session) return false;
        await this.prisma.authSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: reason } });
        await this.recordSecurityEvent("identity.session_revoked", actorUserId || session.userId, session.organizationId || undefined, metadata, { sessionId, reason });
        return true;
    }

    async revokeByRefreshToken(rawToken: string, metadata: AuthRequestMetadata = {}) {
        const token = await this.prisma.authRefreshToken.findUnique({ where: { tokenHash: this.hashToken(rawToken) }, include: { session: true } });
        if (token) await this.revokeSession(token.sessionId, "logout", metadata, token.session.userId);
    }

    async revokeAllSessions(userId: string, exceptSessionId: string | undefined, metadata: AuthRequestMetadata = {}) {
        const result = await this.prisma.authSession.updateMany({ where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) }, data: { revokedAt: new Date(), revocationReason: "global_logout" } });
        await this.recordSecurityEvent("identity.sessions_revoked_all", userId, undefined, metadata, { count: result.count, exceptSessionId });
        return result.count;
    }

    async completeMfa(challengeToken: string, code: string, metadata: AuthRequestMetadata = {}) {
        await this.enforceRateLimit("mfa-ip", metadata.ipAddress || "unknown", 15, 10 * 60, 30 * 60);
        const challenge = await this.prisma.mfaChallenge.findUnique({ where: { tokenHash: this.hashToken(challengeToken) }, include: { user: { include: { memberships: { include: { organization: true } }, customers: true, mfaCredential: true } } } });
        if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) throw new UnauthorizedException({ code: "MFA_CHALLENGE_INVALID", message: "MFA challenge is invalid or expired" });
        const user = challenge.user;
        await this.enforceRateLimit("mfa-account", user.id, 8, 10 * 60, 30 * 60);
        let recoveryCodes: string[] | undefined;
        if (challenge.purpose === "ENROLL") {
            if (!challenge.pendingSecret) throw new UnauthorizedException({ code: "MFA_CHALLENGE_INVALID", message: "MFA enrollment is invalid" });
            const secret = EncryptionService.decrypt(challenge.pendingSecret);
            const step = this.verifyTotp(secret, code);
            if (step === null) throw new UnauthorizedException({ code: "MFA_CODE_INVALID", message: "The authentication code is invalid" });
            recoveryCodes = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString("hex").toUpperCase());
            await this.prisma.$transaction(async (tx) => {
                const claimed = await tx.mfaChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } });
                if (claimed.count !== 1) throw new UnauthorizedException({ code: "MFA_CHALLENGE_USED", message: "MFA challenge was already used" });
                await tx.mfaCredential.create({ data: { userId: user.id, secretEncrypted: challenge.pendingSecret!, lastUsedStep: BigInt(step), recoveryCodes: { create: recoveryCodes!.map((value) => ({ codeHash: this.hashToken(value) })) } } });
            });
            await this.recordSecurityEvent("identity.mfa_enabled", user.id, challenge.organizationId || undefined, metadata);
        } else {
            const credential = user.mfaCredential;
            if (!credential) throw new UnauthorizedException({ code: "MFA_NOT_CONFIGURED", message: "MFA is not configured" });
            const normalizedRecovery = code.replace(/[-\s]/g, "").toUpperCase();
            const recovery = await this.prisma.mfaRecoveryCode.findUnique({ where: { codeHash: this.hashToken(normalizedRecovery) } });
            if (recovery && recovery.userId === user.id && !recovery.usedAt) {
                await this.prisma.$transaction(async (tx) => { const claimed = await tx.mfaChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } }); if (claimed.count !== 1) throw new UnauthorizedException({ code: "MFA_CHALLENGE_USED", message: "MFA challenge was already used" }); await tx.mfaRecoveryCode.update({ where: { id: recovery.id }, data: { usedAt: new Date() } }); });
            } else {
                const step = this.verifyTotp(EncryptionService.decrypt(credential.secretEncrypted), code);
                if (step === null || (credential.lastUsedStep !== null && BigInt(step) <= credential.lastUsedStep)) throw new UnauthorizedException({ code: "MFA_CODE_INVALID", message: "The authentication code is invalid or was already used" });
                await this.prisma.$transaction(async (tx) => { const claimed = await tx.mfaChallenge.updateMany({ where: { id: challenge.id, consumedAt: null }, data: { consumedAt: new Date() } }); if (claimed.count !== 1) throw new UnauthorizedException({ code: "MFA_CHALLENGE_USED", message: "MFA challenge was already used" }); await tx.mfaCredential.update({ where: { userId: user.id }, data: { lastUsedStep: BigInt(step) } }); });
            }
            await this.recordSecurityEvent("identity.mfa_verified", user.id, challenge.organizationId || undefined, metadata);
        }
        const membership = challenge.organizationId ? user.memberships.find((m: any) => m.organizationId === challenge.organizationId && m.status === "ACTIVE") : user.memberships.find((m: any) => m.status === "ACTIVE");
        const customer = challenge.organizationId ? user.customers.find((c: any) => c.organizationId === challenge.organizationId) : user.customers[0];
        const session = await this.createSession(user, membership, customer, metadata, ["pwd", "mfa"]);
        await this.clearRateLimits("mfa-account", user.id, "mfa-ip", metadata.ipAddress || "unknown", "login-account", user.email.toLowerCase(), "login-ip", metadata.ipAddress || "unknown");
        return { ...session, recoveryCodes };
    }

    private async createMfaChallenge(userId: string, organizationId: string | undefined, purpose: "VERIFY" | "ENROLL", metadata: AuthRequestMetadata) {
        const token = crypto.randomBytes(32).toString("base64url");
        const secret = purpose === "ENROLL" ? this.encodeBase32(crypto.randomBytes(20)) : undefined;
        await this.prisma.mfaChallenge.create({ data: { userId, organizationId, tokenHash: this.hashToken(token), purpose, pendingSecret: secret ? EncryptionService.encrypt(secret) : undefined, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent, expiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
        return { token, secret };
    }

    private verifyTotp(secret: string, code: string): number | null {
        if (!/^\d{6}$/.test(code)) return null;
        const current = Math.floor(Date.now() / 30000);
        const key = this.decodeBase32(secret);
        for (let offset = -1; offset <= 1; offset++) {
            const step = current + offset;
            const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
            const digest = crypto.createHmac("sha1", key).update(counter).digest();
            const start = digest[digest.length - 1] & 0x0f;
            const expected = ((digest.readUInt32BE(start) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
            const a = Buffer.from(code); const b = Buffer.from(expected);
            if (a.length === b.length && crypto.timingSafeEqual(a, b)) return step;
        }
        return null;
    }

    private encodeBase32(input: Buffer): string {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0; let value = 0; let output = "";
        for (const byte of input) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
        if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
        return output;
    }

    private decodeBase32(input: string): Buffer {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0; let value = 0; const bytes: number[] = [];
        for (const char of input.replace(/=+$/, "").toUpperCase()) { const index = alphabet.indexOf(char); if (index < 0) throw new Error("Invalid MFA secret"); value = (value << 5) | index; bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
        return Buffer.from(bytes);
    }

    private buildOtpAuthUri(email: string, secret: string) { return `otpauth://totp/${encodeURIComponent(`BookPro:${email}`)}?secret=${secret}&issuer=BookPro&algorithm=SHA1&digits=6&period=30`; }
    private describeDevice(userAgent?: string) { if (!userAgent) return "Unknown device"; const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "Browser"; const os = /Windows/.test(userAgent) ? "Windows" : /Mac OS/.test(userAgent) ? "macOS" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : "Unknown OS"; return `${browser} on ${os}`; }

    private async enforceRateLimit(scope: string, identifier: string, limit: number, windowSeconds: number, blockSeconds: number) {
        const key = `${scope}:${this.hashToken(identifier).slice(0, 32)}`; const now = new Date();
        const row = await this.prisma.authRateLimit.findUnique({ where: { key } });
        if (row?.blockedUntil && row.blockedUntil > now) throw new HttpException({ code: "AUTH_RATE_LIMITED", message: "Too many attempts. Try again later." }, HttpStatus.TOO_MANY_REQUESTS);
        const updated = !row || row.windowEnd <= now
            ? await this.prisma.authRateLimit.upsert({ where: { key }, create: { key, attempts: 1, windowEnd: new Date(now.getTime() + windowSeconds * 1000) }, update: { attempts: 1, windowEnd: new Date(now.getTime() + windowSeconds * 1000), blockedUntil: null } })
            : await this.prisma.authRateLimit.update({ where: { key }, data: { attempts: { increment: 1 }, ...(row.attempts + 1 > limit ? { blockedUntil: new Date(now.getTime() + blockSeconds * 1000) } : {}) } });
        if (updated.attempts > limit) {
            if (!updated.blockedUntil) await this.prisma.authRateLimit.update({ where: { key }, data: { blockedUntil: new Date(now.getTime() + blockSeconds * 1000) } });
            throw new HttpException({ code: "AUTH_RATE_LIMITED", message: "Too many attempts. Try again later." }, HttpStatus.TOO_MANY_REQUESTS);
        }
    }

    private async clearRateLimits(...pairs: string[]) { for (let i = 0; i < pairs.length; i += 2) { const key = `${pairs[i]}:${this.hashToken(pairs[i + 1]).slice(0, 32)}`; await this.prisma.authRateLimit.deleteMany({ where: { key } }); } }
    private async recordSecurityEvent(action: string, actorId?: string, organizationId?: string, metadata: AuthRequestMetadata = {}, payload?: Record<string, unknown>) {
        await this.prisma.auditLog.create({ data: { organizationId, actorType: actorId ? ActorType.STAFF : ActorType.SYSTEM, actorId: actorId || "anonymous", action, resourceType: "SecurityEvent", resourceId: actorId || "anonymous", ipAddress: metadata.ipAddress, userAgent: metadata.userAgent, payload: payload as any } });
    }

    private hashVerificationCode(email: string, code: string): string {
        return this.hashToken(`${email.toLowerCase().trim()}:${code}`);
    }

    private generateVerificationCode(email: string, previousHash?: string): string {
        // A resend must never repeat the immediately preceding code, even though the
        // cryptographic collision probability is already very small (1 in 900,000).
        for (;;) {
            const code = crypto.randomInt(100000, 1000000).toString();
            if (!previousHash || this.hashVerificationCode(email, code) !== previousHash) return code;
        }
    }

    private registrationReplay(prior: any, fingerprint: string) {
        if (prior.requestFingerprint !== fingerprint) {
            throw new ConflictException({ code: "IDEMPOTENCY_KEY_REUSED", message: "This registration retry does not match the original request. Start a fresh registration." });
        }
        return { status: "VERIFICATION_REQUIRED" as const, email: prior.user.email, organization: { id: prior.organization.id, name: prior.organization.name, slug: prior.organization.slug } };
    }

    async getSessionProfile(ctx: RequestContext) {
        const user = await this.prisma.user.findUnique({
            where: { id: ctx.subjectId },
            select: { id: true, email: true, fullName: true, isPlatformAdmin: true, emailVerifiedAt: true },
        });
        if (!user) throw new NotFoundException("Account not found");

        const organization = ctx.organizationId
            ? await this.prisma.organization.findUnique({
                where: { id: ctx.organizationId },
                select: { id: true, name: true, slug: true, currency: true, onboardingCompleted: true, onboardingStep: true },
            })
            : null;

        return {
            userId: user.id,
            email: user.email,
            fullName: user.fullName,
            actorType: ctx.actorType,
            organizationId: ctx.organizationId,
            organizationName: organization?.name,
            organizationSlug: organization?.slug,
            currency: organization?.currency || "USD",
            onboardingCompleted: organization?.onboardingCompleted ?? null,
            onboardingStep: organization?.onboardingStep ?? null,
            membershipId: ctx.membershipId,
            roleCode: ctx.roleCode,
            permissions: ctx.permissions,
            locationIds: ctx.locationIds,
            customerId: ctx.customerId,
            isPlatformAdmin: user.isPlatformAdmin,
            emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
        };
    }

    async listActiveMemberships(userId: string) {
        return this.prisma.membership.findMany({
            where: { userId, status: "ACTIVE", organization: { isActive: true, archivedAt: null } },
            select: {
                id: true,
                roleCode: true,
                locationIds: true,
                organization: { select: { id: true, name: true, slug: true, onboardingCompleted: true } },
            },
            orderBy: { createdAt: "asc" },
        });
    }

    async selectOrganization(userId: string, organizationId: string, sessionId: string) {
        const membership = await this.prisma.membership.findFirst({
            where: { userId, organizationId, status: "ACTIVE", organization: { isActive: true, archivedAt: null } },
            include: { user: true, organization: true },
        });
        if (!membership) {
            throw new UnauthorizedException({ code: "MEMBERSHIP_NOT_FOUND", message: "You do not have access to that workspace." });
        }

        const currentSession = await this.prisma.authSession.findFirst({ where: { id: sessionId, userId, revokedAt: null } });
        if (!currentSession) throw new UnauthorizedException({ code: "SESSION_REVOKED", message: "Session is no longer active." });
        if ((membership.roleCode === "OWNER" || membership.roleCode === "ADMIN" || membership.user.isPlatformAdmin) && !currentSession.authLevel.split(",").includes("mfa")) {
            throw new UnauthorizedException({ code: "MFA_REQUIRED", message: "MFA verification is required for this privileged workspace." });
        }

        await this.prisma.authSession.update({ where: { id: sessionId }, data: { organizationId } });
        const accessToken = this.signAccessToken({
            sub: membership.userId,
            email: membership.user.email,
            organizationId: membership.organizationId,
            membershipId: membership.id,
            roleCode: membership.roleCode as RoleCode,
            isPlatformAdmin: membership.user.isPlatformAdmin,
            sid: sessionId,
            amr: currentSession.authLevel.split(","),
        });
        return {
            accessToken,
            organization: {
                id: membership.organization.id,
                name: membership.organization.name,
                slug: membership.organization.slug,
                roleCode: membership.roleCode,
                onboardingCompleted: membership.organization.onboardingCompleted,
            },
        };
    }

    async acceptInvite(dto: AcceptInviteDto, metadata: AuthRequestMetadata = {}) {
        const invitation = await this.prisma.invitation.findUnique({
            where: { tokenHash: this.hashToken(dto.token) },
            include: { organization: true },
        });

        if (!invitation || invitation.status !== "PENDING") {
            throw new BadRequestException({
                code: "INVALID_INVITATION",
                message: "Invitation is invalid or has already been used.",
            });
        }

        if (new Date() > invitation.expiresAt) {
            await this.prisma.invitation.update({
                where: { id: invitation.id },
                data: { status: "EXPIRED" },
            });
            throw new BadRequestException({
                code: "INVITATION_EXPIRED",
                message: "Invitation token has expired.",
            });
        }

        const passwordHash = await bcrypt.hash(dto.password, 12);

        const existingUser = await this.prisma.user.findUnique({
            where: { email: invitation.email.toLowerCase() },
        });
        if (existingUser?.passwordHash && !(await bcrypt.compare(dto.password, existingUser.passwordHash))) throw new UnauthorizedException({ code: "EXISTING_ACCOUNT_PASSWORD_REQUIRED", message: "Use the existing account password to accept this invitation." });

        await this.prisma.$transaction(async (tx) => {
            const consumed = await tx.invitation.updateMany({ where: { id: invitation.id, status: "PENDING" }, data: { status: "ACCEPTED" } });
            if (consumed.count !== 1) throw new BadRequestException({ code: "INVALID_INVITATION", message: "Invitation is invalid or has already been used." });
            const user = existingUser
                ? await tx.user.update({ where: { id: existingUser.id }, data: { fullName: dto.fullName, ...(!existingUser.passwordHash ? { passwordHash } : {}), phone: dto.phone || existingUser.phone } })
                : await tx.user.create({ data: { email: invitation.email.toLowerCase(), fullName: dto.fullName, passwordHash, phone: dto.phone } });
            const membership = await tx.membership.upsert({
                where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } },
                create: { organizationId: invitation.organizationId, userId: user.id, roleCode: invitation.roleCode, status: "ACTIVE", locationIds: invitation.locationIds ?? undefined },
                update: { roleCode: invitation.roleCode, status: "ACTIVE", locationIds: invitation.locationIds ?? undefined },
            });
            await tx.auditLog.create({ data: { organizationId: invitation.organizationId, actorType: ActorType.STAFF, actorId: user.id, action: "membership.accept_invite", resourceType: "Membership", resourceId: membership.id, payload: { roleCode: invitation.roleCode, invitationId: invitation.id }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent } });
        });

        return this.login({ email: invitation.email, password: dto.password }, metadata);
    }

    async validateToken(token: string): Promise<JwtPayload> {
        try {
            const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;
            return decoded;
        } catch {
            throw new UnauthorizedException({
                code: "INVALID_TOKEN",
                message: "Authentication token is invalid or expired",
            });
        }
    }

    async listCustomerOrganizations(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true },
        });
        if (!user) return [];

        const customers = await this.prisma.customer.findMany({
            where: {
                userId,
                organization: { isActive: true, archivedAt: null },
            },
            include: {
                organization: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        brandName: true,
                        logoUrl: true,
                        primaryColor: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        return customers.map((c) => ({
            customerId: c.id,
            organization: c.organization,
            lastBookingAt: c.lastBookingAt,
            totalAppointments: c.completedAppointmentsCount,
        }));
    }

    async selectCustomerOrganization(userId: string, organizationId: string, sessionId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, fullName: true, accountType: true },
        });
        if (!user) {
            throw new UnauthorizedException({
                code: "USER_NOT_FOUND",
                message: "User not found.",
            });
        }

        // Must strictly select an existing customer relationship for this user and organization
        const customer = await this.prisma.customer.findFirst({
            where: {
                organizationId,
                userId,
                organization: { isActive: true, archivedAt: null },
            },
            include: { organization: true },
        });

        if (!customer) {
            throw new UnauthorizedException({
                code: "CUSTOMER_NOT_FOUND",
                message: "You do not have a customer account with this organization. Please join or accept an invitation first.",
            });
        }

        const currentSession = await this.prisma.authSession.findFirst({ where: { id: sessionId, userId, revokedAt: null } });
        if (!currentSession) throw new UnauthorizedException({ code: "SESSION_REVOKED", message: "Session is no longer active." });

        await this.prisma.authSession.update({ where: { id: sessionId }, data: { organizationId } });
        const accessToken = this.signAccessToken({
            sub: userId,
            email: user.email,
            organizationId: customer.organizationId,
            isPlatformAdmin: false,
            sid: sessionId,
            amr: currentSession.authLevel.split(","),
        });

        return {
            accessToken,
            organization: {
                id: customer.organization.id,
                name: customer.organization.name,
                slug: customer.organization.slug,
            },
        };
    }

    async getPermissionsForRole(roleCode?: RoleCode, organizationId?: string): Promise<PermissionKey[]> {
        if (!roleCode) return [];

        // Fetch custom permissions from DB if defined, else fallback to standard defaults
        const rolePermissions = await this.prisma.rolePermission.findMany({
            where: { roleCode: roleCode as any },
        });

        if (rolePermissions.length > 0) {
            return rolePermissions.map((rp) => rp.permissionKey as PermissionKey);
        }

        return DEFAULT_ROLE_PERMISSIONS[roleCode] || [];
    }
}
