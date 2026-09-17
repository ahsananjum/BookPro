import { ReviewService } from "./review.service";
import { ForbiddenException, BadRequestException, ConflictException } from "@nestjs/common";

describe("ReviewService — Verified Reviews & Invariants", () => {
    let service: ReviewService;
    let mockPrisma: any;

    beforeEach(() => {
        mockPrisma = {
            appointment: {
                findFirst: jest.fn(),
            },
            review: {
                findUnique: jest.fn(),
                create: jest.fn(),
                findFirst: jest.fn(),
                update: jest.fn(),
                findMany: jest.fn(),
                count: jest.fn(),
            },
        };

        service = new ReviewService(mockPrisma);
    });

    it("creates a verified review for an owned, COMPLETED appointment", async () => {
        mockPrisma.appointment.findFirst.mockResolvedValue({
            id: "appt-1",
            organizationId: "org-1",
            customerId: "cust-1",
            serviceId: "svc-1",
            staffId: "st-1",
            locationId: "loc-1",
            status: "COMPLETED",
        });

        mockPrisma.review.findUnique.mockResolvedValue(null);
        mockPrisma.review.create.mockResolvedValue({
            id: "rev-1",
            organizationId: "org-1",
            appointmentId: "appt-1",
            customerId: "cust-1",
            rating: 5,
            comment: "Exceptional service!",
            status: "PUBLISHED",
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const result = await service.createReview("org-1", "cust-1", {
            appointmentId: "appt-1",
            rating: 5,
            comment: "Exceptional service!",
        });

        expect(result.rating).toBe(5);
        expect(result.status).toBe("PUBLISHED");
        expect(mockPrisma.review.create).toHaveBeenCalledTimes(1);
    });

    it("rejects review if appointment status is not COMPLETED (e.g. CONFIRMED)", async () => {
        mockPrisma.appointment.findFirst.mockResolvedValue({
            id: "appt-2",
            organizationId: "org-1",
            customerId: "cust-1",
            status: "CONFIRMED",
        });

        await expect(
            service.createReview("org-1", "cust-1", {
                appointmentId: "appt-2",
                rating: 5,
            })
        ).rejects.toThrow(BadRequestException);
    });

    it("rejects review if customer does not own the appointment", async () => {
        mockPrisma.appointment.findFirst.mockResolvedValue({
            id: "appt-3",
            organizationId: "org-1",
            customerId: "cust-other",
            status: "COMPLETED",
        });

        await expect(
            service.createReview("org-1", "cust-1", {
                appointmentId: "appt-3",
                rating: 5,
            })
        ).rejects.toThrow(ForbiddenException);
    });

    it("prevents duplicate reviews for the same booking", async () => {
        mockPrisma.appointment.findFirst.mockResolvedValue({
            id: "appt-1",
            organizationId: "org-1",
            customerId: "cust-1",
            status: "COMPLETED",
        });

        mockPrisma.review.findUnique.mockResolvedValue({
            id: "rev-existing",
            appointmentId: "appt-1",
        });

        await expect(
            service.createReview("org-1", "cust-1", {
                appointmentId: "appt-1",
                rating: 4,
            })
        ).rejects.toThrow(ConflictException);
    });

    it("rejects invalid rating values outside 1-5 range", async () => {
        mockPrisma.appointment.findFirst.mockResolvedValue({
            id: "appt-1",
            organizationId: "org-1",
            customerId: "cust-1",
            status: "COMPLETED",
        });

        mockPrisma.review.findUnique.mockResolvedValue(null);

        await expect(
            service.createReview("org-1", "cust-1", {
                appointmentId: "appt-1",
                rating: 6,
            })
        ).rejects.toThrow(BadRequestException);
    });
});
