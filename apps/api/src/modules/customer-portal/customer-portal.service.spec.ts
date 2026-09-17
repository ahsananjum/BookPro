import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import * as crypto from "crypto";
import { ActorType } from "@bookpro/contracts";
import { CustomerPortalService } from "./customer-portal.service";

describe("CustomerPortalService Unit & Invariant Test Suite", () => {
  let prisma: any;
  let service: CustomerPortalService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((callback, options) => {
        if (typeof callback === "function") {
          return callback(prisma);
        }
        return Promise.all(callback);
      }),
      user: {
        findUnique: jest.fn(),
      },
      organization: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      customer: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      customerInvitation: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: "audit-1" }),
      },
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: "outbox-1" }),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    service = new CustomerPortalService(prisma);
  });

  describe("1. Atomic Invitation Creation & Invariants", () => {
    it("writes invitation, audit log, and outbox event atomically in one serializable transaction", async () => {
      prisma.organization.findFirst.mockResolvedValue({
        id: "org-1",
        isActive: true,
        archivedAt: null,
        onboardingCompleted: true,
        bookingEnabled: true,
      });
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customerInvitation.findFirst.mockResolvedValue(null);
      prisma.customerInvitation.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "inv-1", ...data })
      );

      const result = await service.invite(
        { email: "TEST.CUSTOMER@Example.com" },
        { organizationId: "org-1", subjectId: "owner-1" } as any
      );

      expect(result.id).toBe("inv-1");
      expect(result.email).toBe("test.customer@example.com");

      // Verify transaction was called
      expect(prisma.$transaction).toHaveBeenCalled();

      // Verify atomic writes
      expect(prisma.customerInvitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: "org-1",
            email: "test.customer@example.com",
            createdBy: "owner-1",
          }),
        })
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "customer.invite_created",
            actorId: "owner-1",
          }),
        })
      );

      expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: "identity.customer_invitation_requested",
            aggregateType: "CustomerInvitation",
          }),
        })
      );
    });

    it("rejects duplicate active invitations for the same email", async () => {
      prisma.organization.findFirst.mockResolvedValue({
        id: "org-1",
        isActive: true,
        archivedAt: null,
        onboardingCompleted: true,
        bookingEnabled: true,
      });
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customerInvitation.findFirst.mockResolvedValue({
        id: "existing-inv",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(
        service.invite({ email: "active@example.com" }, { organizationId: "org-1", subjectId: "owner-1" } as any)
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects invitations for customers who already have a linked portal account", async () => {
      prisma.organization.findFirst.mockResolvedValue({
        id: "org-1",
        isActive: true,
        archivedAt: null,
        onboardingCompleted: true,
        bookingEnabled: true,
      });
      prisma.customer.findFirst.mockResolvedValue({
        id: "cust-1",
        userId: "user-already-linked",
      });

      await expect(
        service.invite({ email: "linked@example.com" }, { organizationId: "org-1", subjectId: "owner-1" } as any)
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("2. Reissuing & Revoking Invitations", () => {
    it("atomically revokes old invitation and creates replacement when reissuing", async () => {
      prisma.customerInvitation.findFirst.mockResolvedValue({
        id: "inv-old",
        organizationId: "org-1",
        email: "guest@example.com",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 100000),
      });
      prisma.customerInvitation.update.mockResolvedValue({ id: "inv-old", status: "REVOKED" });
      prisma.customerInvitation.create.mockResolvedValue({
        id: "inv-new",
        email: "guest@example.com",
        expiresAt: new Date(Date.now() + 600000),
      });

      const res = await service.resendInvitation("inv-old", { organizationId: "org-1", subjectId: "owner-1" } as any);

      expect(res.id).toBe("inv-new");
      expect(prisma.customerInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inv-old" },
          data: { status: "REVOKED" },
        })
      );
      expect(prisma.customerInvitation.create).toHaveBeenCalled();
      expect(prisma.outboxEvent.create).toHaveBeenCalled();
    });

    it("cannot revoke an already accepted invitation", async () => {
      prisma.customerInvitation.findFirst.mockResolvedValue({
        id: "inv-accepted",
        organizationId: "org-1",
        status: "ACCEPTED",
      });

      await expect(
        service.revokeInvitation("inv-accepted", { organizationId: "org-1", subjectId: "owner-1" } as any)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("cannot revoke an already expired invitation", async () => {
      prisma.customerInvitation.findFirst.mockResolvedValue({
        id: "inv-expired",
        organizationId: "org-1",
        status: "EXPIRED",
        expiresAt: new Date(Date.now() - 100000),
      });

      await expect(
        service.revokeInvitation("inv-expired", { organizationId: "org-1", subjectId: "owner-1" } as any)
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("3. Invitation Preview Endpoint", () => {
    it("returns only public organization metadata and no sensitive tokens or emails", async () => {
      const rawToken = "my-secret-token-12345678901234567890";
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      prisma.customerInvitation.findUnique.mockResolvedValue({
        id: "inv-1",
        tokenHash,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000),
        organization: {
          id: "org-1",
          name: "Acme Wellness Studio",
          slug: "acme-wellness",
          brandName: "Acme Wellness",
          logoUrl: "https://example.com/logo.png",
          primaryColor: "#0284c7",
          isActive: true,
          archivedAt: null,
          onboardingCompleted: true,
          bookingEnabled: true,
        },
      });

      const preview = await service.previewInvitation({ token: rawToken });

      expect(preview.organizationId).toBe("org-1");
      expect(preview.organizationName).toBe("Acme Wellness");
      expect(preview.organizationSlug).toBe("acme-wellness");
      expect(preview.status).toBe("PENDING");

      // Verify no leakage of token or email
      expect((preview as any).tokenHash).toBeUndefined();
      expect((preview as any).email).toBeUndefined();
      expect((preview as any).invitedEmail).toBeUndefined();
    });

    it("throws NotFoundException when previewing an invitation for an inactive organization", async () => {
      const rawToken = "inactive-org-token-1234567890";
      prisma.customerInvitation.findUnique.mockResolvedValue({
        id: "inv-1",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000),
        organization: {
          id: "org-1",
          isActive: false,
          archivedAt: new Date(),
        },
      });

      await expect(service.previewInvitation({ token: rawToken })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("4. Acceptance, CRM Guest Reuse, and Idempotency", () => {
    it("reuses existing guest CRM record case-insensitively and preserves customer history", async () => {
      const rawToken = "valid-token-12345678901234567890";
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      prisma.customerInvitation.findUnique.mockResolvedValue({
        id: "inv-1",
        organizationId: "org-1",
        email: "alice@example.com",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000),
        organization: {
          id: "org-1",
          name: "Luxe Studio",
          slug: "luxe-studio",
          isActive: true,
          archivedAt: null,
          onboardingCompleted: true,
          bookingEnabled: true,
        },
      });

      prisma.user.findUnique.mockResolvedValue({
        id: "user-alice",
        email: "Alice@Example.com",
        emailVerifiedAt: new Date(),
        accountType: "CUSTOMER",
        memberships: [],
        fullName: "Alice Smith",
      });

      // Existing guest CRM record without userId
      prisma.customer.findMany.mockResolvedValue([
        {
          id: "guest-crm-1",
          organizationId: "org-1",
          email: "alice@example.com",
          userId: null,
          fullName: "Alice",
        },
      ]);

      prisma.customer.update.mockResolvedValue({
        id: "guest-crm-1",
        userId: "user-alice",
      });
      prisma.customerInvitation.update.mockResolvedValue({ id: "inv-1", status: "ACCEPTED" });

      const result = await service.acceptInvite(
        { token: rawToken, consentMarketing: true },
        { subjectId: "user-alice" } as any
      );

      expect(result.customerId).toBe("guest-crm-1");
      expect(result.organization.slug).toBe("luxe-studio");

      // Verify customer was updated with userId rather than duplicated
      expect(prisma.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "guest-crm-1" },
          data: expect.objectContaining({
            userId: "user-alice",
            consentMarketing: true,
          }),
        })
      );
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it("fails safely with ConflictException when multiple ambiguous CRM records exist", async () => {
      const rawToken = "ambiguous-token-12345678901234";
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      prisma.customerInvitation.findUnique.mockResolvedValue({
        id: "inv-ambiguous",
        organizationId: "org-1",
        email: "dupe@example.com",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000),
        organization: { id: "org-1", isActive: true, archivedAt: null, onboardingCompleted: true, bookingEnabled: true },
      });

      prisma.user.findUnique.mockResolvedValue({
        id: "user-dupe",
        email: "dupe@example.com",
        emailVerifiedAt: new Date(),
        accountType: "CUSTOMER",
        memberships: [],
      });

      // Two duplicate CRM records exist for this email
      prisma.customer.findMany.mockResolvedValue([
        { id: "crm-rec-1", email: "dupe@example.com", userId: null },
        { id: "crm-rec-2", email: "dupe@example.com", userId: null },
      ]);

      await expect(
        service.acceptInvite({ token: rawToken, consentMarketing: false }, { subjectId: "user-dupe" } as any)
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("handles repeated acceptance by the same authenticated user idempotently", async () => {
      const rawToken = "idempotent-token-1234567890123";
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      prisma.customerInvitation.findUnique.mockResolvedValue({
        id: "inv-accepted",
        organizationId: "org-1",
        status: "ACCEPTED",
        acceptedById: "user-1",
        organization: { id: "org-1", name: "Studio", slug: "studio" },
      });

      prisma.customer.findFirst.mockResolvedValue({
        id: "crm-1",
        userId: "user-1",
      });

      const res = await service.acceptInvite(
        { token: rawToken, consentMarketing: false },
        { subjectId: "user-1" } as any
      );

      expect(res.alreadyAccepted).toBe(true);
      expect(res.customerId).toBe("crm-1");
    });

    it("rejects acceptance if already accepted by a different user account", async () => {
      const rawToken = "different-account-token-12345";
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      prisma.customerInvitation.findUnique.mockResolvedValue({
        id: "inv-accepted",
        organizationId: "org-1",
        status: "ACCEPTED",
        acceptedById: "user-original",
        organization: { id: "org-1", name: "Studio", slug: "studio" },
      });

      await expect(
        service.acceptInvite({ token: rawToken, consentMarketing: false }, { subjectId: "user-intruder" } as any)
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("rejects acceptance if user email does not match invited email case-insensitively", async () => {
      const rawToken = "wrong-email-token-12345678901";
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      prisma.customerInvitation.findUnique.mockResolvedValue({
        id: "inv-1",
        organizationId: "org-1",
        email: "intended@example.com",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000),
        organization: { id: "org-1", isActive: true, archivedAt: null, onboardingCompleted: true, bookingEnabled: true },
      });

      prisma.user.findUnique.mockResolvedValue({
        id: "user-2",
        email: "different@example.com",
        emailVerifiedAt: new Date(),
        accountType: "CUSTOMER",
        memberships: [],
      });

      await expect(
        service.acceptInvite({ token: rawToken, consentMarketing: false }, { subjectId: "user-2" } as any)
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("rejects acceptance if user account email is unverified", async () => {
      const rawToken = "unverified-token-12345678901";
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      prisma.customerInvitation.findUnique.mockResolvedValue({
        id: "inv-1",
        organizationId: "org-1",
        email: "unverified@example.com",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000),
        organization: { id: "org-1", isActive: true, archivedAt: null, onboardingCompleted: true, bookingEnabled: true },
      });

      prisma.user.findUnique.mockResolvedValue({
        id: "user-unverified",
        email: "unverified@example.com",
        emailVerifiedAt: null, // Unverified
        accountType: "CUSTOMER",
        memberships: [],
      });

      await expect(
        service.acceptInvite({ token: rawToken, consentMarketing: false }, { subjectId: "user-unverified" } as any)
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("5. Delivery State Mapping", () => {
    it("maps Brevo delivery states accurately based on Notification and Outbox records", async () => {
      prisma.customerInvitation.updateMany.mockResolvedValue({ count: 0 });
      prisma.customerInvitation.findMany.mockResolvedValue([
        {
          id: "inv-1",
          email: "sent@example.com",
          status: "PENDING",
          expiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "inv-2",
          email: "queued@example.com",
          status: "PENDING",
          expiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "inv-3",
          email: "failed@example.com",
          status: "PENDING",
          expiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      prisma.outboxEvent.findMany.mockResolvedValue([
        { aggregateId: "inv-1", status: "PROCESSED" },
        { aggregateId: "inv-2", status: "PENDING" },
        { aggregateId: "inv-3", status: "FAILED", lastError: "Brevo SMTP reject" },
      ]);

      prisma.notification.findMany.mockResolvedValue([
        {
          dedupeKey: "identity:customer-invite:inv-1",
          status: "SENT",
          providerId: "<brevo-msg-12345>",
          sentAt: new Date(),
        },
        {
          dedupeKey: "identity:customer-invite:inv-3",
          status: "FAILED",
          lastError: "Invalid recipient mailbox",
        },
      ]);

      const items = await service.listInvitations({ organizationId: "org-1" } as any);

      expect(items).toHaveLength(3);

      const sentItem = items.find((i) => i.id === "inv-1")!;
      expect(sentItem.displayStatus).toBe("Sent");
      expect(sentItem.brevoMessageId).toBe("<brevo-msg-12345>");

      const queuedItem = items.find((i) => i.id === "inv-2")!;
      expect(queuedItem.displayStatus).toBe("Queued for Brevo delivery");

      const failedItem = items.find((i) => i.id === "inv-3")!;
      expect(failedItem.displayStatus).toBe("Delivery failed");
      expect(failedItem.deliveryError).toContain("Invalid recipient mailbox");
    });
  });
});
