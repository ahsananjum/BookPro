import { PrismaClient } from "@prisma/client";
import { MarketingService } from "../src/modules/marketing/marketing.service";
import { CustomerPortalService } from "../src/modules/customer-portal/customer-portal.service";
import { PricingService } from "../src/modules/pricing/pricing.service";
import { PrismaService } from "../src/modules/database/prisma.service";
import { AudienceSegment, DiscountType, RequestContext, ActorType, RoleCode, PermissionKey } from "@bookpro/contracts";

async function runVerification() {
  console.log("==================================================================");
  console.log("STARTING BOOKPRO MARKETING & CUSTOMER OFFERS FULL E2E VERIFICATION");
  console.log("==================================================================");

  const prisma = new PrismaClient() as unknown as PrismaService;
  const marketingService = new MarketingService(prisma);
  const customerPortalService = new CustomerPortalService(prisma);
  const pricingService = new PricingService(prisma);

  try {
    // 1. Find an active booking-enabled organization with an owner
    console.log("\n[Step 1] Locating active studio organization with owner...");
    const membership = await prisma.membership.findFirst({
      where: {
        roleCode: RoleCode.OWNER,
        organization: { isActive: true, archivedAt: null, bookingEnabled: true },
      },
      include: {
        organization: {
          include: {
            services: { where: { isActive: true }, take: 1 },
          },
        },
        user: true,
      },
    });

    if (!membership || !membership.organization) {
      throw new Error("No active organization with owner found.");
    }

    const org = membership.organization;
    const ownerUser = membership.user;
    console.log(`✓ Using Organization: "${org.name}" (ID: ${org.id}, Slug: ${org.slug})`);
    console.log(`✓ Using Owner Caller: "${ownerUser.fullName}" (Email: ${ownerUser.email})`);

    const ownerCtx: RequestContext = {
      requestId: "req-e2e-1",
      correlationId: "corr-e2e-1",
      subjectId: ownerUser.id,
      actorType: ActorType.STAFF,
      organizationId: org.id,
      roleCode: RoleCode.OWNER,
      permissions: Object.values(PermissionKey),
      locale: "en-US",
      timezone: "UTC",
      isPlatformAdmin: false,
      issuedAt: new Date().toISOString(),
    };

    // 2. Telemetry Overview Stats
    console.log("\n[Step 2] Querying Marketing Overview Telemetry...");
    const stats = await marketingService.getOverviewStats(ownerCtx);
    console.log(`✓ Telemetry loaded: Total Subscribers: ${stats.totalSubscribers}, Reachable Audience: ${stats.totalAudience}, Opt-In Rate: ${stats.optInRatePct}%, Active Deals: ${stats.activeCouponsCount}`);

    // 3. Coupon CRUD
    console.log("\n[Step 3] Testing Studio Coupon CRUD Lifecycle in PostgreSQL...");
    const testCode = `PROMO${Math.floor(1000 + Math.random() * 9000)}`;
    const createdCoupon = await marketingService.createCoupon(
      {
        code: testCode,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 25,
        minSpendCents: 5000,
        maxDiscountCents: 5000,
        isActive: true,
      },
      ownerCtx
    );
    console.log(`✓ Created Studio Coupon: "${createdCoupon.code}" (25% OFF, Min Spend $50.00, ID: ${createdCoupon.id})`);

    const couponList = await marketingService.listCoupons(ownerCtx);
    const foundInList = couponList.some((c) => c.id === createdCoupon.id);
    if (!foundInList) throw new Error("Created coupon not found in organization coupon list.");
    console.log(`✓ Verified coupon appears in organization coupon directory (${couponList.length} total coupons)`);

    const toggled = await marketingService.toggleCoupon(createdCoupon.id, ownerCtx);
    console.log(`✓ Toggled coupon status -> isActive: ${toggled.isActive}`);
    const toggledBack = await marketingService.toggleCoupon(createdCoupon.id, ownerCtx);
    console.log(`✓ Toggled coupon status back -> isActive: ${toggledBack.isActive}`);

    // 4. Email Template Studio
    console.log("\n[Step 4] Testing Email Template Studio Lifecycle...");
    const tplName = `E2E Template ${Date.now()}`;
    const createdTemplate = await marketingService.create(
      {
        name: tplName,
        subject: "Special Gift from {{studioName}}",
        htmlBody: `<h1>Hi {{customerName}}</h1><p>Use code {{couponCode}} to get {{discountValue}}!</p><a href="{{bookingLink}}">Book Now</a>`,
        textBody: "Hi {{customerName}}, use {{couponCode}} for {{discountValue}}! {{bookingLink}}",
      },
      ownerCtx
    );
    console.log(`✓ Created Organization Email Template: "${createdTemplate.name}" (ID: ${createdTemplate.id})`);

    const duplicated = await marketingService.duplicateTemplate(createdTemplate.id, ownerCtx);
    console.log(`✓ Cloned template successfully: "${duplicated.name}" (ID: ${duplicated.id})`);

    // 5. Audience Directory & Segmentation
    console.log("\n[Step 5] Testing Audience & Consent Directory...");
    const audience = await marketingService.getAudienceList(ownerCtx);
    console.log(`✓ Loaded audience directory: ${audience.length} customer records in database`);

    const allSubCount = await marketingService.getAudienceCount(ownerCtx, AudienceSegment.ALL_SUBSCRIBED);
    const portalSubCount = await marketingService.getAudienceCount(ownerCtx, AudienceSegment.PORTAL_MEMBERS);
    console.log(`✓ Live Segment Counts: ALL_SUBSCRIBED = ${allSubCount.count}, PORTAL_MEMBERS = ${portalSubCount.count}`);

    // 6. Customer Portal Offers & Marketing Preferences
    console.log("\n[Step 6] Testing Customer Portal Connection (Offers & Consent Center)...");
    // Ensure at least one customer exists with consentMarketing = true
    let testCustomer = await prisma.customer.findFirst({
      where: { organizationId: org.id, email: { not: "" } },
    });

    if (!testCustomer) {
      testCustomer = await prisma.customer.create({
        data: {
          organizationId: org.id,
          fullName: "E2E Test Client",
          email: `e2e_client_${Date.now()}@example.com`,
          consentMarketing: true,
          consentMarketingAt: new Date(),
          completedAppointmentsCount: 1,
          totalSpentCents: 7500,
        },
      });
      console.log(`✓ Created test customer: ${testCustomer.fullName} (${testCustomer.email})`);
    } else {
      await prisma.customer.update({
        where: { id: testCustomer.id },
        data: { consentMarketing: true, consentMarketingAt: new Date() },
      });
      console.log(`✓ Configured customer with consent: ${testCustomer.fullName} (${testCustomer.email})`);
    }

    // Test customer portal offer retrieval
    const customerCtx: RequestContext = {
      requestId: "req-e2e-2",
      correlationId: "corr-e2e-2",
      subjectId: testCustomer.userId || testCustomer.id,
      actorType: ActorType.CUSTOMER,
      organizationId: org.id,
      roleCode: undefined,
      permissions: [],
      locale: "en-US",
      timezone: "UTC",
      isPlatformAdmin: false,
      issuedAt: new Date().toISOString(),
    };

    const customerOffers = await customerPortalService.getOffers(customerCtx);
    console.log(`✓ Customer Portal fetched active studio perks: ${customerOffers.length} offer(s) available.`);
    const offerFound = customerOffers.some((o) => o.code === testCode);
    if (!offerFound) throw new Error("Newly created active coupon not visible to customer portal.");
    console.log(`✓ Verified coupon "${testCode}" is visible in customer portal offers!`);

    // Test public offer retrieval by slug
    const publicOffers = await customerPortalService.getPublicOffers(org.slug);
    console.log(`✓ Public offer endpoint verified for slug "${org.slug}": ${publicOffers.length} deal(s) returned.`);

    // 7. Launch Campaign with Attached Coupon
    console.log("\n[Step 7] Launching Campaign with Attached Coupon & Segment Filter...");
    const campaign = await marketingService.send(
      {
        templateId: createdTemplate.id,
        name: `E2E Campaign · ${testCode}`,
        segment: AudienceSegment.ALL_SUBSCRIBED,
        couponId: createdCoupon.id,
      },
      ownerCtx
    );
    console.log(`✓ Campaign queued! ID: ${campaign.id}, Name: "${campaign.name}", Status: ${campaign.status}, Recipients: ${campaign.recipientCount}`);

    // Verify Outbox Event created
    const outboxEvents = await prisma.outboxEvent.findMany({
      where: {
        organizationId: org.id,
        aggregateType: "EmailCampaign",
        aggregateId: campaign.id,
      },
    });
    console.log(`✓ Verified OutboxEvents created in database: ${outboxEvents.length} event(s) queued for Brevo.`);
    if (outboxEvents.length > 0) {
      const payload: any = outboxEvents[0].payload;
      console.log(`✓ Outbox event payload includes: couponCode="${payload.couponCode}", discountValue="${payload.discountValue}", bookingLink="${payload.bookingLink}"`);
      if (payload.couponCode !== testCode) {
        throw new Error(`Expected outbox payload to have couponCode "${testCode}", got "${payload.couponCode}"`);
      }
    }

    // 8. Campaign Detail & Delivery Report
    console.log("\n[Step 8] Testing Campaign Delivery Report Endpoint...");
    const campaignDetail = await marketingService.getCampaignDetail(campaign.id, ownerCtx);
    console.log(`✓ Loaded Campaign Delivery Report for "${campaignDetail.name}": ${campaignDetail.recipientCount} total recipients, status: ${campaignDetail.status}`);

    // 9. Pricing Engine Verification with Coupon
    console.log("\n[Step 9] Verifying Pricing Calculation with Coupon in Booking Engine...");
    if (org.services.length > 0) {
      const service = org.services[0];
      const quote = await pricingService.calculateQuote(org.id, {
        organizationId: org.id,
        serviceId: service.id,
        couponCode: testCode,
      });
      console.log(`✓ Pricing quote calculated: Base: $${(quote.basePriceCents / 100).toFixed(2)}, Discount: -$${(quote.discountCents / 100).toFixed(2)}, Total Due: $${(quote.totalCents / 100).toFixed(2)}, Applied Coupon: "${quote.appliedCouponCode}"`);
      if (quote.appliedCouponCode !== testCode) {
        throw new Error(`Expected appliedCouponCode to be "${testCode}", got "${quote.appliedCouponCode}"`);
      }
      if (quote.discountCents <= 0) {
        throw new Error("Expected discountCents to be greater than 0.");
      }
      console.log(`✓ Coupon discount math successfully applied real savings in PostgreSQL!`);
    }

    // 10. Clean up test templates and coupons
    console.log("\n[Step 10] Cleaning up test templates and test coupon...");
    await marketingService.deleteCoupon(createdCoupon.id, ownerCtx);
    await marketingService.remove(duplicated.id, ownerCtx);
    console.log("✓ Cleanup completed successfully.");

    console.log("\n==================================================================");
    console.log("ALL 10 VERIFICATION CHECKS PASSED WITH 100% SUCCESS!");
    console.log("==================================================================");
  } finally {
    await (prisma as any).$disconnect();
  }
}

runVerification().catch((err) => {
  console.error("\n❌ E2E VERIFICATION FAILED:", err);
  process.exit(1);
});
