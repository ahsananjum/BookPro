import { ScheduleInsightService } from "./schedule-insight.service";

describe("AutonomousGapRecoverySpec - 0-Latency Gap Processor & Auto-Offering", () => {
    let service: ScheduleInsightService;
    let mockPrisma: any;
    let mockAvailabilityService: any;
    let mockWaitlistOfferService: any;
    let mockGapDetectionService: any;
    let mockScoringService: any;

    const orgId = "org-1";
    const locationId = "loc-1";
    const staffId = "staff-1";
    const serviceId = "svc-1";

    const targetService = {
        id: serviceId,
        name: "Hair Styling",
        durationMin: 45,
        priceCents: 6000,
        capacity: 1,
    };

    const locationRecord = {
        id: locationId,
        organizationId: orgId,
        timezone: "America/New_York",
        archivedAt: null,
    };

    beforeEach(() => {
        mockPrisma = {
            organization: {
                findUnique: jest.fn(),
                update: jest.fn(),
            },
            service: {
                findFirst: jest.fn().mockResolvedValue(targetService),
                findMany: jest.fn().mockResolvedValue([targetService]),
            },
            location: {
                findFirst: jest.fn().mockResolvedValue(locationRecord),
            },
            staffProfile: {
                findFirst: jest.fn().mockResolvedValue({ id: staffId, displayName: "Elena Rostova" }),
            },
            waitlistEntry: {
                findMany: jest.fn(),
                findFirst: jest.fn(),
                update: jest.fn(),
            },
            scheduleInsight: {
                create: jest.fn(),
                findFirst: jest.fn(),
                update: jest.fn(),
                upsert: jest.fn(),
            },
            waitlistOffer: {
                create: jest.fn(),
                findFirst: jest.fn(),
                update: jest.fn(),
            },
            bookingHold: {
                updateMany: jest.fn(),
            },
        };

        mockAvailabilityService = {
            validateAvailability: jest.fn().mockResolvedValue({ isAvailable: true }),
        };

        mockWaitlistOfferService = {
            createManualOffer: jest.fn(),
        };

        mockGapDetectionService = {
            toDto: jest.fn((r) => r),
        };

        mockScoringService = {
            scoreCandidate: jest.fn(),
        };

        service = new ScheduleInsightService(
            mockPrisma,
            mockAvailabilityService,
            mockWaitlistOfferService,
            mockGapDetectionService,
            mockScoringService,
        );
    });

    describe("1. Autonomous Slot Opening Gap Processor (0-Latency Trigger)", () => {
        it("auto-dispatches an offer immediately when autoOfferEnabled is true and candidate score >= 70", async () => {
            const startAt = new Date(Date.now() + 3600 * 1000);
            const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

            mockPrisma.organization.findUnique.mockResolvedValue({
                id: orgId,
                autoOfferEnabled: true,
                autoOfferThreshold: 70,
                autoOfferExpiryMinutes: 15,
            });

            const candidateEntry = {
                id: "entry-1",
                organizationId: orgId,
                customerId: "cust-1",
                serviceId,
                staffId,
                locationId,
                status: "ACTIVE",
                service: targetService,
                customer: {
                    fullName: "Alice Smith",
                    email: "alice@example.com",
                    totalSpentCents: 10000,
                    completedAppointmentsCount: 3,
                },
            };

            mockPrisma.waitlistEntry.findMany.mockResolvedValue([candidateEntry]);

            mockScoringService.scoreCandidate.mockReturnValue({
                waitlistEntryId: "entry-1",
                customerId: "cust-1",
                customerName: "Alice Smith",
                serviceId,
                serviceName: "Hair Styling",
                totalScore: 92,
                factors: { timeFit: 30, staffFit: 20, locationFit: 15, serviceFit: 15, seniority: 10, vip: 2 },
                explanation: "92% match - Perfect schedule and specialist fit",
            });

            mockPrisma.scheduleInsight.upsert.mockResolvedValue({
                id: "insight-upserted-1",
                organizationId: orgId,
                status: "ACTIVE",
                candidateMatches: [{ waitlistEntryId: "entry-1", totalScore: 92 }],
            });
            mockPrisma.scheduleInsight.findFirst.mockResolvedValue({
                id: "insight-upserted-1",
                organizationId: orgId,
                locationId,
                staffId,
                serviceId,
                startAt,
                endAt,
                status: "ACTIVE",
                candidateMatches: [{ waitlistEntryId: "entry-1", totalScore: 92 }],
            });

            mockWaitlistOfferService.createManualOffer.mockResolvedValue({
                id: "offer-auto-1",
                token: "token_auto_123",
                status: "PENDING",
            });
            mockPrisma.scheduleInsight.update.mockResolvedValue({
                id: "insight-upserted-1",
                status: "ACTIONED",
            });

            const result = await service.processSlotOpening(orgId, locationId, staffId, startAt, endAt, serviceId);

            expect(result.offerDispatched).toBe(true);
            expect(result.offerId).toBe("offer-auto-1");
            expect(result.candidateEntryId).toBe("entry-1");
            expect(result.matchCount).toBe(1);
            expect(mockWaitlistOfferService.createManualOffer).toHaveBeenCalledWith(
                orgId,
                expect.objectContaining({
                    waitlistEntryId: "entry-1",
                    startAt: startAt.toISOString(),
                    endAt: endAt.toISOString(),
                }),
                undefined,
            );
        });

        it("creates an active ScheduleInsight for staff desk when candidate score < 70 or autoOfferEnabled is false", async () => {
            const startAt = new Date(Date.now() + 3600 * 1000);
            const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

            mockPrisma.organization.findUnique.mockResolvedValue({
                id: orgId,
                autoOfferEnabled: false, // staff approval required
                autoOfferThreshold: 70,
            });

            const candidateEntry = {
                id: "entry-2",
                organizationId: orgId,
                customerId: "cust-2",
                serviceId,
                staffId,
                locationId,
                status: "ACTIVE",
                service: targetService,
                customer: {
                    fullName: "Bob Jones",
                    email: "bob@example.com",
                    totalSpentCents: 0,
                    completedAppointmentsCount: 0,
                },
            };

            mockPrisma.waitlistEntry.findMany.mockResolvedValue([candidateEntry]);

            mockScoringService.scoreCandidate.mockReturnValue({
                waitlistEntryId: "entry-2",
                customerId: "cust-2",
                customerName: "Bob Jones",
                serviceId,
                serviceName: "Hair Styling",
                totalScore: 65,
                factors: { timeFit: 20, staffFit: 15, locationFit: 15, serviceFit: 15, seniority: 0, vip: 0 },
                explanation: "65% match - Partial time fit",
            });

            mockPrisma.scheduleInsight.upsert.mockResolvedValue({
                id: "insight-created-manual",
                organizationId: orgId,
                status: "ACTIVE",
            });

            const result = await service.processSlotOpening(orgId, locationId, staffId, startAt, endAt, serviceId);

            expect(result.offerDispatched).toBe(false);
            expect(result.insightId).toBe("insight-created-manual");
            expect(result.matchCount).toBe(1);
            expect(mockWaitlistOfferService.createManualOffer).not.toHaveBeenCalled();
        });

        it("safely handles 0 matching waitlist candidates without throwing errors", async () => {
            const startAt = new Date(Date.now() + 3600 * 1000);
            const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

            mockPrisma.organization.findUnique.mockResolvedValue({
                id: orgId,
                autoOfferEnabled: true,
                autoOfferThreshold: 70,
            });

            mockPrisma.waitlistEntry.findMany.mockResolvedValue([]);

            const result = await service.processSlotOpening(orgId, locationId, staffId, startAt, endAt, serviceId);

            expect(result.offerDispatched).toBe(false);
            expect(result.matchCount).toBe(0);
        });
    });

    describe("2. Autonomous Cascade Promotion to Candidate #2", () => {
        it("promotes candidate #2 when candidate #1 declines or offer expires", async () => {
            const startAt = new Date(Date.now() + 3600 * 1000);
            const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

            mockPrisma.organization.findUnique.mockResolvedValue({
                id: orgId,
                autoOfferEnabled: true,
                autoOfferThreshold: 70,
                autoOfferExpiryMinutes: 15,
            });

            const candidateTwo = {
                id: "entry-runner-up",
                organizationId: orgId,
                customerId: "cust-runner-up",
                serviceId,
                staffId,
                locationId,
                status: "ACTIVE",
                service: targetService,
                customer: {
                    fullName: "Carol Danvers",
                    email: "carol@example.com",
                    totalSpentCents: 5000,
                    completedAppointmentsCount: 1,
                },
            };

            mockPrisma.waitlistEntry.findMany.mockResolvedValue([candidateTwo]);

            mockScoringService.scoreCandidate.mockReturnValue({
                waitlistEntryId: "entry-runner-up",
                customerId: "cust-runner-up",
                customerName: "Carol Danvers",
                serviceId,
                serviceName: "Hair Styling",
                totalScore: 88,
                factors: { timeFit: 28, staffFit: 20, locationFit: 15, serviceFit: 15, seniority: 8, vip: 2 },
                explanation: "88% match - Runner up candidate in queue",
            });

            mockPrisma.scheduleInsight.upsert.mockResolvedValue({
                id: "insight-cascade-1",
                organizationId: orgId,
                status: "ACTIVE",
            });
            mockPrisma.scheduleInsight.findFirst.mockResolvedValue({
                id: "insight-cascade-1",
                organizationId: orgId,
                locationId,
                staffId,
                serviceId,
                startAt,
                endAt,
                status: "ACTIVE",
                candidateMatches: [{ waitlistEntryId: "entry-runner-up", totalScore: 88 }],
            });

            mockWaitlistOfferService.createManualOffer.mockResolvedValue({
                id: "offer-cascade-2",
                token: "token_cascade_456",
                status: "PENDING",
            });
            mockPrisma.scheduleInsight.update.mockResolvedValue({
                id: "insight-cascade-1",
                status: "ACTIONED",
            });

            const cascadeResult = await service.cascadeOfferToNextCandidate(orgId, {
                locationId,
                staffId,
                serviceId,
                startAt,
                endAt,
                excludeWaitlistEntryId: "entry-1",
            });

            expect(cascadeResult.offerDispatched).toBe(true);
            expect(cascadeResult.nextEntryId).toBe("entry-runner-up");
            expect(mockWaitlistOfferService.createManualOffer).toHaveBeenCalledWith(
                orgId,
                expect.objectContaining({
                    waitlistEntryId: "entry-runner-up",
                }),
                undefined,
            );
        });
    });
});
