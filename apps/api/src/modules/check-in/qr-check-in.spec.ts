import { QrCheckInService } from "./qr-check-in.service";
import { UnauthorizedException, BadRequestException } from "@nestjs/common";

describe("QrCheckInService — Signed Tokens & Window Verification", () => {
    let service: QrCheckInService;
    let mockPrisma: any;
    let mockRealtime: any;

    beforeEach(() => {
        process.env.QR_SIGNING_SECRET = "test-only-qr-signing-secret-32-characters";
        mockPrisma = {
            appointment: {
                findFirst: jest.fn(),
                update: jest.fn(),
            },
            auditLog: {
                create: jest.fn(),
            },
        };
        mockRealtime = {
            broadcastEvent: jest.fn().mockResolvedValue(undefined),
        };

        service = new QrCheckInService(mockPrisma, mockRealtime);
    });

    it("generates a signed cryptographic QR pass for an appointment", async () => {
        const now = new Date();
        const startAt = new Date(now.getTime() + 15 * 60 * 1000); // in 15 mins
        const endAt = new Date(now.getTime() + 75 * 60 * 1000);

        mockPrisma.appointment.findFirst.mockResolvedValue({
            id: "appt-100",
            organizationId: "org-1",
            locationId: "loc-1",
            startAt,
            endAt,
            location: { name: "Downtown Salon" },
            service: { name: "Haircut" },
            staff: { displayName: "Elena" },
        });

        const pass = await service.generatePass("appt-100", "org-1", "cust-1");

        expect(pass.appointmentId).toBe("appt-100");
        expect(pass.isEligibleNow).toBe(true);
        expect(pass.qrToken).toContain("appt-100:org-1:loc-1:");
        expect(pass.qrToken.split(":").length).toBe(5);
    });

    it("successfully verifies valid signed token and transitions appointment to CHECKED_IN", async () => {
        const now = new Date();
        const startAt = new Date(now.getTime());
        const endAt = new Date(now.getTime() + 60 * 60 * 1000);

        mockPrisma.appointment.findFirst.mockResolvedValue({
            id: "appt-100",
            organizationId: "org-1",
            locationId: "loc-1",
            startAt,
            endAt,
            status: "CONFIRMED",
            customer: { fullName: "Alice" },
            service: { name: "Haircut" },
            staff: { displayName: "Elena" },
        });

        const pass = await service.generatePass("appt-100", "org-1");

        mockPrisma.appointment.update.mockResolvedValue({
            id: "appt-100",
            status: "CHECKED_IN",
            version: 2,
            customer: { fullName: "Alice" },
            service: { name: "Haircut" },
            staff: { displayName: "Elena" },
        });

        const result = await service.verifyAndCheckIn(pass.qrToken);

        expect(result.success).toBe(true);
        expect(result.customerName).toBe("Alice");
        expect(mockPrisma.appointment.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "appt-100" },
                data: expect.objectContaining({ status: "CHECKED_IN" }),
            })
        );
        expect(mockPrisma.auditLog.create).toHaveBeenCalled();
        expect(mockRealtime.broadcastEvent).toHaveBeenCalled();
    });

    it("rejects check-in with invalid or tampered HMAC signature", async () => {
        const tamperedToken = "appt-100:org-1:loc-1:1756281000:invalid_tampered_sig_123456";

        await expect(service.verifyAndCheckIn(tamperedToken)).rejects.toThrow(
            UnauthorizedException
        );
    });
});
