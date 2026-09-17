import { MarketingService } from "./marketing.service";

describe("MarketingService campaign recipients", () => {
  it("queues only registered customers with explicit promotional consent", async () => {
    const tx: any = {
      emailCampaign: { create: jest.fn().mockResolvedValue({ id: "campaign-1" }) },
      outboxEvent: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma: any = {
      organizationEmailTemplate: { findFirst: jest.fn().mockResolvedValue({ id: "template-1", subject: "Hello", htmlBody: "<p>Hello</p>", textBody: "Hello" }) },
      customer: { findMany: jest.fn().mockResolvedValue([{ id: "customer-1", email: "joined@example.com", fullName: "Joined Customer" }]) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new MarketingService(prisma);

    await service.send({ templateId: "template-1", name: "Promotion" }, { organizationId: "org-1", subjectId: "owner-1" } as any);

    expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", userId: { not: null }, consentMarketing: true } }));
    expect(tx.outboxEvent.createMany).toHaveBeenCalledTimes(1);
  });
});
