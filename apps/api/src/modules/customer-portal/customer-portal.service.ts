import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import * as crypto from "crypto";
import {
  ActorType,
  CustomerInvitationDeliveryItem,
  CustomerInvitationPreviewResult,
  CustomerMarketingPreferenceDto,
  CustomerPerkOfferDto,
  InvitationDeliveryStatus,
  RequestContext,
} from "@bookpro/contracts";
import { EncryptionService } from "@bookpro/server-core";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { OutboxService } from "../outbox/outbox.service";

@Injectable()
export class CustomerPortalService {
  private readonly logger = new Logger(CustomerPortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly outboxService?: OutboxService,
  ) {}

  /**
   * Runs an operation inside a serializable transaction with safe retry on serialization conflict (P2034).
   */
  private async runSerializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, maxRetries = 3): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            return await operation(tx);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 10000,
          }
        );
      } catch (err: any) {
        const isSerializationConflict =
          err?.code === "P2034" ||
          err?.message?.includes("could not serialize access") ||
          err?.message?.includes("deadlock detected");
        if (isSerializationConflict && attempt < maxRetries) {
          const backoffMs = Math.floor(Math.random() * 50) + attempt * 50;
          this.logger.warn(`Serializable transaction conflict on attempt ${attempt}. Retrying in ${backoffMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }
        throw err;
      }
    }
    throw new ConflictException("Transaction could not be completed due to high concurrency. Please try again.");
  }

  /**
   * Helper to link or reuse a CRM Customer record case-insensitively and safely.
   */
  private async linkCustomerAccount(
    tx: Prisma.TransactionClient,
    options: {
      organizationId: string;
      user: { id: string; email: string; fullName: string | null; phone?: string | null };
      consentMarketing: boolean;
      source: "DIRECTORY_JOIN" | "CUSTOMER_INVITATION";
    }
  ) {
    const normalizedEmail = options.user.email.trim().toLowerCase();

    // Check for existing CRM records matching normalized email case-insensitively
    const existingRecords = await tx.customer.findMany({
      where: {
        organizationId: options.organizationId,
        email: { equals: normalizedEmail, mode: "insensitive" },
      },
    });

    if (existingRecords.length > 1) {
      this.logger.error(`Ambiguous duplicate CRM records found for email ${normalizedEmail} in org ${options.organizationId}.`);
      throw new ConflictException("Multiple CRM records exist with this email address. Please contact the business owner to resolve duplicate records.");
    }

    const consentData = options.consentMarketing
      ? {
          consentMarketing: true,
          consentMarketingAt: new Date(),
          consentSource: options.source,
        }
      : {};

    if (existingRecords.length === 1) {
      const existing = existingRecords[0];
      if (existing.userId && existing.userId !== options.user.id) {
        throw new ConflictException("This customer record is already associated with another account.");
      }

      return tx.customer.update({
        where: { id: existing.id },
        data: {
          userId: options.user.id,
          fullName: options.user.fullName || existing.fullName,
          phone: options.user.phone || existing.phone,
          ...consentData,
        },
      });
    }

    return tx.customer.create({
      data: {
        organizationId: options.organizationId,
        userId: options.user.id,
        email: normalizedEmail,
        fullName: options.user.fullName || "Customer",
        phone: options.user.phone,
        ...consentData,
      },
    });
  }

  async listOrganizations(query: { search?: string; industry?: string; country?: string; sort: "name" | "newest" | "services"; page: number; limit: number }) {
    const where: any = { isActive: true, archivedAt: null, onboardingCompleted: true, bookingEnabled: true };
    if (query.search) where.OR = [{ name: { contains: query.search, mode: "insensitive" } }, { brandName: { contains: query.search, mode: "insensitive" } }, { industry: { contains: query.search, mode: "insensitive" } }];
    if (query.industry) where.industry = { equals: query.industry, mode: "insensitive" };
    if (query.country) where.country = query.country.toUpperCase();
    const orderBy = query.sort === "newest" ? { createdAt: "desc" as const } : query.sort === "services" ? { services: { _count: "desc" as const } } : { name: "asc" as const };
    const [items, total, industries, countries] = await this.prisma.$transaction([
      this.prisma.organization.findMany({ where, select: { id: true, name: true, slug: true, brandName: true, logoUrl: true, primaryColor: true, industry: true, country: true, _count: { select: { locations: true, services: true } } }, orderBy, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({ where: { isActive: true, archivedAt: null, industry: { not: null } }, distinct: ["industry"], select: { industry: true }, orderBy: { industry: "asc" } }),
      this.prisma.organization.findMany({ where: { isActive: true, archivedAt: null }, distinct: ["country"], select: { country: true }, orderBy: { country: "asc" } }),
    ]);
    return { items, total, page: query.page, pages: Math.max(1, Math.ceil(total / query.limit)), filters: { industries: industries.map((x) => x.industry).filter(Boolean), countries: countries.map((x) => x.country) } };
  }

  async join(dto: { organizationId: string; consentMarketing: boolean }, ctx: RequestContext) {
    const user = await this.prisma.user.findUnique({ where: { id: ctx.subjectId }, include: { memberships: { where: { status: "ACTIVE" } } } });
    if (!user || !user.emailVerifiedAt) throw new ForbiddenException("A verified customer account is required.");
    if (user.accountType !== "CUSTOMER" || user.memberships.length) throw new ForbiddenException("Organization accounts cannot join organizations as customers.");
    const organization = await this.prisma.organization.findFirst({ where: { id: dto.organizationId, isActive: true, archivedAt: null, onboardingCompleted: true, bookingEnabled: true } });
    if (!organization) throw new NotFoundException("Organization is not available.");

    const customer = await this.runSerializable(async (tx) => {
      const linked = await this.linkCustomerAccount(tx, {
        organizationId: dto.organizationId,
        user,
        consentMarketing: dto.consentMarketing,
        source: "DIRECTORY_JOIN",
      });
      await tx.auditLog.create({
        data: {
          organizationId: dto.organizationId,
          actorType: ActorType.CUSTOMER,
          actorId: user.id,
          action: "customer.joined",
          resourceType: "Customer",
          resourceId: linked.id,
        },
      });
      return linked;
    });

    return { customerId: customer.id, organization: { id: organization.id, name: organization.name, slug: organization.slug } };
  }

  async invite(dto: { email: string }, ctx: RequestContext) {
    if (!ctx.organizationId) throw new ForbiddenException("Organization context is required.");
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Verify organization is active, onboarded, and booking enabled
    const organization = await this.prisma.organization.findFirst({
      where: {
        id: ctx.organizationId,
        isActive: true,
        archivedAt: null,
        onboardingCompleted: true,
        bookingEnabled: true,
      },
    });
    if (!organization) throw new ForbiddenException("Organization is not active, onboarded, or booking-enabled.");

    // Reject if customer already has a linked account with this organization
    const existingLinkedCustomer = await this.prisma.customer.findFirst({
      where: {
        organizationId: ctx.organizationId,
        email: { equals: normalizedEmail, mode: "insensitive" },
        userId: { not: null },
      },
    });
    if (existingLinkedCustomer) {
      throw new ConflictException("This customer already has a linked portal account with your organization.");
    }

    // Reject duplicate active invitations
    const pending = await this.prisma.customerInvitation.findFirst({
      where: {
        organizationId: ctx.organizationId,
        email: { equals: normalizedEmail, mode: "insensitive" },
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });
    if (pending) {
      throw new ConflictException("An active invitation already exists for this email address.");
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await this.runSerializable(async (tx) => {
      const created = await tx.customerInvitation.create({
        data: {
          organizationId: ctx.organizationId!,
          email: normalizedEmail,
          tokenHash,
          expiresAt,
          createdBy: ctx.subjectId,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: ctx.organizationId!,
          actorType: ActorType.STAFF,
          actorId: ctx.subjectId,
          action: "customer.invite_created",
          resourceType: "CustomerInvitation",
          resourceId: created.id,
        },
      });

      await tx.outboxEvent.create({
        data: {
          organizationId: ctx.organizationId!,
          aggregateType: "CustomerInvitation",
          aggregateId: created.id,
          eventType: "identity.customer_invitation_requested",
          payload: {
            invitationId: created.id,
            recipientEmail: normalizedEmail,
            encryptedInvitationToken: EncryptionService.encrypt(token),
            expiresAt: expiresAt.toISOString(),
          },
        },
      });

      return created;
    });
    if (this.outboxService) {
      await this.outboxService.drainImmediate();
    }

    return { id: invitation.id, email: invitation.email, expiresAt };
  }

  async previewInvitation(dto: { token: string }): Promise<CustomerInvitationPreviewResult> {
    const tokenHash = crypto.createHash("sha256").update(dto.token).digest("hex");
    const invitation = await this.prisma.customerInvitation.findUnique({
      where: { tokenHash },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            brandName: true,
            logoUrl: true,
            primaryColor: true,
            isActive: true,
            archivedAt: true,
            onboardingCompleted: true,
            bookingEnabled: true,
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException("Invitation not found or invalid.");
    }

    let status = invitation.status;
    if (status === "PENDING" && invitation.expiresAt <= new Date()) {
      await this.prisma.customerInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      }).catch(() => null);
      status = "EXPIRED";
    }

    const org = invitation.organization;
    if (!org || !org.isActive || org.archivedAt !== null) {
      throw new NotFoundException("The inviting organization is no longer active.");
    }

    return {
      organizationId: org.id,
      organizationName: org.brandName || org.name,
      organizationSlug: org.slug,
      brandName: org.brandName,
      logoUrl: org.logoUrl,
      primaryColor: org.primaryColor,
      status,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async listInvitations(ctx: RequestContext): Promise<CustomerInvitationDeliveryItem[]> {
    if (!ctx.organizationId) throw new ForbiddenException("Organization context is required.");

    // Expire overdue invitations
    await this.prisma.customerInvitation.updateMany({
      where: { organizationId: ctx.organizationId, status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });

    const invitations = await this.prisma.customerInvitation.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    if (!invitations.length) return [];

    const invitationIds = invitations.map((i) => i.id);

    // Fetch Outbox events correlating with these invitations
    const outboxEvents = await this.prisma.outboxEvent.findMany({
      where: {
        aggregateType: "CustomerInvitation",
        aggregateId: { in: invitationIds },
      },
      orderBy: { createdAt: "desc" },
    });

    const outboxByAggregateId = new Map<string, typeof outboxEvents[0]>();
    for (const ev of outboxEvents) {
      if (!outboxByAggregateId.has(ev.aggregateId)) {
        outboxByAggregateId.set(ev.aggregateId, ev);
      }
    }

    // Fetch Notifications matching dedupeKey identity:customer-invite:<id>
    const dedupeKeys = invitationIds.map((id) => `identity:customer-invite:${id}`);
    const notifications = await this.prisma.notification.findMany({
      where: {
        organizationId: ctx.organizationId,
        dedupeKey: { in: dedupeKeys },
      },
      orderBy: { createdAt: "desc" },
    });

    const notificationByInviteId = new Map<string, typeof notifications[0]>();
    for (const notif of notifications) {
      const inviteId = notif.dedupeKey?.replace("identity:customer-invite:", "");
      if (inviteId && !notificationByInviteId.has(inviteId)) {
        notificationByInviteId.set(inviteId, notif);
      }
    }

    return invitations.map((invitation) => {
      const outbox = outboxByAggregateId.get(invitation.id);
      const notification = notificationByInviteId.get(invitation.id);

      // Map Outbox State
      let outboxStatus: "pending" | "processing" | "completed" | "failed" | "dead-lettered" | null = null;
      if (outbox) {
        const s = outbox.status.toUpperCase();
        if (s === "PENDING") outboxStatus = "pending";
        else if (s === "CLAIMED" || s === "PROCESSING") outboxStatus = "processing";
        else if (s === "PROCESSED" || s === "COMPLETED") outboxStatus = "completed";
        else if (s === "FAILED") outboxStatus = "failed";
        else if (s === "DEAD_LETTER" || s === "DEAD_LETTERED") outboxStatus = "dead-lettered";
      }

      // Map Notification State
      let notificationStatus: "queued" | "processing" | "sent" | "failed" | null = null;
      if (notification) {
        const s = notification.status.toUpperCase();
        if (s === "QUEUED") notificationStatus = "queued";
        else if (s === "PROCESSING") notificationStatus = "processing";
        else if (s === "SENT") notificationStatus = "sent";
        else if (s === "FAILED" || s === "CANCELLED") notificationStatus = "failed";
      }

      // Map Consolidated Display Status
      let displayStatus: InvitationDeliveryStatus;
      if (invitation.status === "ACCEPTED") {
        displayStatus = "Accepted";
      } else if (invitation.status === "REVOKED") {
        displayStatus = "Revoked";
      } else if (invitation.status === "EXPIRED" || invitation.expiresAt <= new Date()) {
        displayStatus = "Expired";
      } else if (notification?.status === "SENT") {
        displayStatus = "Sent";
      } else if (notification?.status === "FAILED" || outbox?.status === "DEAD_LETTER" || outbox?.status === "FAILED") {
        displayStatus = "Delivery failed";
      } else {
        displayStatus = "Queued for Brevo delivery";
      }

      const deliveryError = notification?.lastError || outbox?.lastError || null;
      const brevoMessageId = notification?.providerId || null;
      const sentAt = notification?.sentAt ? notification.sentAt.toISOString() : null;

      return {
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
        createdAt: invitation.createdAt.toISOString(),
        updatedAt: invitation.updatedAt.toISOString(),
        outboxStatus,
        notificationStatus,
        brevoMessageId,
        deliveryError,
        sentAt,
        displayStatus,
      };
    });
  }

  async revokeInvitation(id: string, ctx: RequestContext) {
    if (!ctx.organizationId) throw new ForbiddenException("Organization context is required.");

    const existing = await this.prisma.customerInvitation.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!existing) throw new NotFoundException("Invitation not found.");

    if (existing.status === "ACCEPTED") {
      throw new BadRequestException("Accepted invitations cannot be revoked.");
    }
    if (existing.status === "EXPIRED" || existing.expiresAt <= new Date()) {
      throw new BadRequestException("Expired invitations cannot be revoked.");
    }
    if (existing.status === "REVOKED") {
      throw new BadRequestException("Invitation is already revoked.");
    }

    await this.runSerializable(async (tx) => {
      await tx.customerInvitation.update({
        where: { id: existing.id },
        data: { status: "REVOKED" },
      });

      await tx.auditLog.create({
        data: {
          organizationId: ctx.organizationId!,
          actorType: ActorType.STAFF,
          actorId: ctx.subjectId,
          action: "customer.invite_revoked",
          resourceType: "CustomerInvitation",
          resourceId: existing.id,
        },
      });
    });

    return { id, status: "REVOKED" as const };
  }

  async resendInvitation(id: string, ctx: RequestContext) {
    if (!ctx.organizationId) throw new ForbiddenException("Organization context is required.");

    const existing = await this.prisma.customerInvitation.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!existing) throw new NotFoundException("Invitation not found.");
    if (existing.status === "ACCEPTED") {
      throw new BadRequestException("Accepted invitations cannot be resent.");
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const normalizedEmail = existing.email.trim().toLowerCase();

    const result = await this.runSerializable(async (tx) => {
      // Revoke the old invitation atomically if not already revoked
      if (existing.status !== "REVOKED") {
        await tx.customerInvitation.update({
          where: { id: existing.id },
          data: { status: "REVOKED" },
        });
      }

      const created = await tx.customerInvitation.create({
        data: {
          organizationId: ctx.organizationId!,
          email: normalizedEmail,
          tokenHash,
          expiresAt,
          createdBy: ctx.subjectId,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: ctx.organizationId!,
          actorType: ActorType.STAFF,
          actorId: ctx.subjectId,
          action: "customer.invite_reissued",
          resourceType: "CustomerInvitation",
          resourceId: created.id,
        },
      });

      await tx.outboxEvent.create({
        data: {
          organizationId: ctx.organizationId!,
          aggregateType: "CustomerInvitation",
          aggregateId: created.id,
          eventType: "identity.customer_invitation_requested",
          payload: {
            invitationId: created.id,
            recipientEmail: normalizedEmail,
            encryptedInvitationToken: EncryptionService.encrypt(token),
            expiresAt: expiresAt.toISOString(),
          },
        },
      });

      return { id: created.id, email: created.email, expiresAt };
    });
    if (this.outboxService) {
      await this.outboxService.drainImmediate();
    }
    return result;
  }

  async acceptInvite(dto: { token: string; consentMarketing: boolean }, ctx: RequestContext) {
    const tokenHash = crypto.createHash("sha256").update(dto.token).digest("hex");

    return this.runSerializable(async (tx) => {
      const invitation = await tx.customerInvitation.findUnique({
        where: { tokenHash },
        include: { organization: true },
      });

      if (!invitation) {
        throw new BadRequestException("Invitation is invalid or has already been used.");
      }

      // Idempotent repeated acceptance by the same authenticated user
      if (invitation.status === "ACCEPTED") {
        if (invitation.acceptedById === ctx.subjectId) {
          const existingCustomer = await tx.customer.findFirst({
            where: { organizationId: invitation.organizationId, userId: ctx.subjectId },
          });
          return {
            customerId: existingCustomer?.id,
            organization: { id: invitation.organization.id, name: invitation.organization.name, slug: invitation.organization.slug },
            alreadyAccepted: true,
          };
        }
        throw new ForbiddenException("This invitation has already been accepted by another user.");
      }

      if (invitation.status === "REVOKED") {
        throw new BadRequestException("This invitation has been revoked.");
      }

      if (invitation.status === "EXPIRED" || invitation.expiresAt <= new Date()) {
        await tx.customerInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } }).catch(() => null);
        throw new BadRequestException("Invitation has expired.");
      }

      // Verify Authenticated User
      const user = await tx.user.findUnique({
        where: { id: ctx.subjectId },
        include: { memberships: { where: { status: "ACTIVE" } } },
      });

      if (!user || !user.emailVerifiedAt) {
        throw new ForbiddenException("Sign in with a verified customer account before accepting.");
      }
      if (user.accountType !== "CUSTOMER" || user.memberships.length) {
        throw new ForbiddenException("Organization accounts cannot accept customer invitations.");
      }

      // Case-insensitive email validation
      if (user.email.trim().toLowerCase() !== invitation.email.trim().toLowerCase()) {
        throw new ForbiddenException("This invitation was sent to a different email address.");
      }

      // Organization Active Check
      const org = invitation.organization;
      if (!org.isActive || org.archivedAt !== null || !org.onboardingCompleted || !org.bookingEnabled) {
        throw new ForbiddenException("This organization is not currently active or booking-enabled.");
      }

      // Link CRM customer record
      const customer = await this.linkCustomerAccount(tx, {
        organizationId: invitation.organizationId,
        user,
        consentMarketing: dto.consentMarketing,
        source: "CUSTOMER_INVITATION",
      });

      // Mark invitation ACCEPTED
      await tx.customerInvitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", acceptedById: user.id },
      });

      await tx.auditLog.create({
        data: {
          organizationId: invitation.organizationId,
          actorType: ActorType.CUSTOMER,
          actorId: user.id,
          action: "customer.accept_invite",
          resourceType: "Customer",
          resourceId: customer.id,
        },
      });

      return {
        customerId: customer.id,
        organization: { id: org.id, name: org.name, slug: org.slug },
      };
    });
  }

  // ==========================================
  // OFFERS & MARKETING PREFERENCES
  // ==========================================

  async getOffers(ctx: RequestContext): Promise<CustomerPerkOfferDto[]> {
    if (!ctx.organizationId) throw new BadRequestException("No active organization selected.");
    return this.queryActiveOffers(ctx.organizationId);
  }

  async getPublicOffers(slugOrId: string): Promise<CustomerPerkOfferDto[]> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
    const org = await this.prisma.organization.findFirst({
      where: {
        ...(isUuid ? { OR: [{ id: slugOrId }, { slug: slugOrId }] } : { slug: slugOrId }),
        isActive: true,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!org) throw new NotFoundException("Organization not found.");
    return this.queryActiveOffers(org.id);
  }

  private async queryActiveOffers(organizationId: string): Promise<CustomerPerkOfferDto[]> {
    const now = new Date();
    const coupons = await this.prisma.coupon.findMany({
      where: {
        organizationId,
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validTo: null }, { validTo: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    const validCoupons = coupons.filter(
      (c) => c.usageLimit === null || c.usageCount < c.usageLimit
    );

    return validCoupons.map((c) => ({
      id: c.id,
      code: c.code,
      discountType: c.discountType as any,
      discountValue: c.discountValue,
      minSpendCents: c.minSpendCents,
      validTo: c.validTo?.toISOString() || null,
    }));
  }

  async getMarketingPreferences(ctx: RequestContext): Promise<CustomerMarketingPreferenceDto> {
    if (!ctx.organizationId || !ctx.subjectId) {
      throw new ForbiddenException("Authenticated customer context required.");
    }

    const customer = await this.prisma.customer.findFirst({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.subjectId,
      },
      select: {
        consentMarketing: true,
        consentMarketingAt: true,
      },
    });

    if (!customer) {
      return { consentMarketing: false, consentMarketingAt: null };
    }

    return {
      consentMarketing: customer.consentMarketing,
      consentMarketingAt: customer.consentMarketingAt?.toISOString() || null,
    };
  }

  async updateMarketingPreferences(
    dto: { consentMarketing: boolean },
    ctx: RequestContext
  ): Promise<CustomerMarketingPreferenceDto> {
    if (!ctx.organizationId || !ctx.subjectId) {
      throw new ForbiddenException("Authenticated customer context required.");
    }

    const customer = await this.prisma.customer.findFirst({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.subjectId,
      },
    });

    if (!customer) {
      throw new NotFoundException("Customer profile not found for this organization.");
    }

    const consentMarketingAt = dto.consentMarketing ? new Date() : null;

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        consentMarketing: dto.consentMarketing,
        consentMarketingAt,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorType: ActorType.CUSTOMER,
        actorId: ctx.subjectId,
        action: "customer.marketing_consent_updated",
        resourceType: "Customer",
        resourceId: customer.id,
        payload: { consentMarketing: dto.consentMarketing },
      },
    });

    return {
      consentMarketing: dto.consentMarketing,
      consentMarketingAt: consentMarketingAt?.toISOString() || null,
    };
  }

  async getCustomerBilling(ctx: RequestContext) {
    if (!ctx.organizationId) {
      throw new BadRequestException("Organization context required");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: ctx.subjectId },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const customer = await this.prisma.customer.findFirst({
      where: {
        organizationId: ctx.organizationId,
        OR: [
          { userId: user.id },
          { email: { equals: user.email.toLowerCase(), mode: "insensitive" } },
        ],
      },
    });

    if (!customer) {
      return { items: [], totalSpentCents: 0 };
    }

    const payments = await this.prisma.paymentRecord.findMany({
      where: {
        organizationId: ctx.organizationId,
        OR: [
          { appointment: { customerId: customer.id } },
          { bookingHold: { customerId: customer.id } },
        ],
      },
      include: {
        appointment: {
          include: {
            service: true,
            staff: true,
            location: true,
          },
        },
        bookingHold: {
          include: {
            service: true,
            staff: true,
            location: true,
          },
        },
        refunds: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const org = await this.prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { id: true, name: true, brandName: true, slug: true, currency: true, logoUrl: true },
    });

    const totalRefundedCents = payments.reduce((acc, p) => {
      const pRefunds = (p.refunds || []).reduce((rAcc: number, r: any) => rAcc + (r.amountCents || 0), 0);
      return acc + pRefunds;
    }, 0);

    const grossSpentCents = customer.totalSpentCents || 0;
    const netPaidCents = Math.max(0, grossSpentCents - totalRefundedCents);

    const summary = {
      totalSpentCents: grossSpentCents,
      totalRefundedCents,
      netPaidCents,
      totalAppointments: payments.length,
    };

    return {
      customer: {
        id: customer.id,
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        totalSpentCents: customer.totalSpentCents,
        currency: org?.currency || "USD",
      },
      organization: org || {
        id: ctx.organizationId,
        name: "Studio",
        brandName: "Studio",
        slug: "studio",
        currency: "USD",
      },
      items: payments,
      transactions: payments,
      totalSpentCents: customer.totalSpentCents,
      summary,
    };
  }
}
