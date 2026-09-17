import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AudienceCustomerDto,
  AudienceSegment,
  CampaignDetailResponseDto,
  CampaignRecipientDetailDto,
  CouponDto,
  CreateCouponInputDto,
  DiscountType,
  MarketingOverviewStatsDto,
  RequestContext,
  SendCampaignExtendedInputDto,
  UpdateCouponInputDto,
} from "@bookpro/contracts";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  private org(ctx: RequestContext): string {
    if (!ctx.organizationId) throw new ForbiddenException("Organization context is required.");
    return ctx.organizationId;
  }

  // ==========================================
  // TEMPLATES
  // ==========================================

  list(ctx: RequestContext) {
    return this.prisma.organizationEmailTemplate.findMany({
      where: { organizationId: this.org(ctx) },
      orderBy: { updatedAt: "desc" },
    });
  }

  create(dto: { name: string; subject: string; htmlBody: string; textBody?: string }, ctx: RequestContext) {
    return this.prisma.organizationEmailTemplate.upsert({
      where: { organizationId_name: { organizationId: this.org(ctx), name: dto.name.trim() } },
      create: { organizationId: this.org(ctx), ...dto, name: dto.name.trim() },
      update: { ...dto, name: dto.name.trim() },
    });
  }

  async update(id: string, dto: { name: string; subject: string; htmlBody: string; textBody?: string }, ctx: RequestContext) {
    const organizationId = this.org(ctx);
    const existing = await this.prisma.organizationEmailTemplate.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Email template not found.");
    return this.prisma.organizationEmailTemplate.update({
      where: { id },
      data: { ...dto, name: dto.name.trim() },
    });
  }

  async duplicateTemplate(id: string, ctx: RequestContext) {
    const organizationId = this.org(ctx);
    const existing = await this.prisma.organizationEmailTemplate.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Email template not found.");

    let candidateName = `${existing.name} (Copy)`;
    let counter = 1;
    while (await this.prisma.organizationEmailTemplate.findFirst({ where: { organizationId, name: candidateName } })) {
      counter++;
      candidateName = `${existing.name} (Copy ${counter})`;
    }

    return this.prisma.organizationEmailTemplate.create({
      data: {
        organizationId,
        name: candidateName,
        subject: existing.subject,
        htmlBody: existing.htmlBody,
        textBody: existing.textBody,
      },
    });
  }

  async remove(id: string, ctx: RequestContext) {
    const organizationId = this.org(ctx);
    const existing = await this.prisma.organizationEmailTemplate.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { campaigns: true } } },
    });
    if (!existing) throw new NotFoundException("Email template not found.");
    if (existing._count.campaigns) {
      throw new BadRequestException("Templates used by campaign history cannot be deleted. Rename or edit this template instead.");
    }
    await this.prisma.organizationEmailTemplate.delete({ where: { id } });
    return { id };
  }

  // ==========================================
  // CAMPAIGNS & BROADCASTS
  // ==========================================

  campaigns(ctx: RequestContext) {
    return this.prisma.emailCampaign.findMany({
      where: { organizationId: this.org(ctx) },
      include: { template: { select: { name: true, subject: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async getCampaignDetail(id: string, ctx: RequestContext): Promise<CampaignDetailResponseDto> {
    const organizationId = this.org(ctx);
    const campaign = await this.prisma.emailCampaign.findFirst({
      where: { id, organizationId },
      include: {
        template: { select: { id: true, name: true, subject: true } },
      },
    });

    if (!campaign) throw new NotFoundException("Campaign not found.");

    const notifications = await this.prisma.notification.findMany({
      where: { emailCampaignId: id, organizationId },
      include: { customer: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    const recipients: CampaignRecipientDetailDto[] = notifications.map((n) => {
      const vars = typeof n.variables === "object" && n.variables !== null ? (n.variables as Record<string, any>) : {};
      return {
        id: n.id,
        customerId: n.customerId,
        customerName: n.customer?.fullName || vars.customerName || n.recipient,
        recipientEmail: n.recipient,
        status: n.status,
        providerId: n.providerId,
        sentAt: n.sentAt?.toISOString() || null,
        failedAt: n.failedAt?.toISOString() || null,
        lastError: n.lastError || null,
      };
    });

    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      recipientCount: campaign.recipientCount,
      deliveredCount: campaign.deliveredCount,
      failedCount: campaign.failedCount,
      sentAt: campaign.sentAt?.toISOString() || null,
      createdAt: campaign.createdAt.toISOString(),
      template: {
        id: campaign.template.id,
        name: campaign.template.name,
        subject: campaign.template.subject,
      },
      recipients,
    };
  }

  private buildSegmentCustomerFilter(organizationId: string, segment?: AudienceSegment) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Default to PORTAL_MEMBERS when segment is unspecified to preserve backward compatibility with existing tests
    if (!segment || segment === AudienceSegment.PORTAL_MEMBERS) {
      return { organizationId, userId: { not: null }, consentMarketing: true };
    }

    switch (segment) {
      case AudienceSegment.ALL_SUBSCRIBED:
        return { organizationId, consentMarketing: true };
      case AudienceSegment.VIP_CLIENTS:
        return {
          organizationId,
          consentMarketing: true,
          OR: [
            { totalSpentCents: { gte: 10000 } },
            { completedAppointmentsCount: { gte: 3 } },
          ],
        };
      case AudienceSegment.INACTIVE_CLIENTS:
        return {
          organizationId,
          consentMarketing: true,
          OR: [
            { lastBookingAt: { lt: thirtyDaysAgo } },
            { lastBookingAt: null },
          ],
        };
      case AudienceSegment.RECENT_CLIENTS:
        return {
          organizationId,
          consentMarketing: true,
          lastBookingAt: { gte: thirtyDaysAgo },
        };
      default:
        return { organizationId, consentMarketing: true };
    }
  }

  async getAudienceCount(ctx: RequestContext, segment?: AudienceSegment): Promise<{ count: number }> {
    const organizationId = this.org(ctx);
    const filter = this.buildSegmentCustomerFilter(organizationId, segment);
    const count = await this.prisma.customer.count({ where: filter });
    return { count };
  }

  async send(dto: SendCampaignExtendedInputDto, ctx: RequestContext) {
    const organizationId = this.org(ctx);
    const template = await this.prisma.organizationEmailTemplate.findFirst({
      where: { id: dto.templateId, organizationId },
    });
    if (!template) throw new NotFoundException("Email template not found.");

    const org = this.prisma.organization
      ? await this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { name: true, slug: true },
        })
      : null;

    let couponData: { code: string; discountDisplay: string } | null = null;
    if (dto.couponId) {
      const coupon = await this.prisma.coupon.findFirst({
        where: { id: dto.couponId, organizationId, isActive: true },
      });
      if (coupon) {
        const discountDisplay =
          coupon.discountType === "PERCENTAGE"
            ? `${coupon.discountValue}% OFF`
            : `$${(coupon.discountValue / 100).toFixed(2)} OFF`;
        couponData = { code: coupon.code, discountDisplay };
      }
    }

    const customerFilter = this.buildSegmentCustomerFilter(organizationId, dto.segment);
    const customers = await this.prisma.customer.findMany({
      where: customerFilter,
      select: { id: true, email: true, fullName: true },
    });

    const recipients = Array.from(
      new Map(customers.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c])).values()
    );

    const baseUrl = process.env.WEB_URL || "http://localhost:3000";
    const bookingBaseUrl = org?.slug ? `${baseUrl}/${org.slug}/book` : `${baseUrl}/book`;
    const bookingLink = couponData
      ? `${bookingBaseUrl}?coupon=${encodeURIComponent(couponData.code)}`
      : bookingBaseUrl;

    const campaign = await this.prisma.$transaction(async (tx) => {
      const created = await tx.emailCampaign.create({
        data: {
          organizationId,
          templateId: template.id,
          name: dto.name,
          status: recipients.length ? "QUEUED" : "SENT",
          recipientCount: recipients.length,
          sentAt: recipients.length ? null : new Date(),
          createdBy: ctx.subjectId,
        },
      });

      if (recipients.length) {
        await tx.outboxEvent.createMany({
          data: recipients.map((customer) => ({
            organizationId,
            aggregateType: "EmailCampaign",
            aggregateId: created.id,
            eventType: "marketing.campaign_recipient_requested",
            payload: {
              campaignId: created.id,
              customerId: customer.id,
              recipientEmail: customer.email,
              customerName: customer.fullName,
              studioName: org?.name || "BookPro",
              subject: template.subject,
              htmlBody: template.htmlBody,
              textBody: template.textBody,
              bookingLink,
              couponCode: couponData?.code || "",
              discountValue: couponData?.discountDisplay || "",
            },
          })),
        });
      }

      return created;
    });

    return campaign;
  }

  // ==========================================
  // TELEMETRY & AUDIENCE DIRECTORY
  // ==========================================

  async getOverviewStats(ctx: RequestContext): Promise<MarketingOverviewStatsDto> {
    const organizationId = this.org(ctx);

    const [totalSubscribers, totalAudience, activeCouponsCount, campaignAggregate] = await Promise.all([
      this.prisma.customer.count({ where: { organizationId, consentMarketing: true } }),
      this.prisma.customer.count({ where: { organizationId } }),
      this.prisma.coupon.count({ where: { organizationId, isActive: true } }),
      this.prisma.emailCampaign.aggregate({
        where: { organizationId },
        _count: true,
        _sum: { recipientCount: true, deliveredCount: true, failedCount: true },
      }),
    ]);

    const optInRatePct = totalAudience > 0 ? Math.round((totalSubscribers / totalAudience) * 100) : 0;
    const unsubscribedCount = Math.max(0, totalAudience - totalSubscribers);
    const totalCampaignsSent = campaignAggregate._count;
    const deliveredCount = campaignAggregate._sum.deliveredCount || 0;
    const failedCount = campaignAggregate._sum.failedCount || 0;
    const processedEmails = deliveredCount + failedCount;
    const deliveryRatePct = processedEmails > 0 ? Math.round((deliveredCount / processedEmails) * 100) : 100;

    return {
      totalSubscribers,
      totalAudience,
      optInRatePct,
      unsubscribedCount,
      totalCampaignsSent,
      deliveredCount,
      failedCount,
      deliveryRatePct,
      activeCouponsCount,
    };
  }

  async getAudienceList(
    ctx: RequestContext,
    query?: { search?: string; status?: "all" | "subscribed" | "unsubscribed"; segment?: AudienceSegment }
  ): Promise<AudienceCustomerDto[]> {
    const organizationId = this.org(ctx);
    const where: any = { organizationId };

    if (query?.status === "subscribed") {
      where.consentMarketing = true;
    } else if (query?.status === "unsubscribed") {
      where.consentMarketing = false;
    }

    if (query?.segment) {
      const segmentFilter = this.buildSegmentCustomerFilter(organizationId, query.segment);
      Object.assign(where, segmentFilter);
    }

    if (query?.search) {
      const s = query.search.trim();
      where.OR = [
        { fullName: { contains: s, mode: "insensitive" } },
        { email: { contains: s, mode: "insensitive" } },
      ];
    }

    const customers = await this.prisma.customer.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        consentMarketing: true,
        consentMarketingAt: true,
        userId: true,
        totalSpentCents: true,
        completedAppointmentsCount: true,
        lastBookingAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return customers.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      email: c.email || "",
      phone: c.phone,
      consentMarketing: c.consentMarketing,
      consentMarketingAt: c.consentMarketingAt?.toISOString() || null,
      isRegisteredUser: c.userId !== null,
      totalAppointments: c.completedAppointmentsCount,
      totalSpentCents: c.totalSpentCents,
      lastBookingAt: c.lastBookingAt?.toISOString() || null,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  // ==========================================
  // STUDIO COUPONS & OFFERS
  // ==========================================

  async listCoupons(ctx: RequestContext): Promise<CouponDto[]> {
    const organizationId = this.org(ctx);
    const coupons = await this.prisma.coupon.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });

    return coupons.map((c) => ({
      id: c.id,
      organizationId: c.organizationId,
      code: c.code,
      discountType: c.discountType as DiscountType,
      discountValue: c.discountValue,
      minSpendCents: c.minSpendCents,
      maxDiscountCents: c.maxDiscountCents,
      validFrom: c.validFrom?.toISOString() || null,
      validTo: c.validTo?.toISOString() || null,
      usageLimit: c.usageLimit,
      usageCount: c.usageCount,
      isActive: c.isActive,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  async createCoupon(dto: CreateCouponInputDto, ctx: RequestContext): Promise<CouponDto> {
    const organizationId = this.org(ctx);
    const code = dto.code.trim().toUpperCase();

    const existing = await this.prisma.coupon.findFirst({
      where: { organizationId, code },
    });
    if (existing) {
      throw new ConflictException(`A coupon with code "${code}" already exists for this organization.`);
    }

    const created = await this.prisma.coupon.create({
      data: {
        organizationId,
        code,
        discountType: dto.discountType as any,
        discountValue: dto.discountValue,
        minSpendCents: dto.minSpendCents ?? null,
        maxDiscountCents: dto.maxDiscountCents ?? null,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        usageLimit: dto.usageLimit ?? null,
        isActive: dto.isActive ?? true,
      },
    });

    return {
      id: created.id,
      organizationId: created.organizationId,
      code: created.code,
      discountType: created.discountType as DiscountType,
      discountValue: created.discountValue,
      minSpendCents: created.minSpendCents,
      maxDiscountCents: created.maxDiscountCents,
      validFrom: created.validFrom?.toISOString() || null,
      validTo: created.validTo?.toISOString() || null,
      usageLimit: created.usageLimit,
      usageCount: created.usageCount,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async updateCoupon(id: string, dto: UpdateCouponInputDto, ctx: RequestContext): Promise<CouponDto> {
    const organizationId = this.org(ctx);
    const existing = await this.prisma.coupon.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Coupon not found.");

    let code = existing.code;
    if (dto.code && dto.code.trim().toUpperCase() !== existing.code) {
      code = dto.code.trim().toUpperCase();
      const duplicate = await this.prisma.coupon.findFirst({ where: { organizationId, code } });
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(`A coupon with code "${code}" already exists.`);
      }
    }

    const updated = await this.prisma.coupon.update({
      where: { id },
      data: {
        code,
        discountType: dto.discountType ? (dto.discountType as any) : undefined,
        discountValue: dto.discountValue !== undefined ? dto.discountValue : undefined,
        minSpendCents: dto.minSpendCents !== undefined ? dto.minSpendCents : undefined,
        maxDiscountCents: dto.maxDiscountCents !== undefined ? dto.maxDiscountCents : undefined,
        validFrom: dto.validFrom !== undefined ? (dto.validFrom ? new Date(dto.validFrom) : null) : undefined,
        validTo: dto.validTo !== undefined ? (dto.validTo ? new Date(dto.validTo) : null) : undefined,
        usageLimit: dto.usageLimit !== undefined ? dto.usageLimit : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      code: updated.code,
      discountType: updated.discountType as DiscountType,
      discountValue: updated.discountValue,
      minSpendCents: updated.minSpendCents,
      maxDiscountCents: updated.maxDiscountCents,
      validFrom: updated.validFrom?.toISOString() || null,
      validTo: updated.validTo?.toISOString() || null,
      usageLimit: updated.usageLimit,
      usageCount: updated.usageCount,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async toggleCoupon(id: string, ctx: RequestContext): Promise<CouponDto> {
    const organizationId = this.org(ctx);
    const existing = await this.prisma.coupon.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Coupon not found.");

    const updated = await this.prisma.coupon.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      code: updated.code,
      discountType: updated.discountType as DiscountType,
      discountValue: updated.discountValue,
      minSpendCents: updated.minSpendCents,
      maxDiscountCents: updated.maxDiscountCents,
      validFrom: updated.validFrom?.toISOString() || null,
      validTo: updated.validTo?.toISOString() || null,
      usageLimit: updated.usageLimit,
      usageCount: updated.usageCount,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteCoupon(id: string, ctx: RequestContext): Promise<{ id: string }> {
    const organizationId = this.org(ctx);
    const existing = await this.prisma.coupon.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException("Coupon not found.");

    await this.prisma.coupon.delete({ where: { id } });
    return { id };
  }
}
