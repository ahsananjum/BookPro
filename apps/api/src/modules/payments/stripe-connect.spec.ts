import { BadRequestException } from "@nestjs/common";
import { StripeConnectController } from "./stripe-connect.controller";

describe("StripeConnectController", () => {
    const organizationId = "00000000-0000-0000-0000-000000000001";
    const context: any = { organizationId, subjectId: "user-1" };
    let service: any;
    let controller: StripeConnectController;

    beforeEach(() => {
        service = {
            getStatus: jest.fn().mockResolvedValue({ connected: false }),
            begin: jest.fn().mockResolvedValue({ url: "https://connect.stripe.com/setup/test" }),
            disconnect: jest.fn().mockResolvedValue(undefined),
            completeOAuth: jest.fn(),
            abandonOAuth: jest.fn(),
        };
        controller = new StripeConnectController(service);
        process.env.WEB_URL = "https://app.bookpro.test";
    });

    afterEach(() => delete process.env.WEB_URL);

    it("reads webhook-maintained status without provider calls", async () => {
        const result = await controller.getStatus(context);
        expect(result.data.connected).toBe(false);
        expect(service.getStatus).toHaveBeenCalledWith(organizationId);
    });

    it("starts onboarding through POST with same-origin CSRF enforcement", async () => {
        const req: any = { header: (name: string) => name === "origin" ? "https://app.bookpro.test" : undefined };
        const result = await controller.beginConnect(context, req, { returnPath: "/onboarding?step=8" });
        expect(result.data.url).toContain("connect.stripe.com");
        expect(service.begin).toHaveBeenCalledWith(organizationId, "user-1", "/onboarding?step=8");
    });

    it("rejects cross-site side-effect requests", async () => {
        const req: any = { header: (name: string) => name === "origin" ? "https://evil.test" : undefined };
        await expect(controller.beginConnect(context, req, {})).rejects.toThrow(BadRequestException);
        expect(service.begin).not.toHaveBeenCalled();
    });
});
