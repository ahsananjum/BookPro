import { ScheduleInsightService } from "./schedule-insight.service";
import { ConflictException, BadRequestException } from "@nestjs/common";

describe("ScheduleInsightService", () => {
    let service: ScheduleInsightService;
    let mockPrisma: any;
    let mockAvailabilityService: any;
    let mockWaitlistOfferService: any;
    let mockGapDetectionService: any;

    beforeEach(() => {
        mockPrisma = {
            scheduleInsight: {
                findMany: jest.fn(),
                findFirst: jest.fn(),
                update: jest.fn(),
            },
            waitlistOffer: {
                update: jest.fn(),
            },
            organization: {
                findUnique: jest.fn(),
                update: jest.fn(),
            },
        };
        mockAvailabilityService = {
            validateAvailability: jest.fn(),
        };
        mockWaitlistOfferService = {
            createManualOffer: jest.fn(),
        };
        mockGapDetectionService = {
            toDto: jest.fn((r) => r),
        };
        const mockScoringService = {
            scoreCandidate: jest.fn(),
        } as any;

        service = new ScheduleInsightService(
            mockPrisma,
            mockAvailabilityService,
            mockWaitlistOfferService,
            mockGapDetectionService,
            mockScoringService,
        );
    });

    const activeInsight = {
        id: "insight-1",
        organizationId: "org-1",
        locationId: "loc-1",
        staffId: "staff-1",
        serviceId: "svc-1",
        startAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
        endAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
        status: "ACTIVE",
        candidateMatches: [
            {
                waitlistEntryId: "entry-1",
                customerId: "cust-1",
                totalScore: 90,
                serviceId: "svc-1",
            },
        ],
    };

    it("successfully actions an insight by creating a P9 waitlist offer and updating status to ACTIONED", async () => {
        mockPrisma.scheduleInsight.findFirst.mockResolvedValue(activeInsight);
        mockAvailabilityService.validateAvailability.mockResolvedValue({ isAvailable: true });
        mockWaitlistOfferService.createManualOffer.mockResolvedValue({
            id: "offer-1",
            token: "tok_test12345",
            status: "PENDING",
        });
        mockPrisma.scheduleInsight.update.mockResolvedValue({
            ...activeInsight,
            status: "ACTIONED",
            actionedOfferId: "offer-1",
        });

        const result = await service.actionInsight("org-1", "insight-1", {
            selectedEntryId: "entry-1",
            expiresInMinutes: 60,
        });

        expect(mockAvailabilityService.validateAvailability).toHaveBeenCalledTimes(1);
        expect(mockWaitlistOfferService.createManualOffer).toHaveBeenCalledTimes(1);
        expect(mockPrisma.scheduleInsight.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "insight-1" },
                data: expect.objectContaining({
                    status: "ACTIONED",
                    actionedOfferId: "offer-1",
                }),
            })
        );
        expect(result.offer.id).toBe("offer-1");
    });

    it("rejects action and marks insight STALE when slot is no longer available", async () => {
        mockPrisma.scheduleInsight.findFirst.mockResolvedValue(activeInsight);
        mockAvailabilityService.validateAvailability.mockResolvedValue({ isAvailable: false });

        await expect(
            service.actionInsight("org-1", "insight-1", { selectedEntryId: "entry-1" })
        ).rejects.toThrow(ConflictException);

        expect(mockPrisma.scheduleInsight.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "insight-1" },
                data: expect.objectContaining({ status: "STALE" }),
            })
        );
    });

    it("dismisses an insight by updating status to DISMISSED", async () => {
        mockPrisma.scheduleInsight.findFirst.mockResolvedValue(activeInsight);
        mockPrisma.scheduleInsight.update.mockResolvedValue({
            ...activeInsight,
            status: "DISMISSED",
        });

        const result = await service.dismissInsight("org-1", "insight-1", { reason: "Customer changed mind" });
        expect(mockPrisma.scheduleInsight.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "insight-1" },
                data: expect.objectContaining({ status: "DISMISSED" }),
            })
        );
    });

    it("processes auto-offers only when autoOfferEnabled is true", async () => {
        // Disabled case
        mockPrisma.organization.findUnique.mockResolvedValue({
            id: "org-1",
            autoOfferEnabled: false,
            noShowSignalEnabled: false,
        });
        const countDisabled = await service.processAutoOffers("org-1");
        expect(countDisabled).toBe(0);

        // Enabled case
        mockPrisma.organization.findUnique.mockResolvedValue({
            id: "org-1",
            autoOfferEnabled: true,
            noShowSignalEnabled: false,
        });
        mockPrisma.scheduleInsight.findMany.mockResolvedValue([activeInsight]);
        mockPrisma.scheduleInsight.findFirst.mockResolvedValue(activeInsight);
        mockAvailabilityService.validateAvailability.mockResolvedValue({ isAvailable: true });
        mockWaitlistOfferService.createManualOffer.mockResolvedValue({ id: "offer-auto", token: "tok_auto" });
        mockPrisma.scheduleInsight.update.mockResolvedValue({ ...activeInsight, status: "ACTIONED" });

        const countEnabled = await service.processAutoOffers("org-1");
        expect(countEnabled).toBe(1);
    });
});
