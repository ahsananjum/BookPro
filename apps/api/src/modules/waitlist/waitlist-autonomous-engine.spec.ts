import { WaitlistOfferService } from "./waitlist-offer.service";
import { NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";

describe("WaitlistAutonomousEngineSpec - Offer & Hold Lifecycle", () => {
    let service: WaitlistOfferService;
    let mockPrisma: any;
    let mockOutbox: any;
    let mockPolicy: any;
    let mockPricing: any;
    let mockBusyIntervalRepo: any;
    let mockAuthoritativeValidator: any;
    let mockRealtime: any;

    const orgId = "org-1";
    const entryId = "entry-1";
    const serviceId = "svc-1";
    const staffId = "staff-1";
    const locationId = "loc-1";
    const customerId = "cust-1";

    const baseEntry = {
        id: entryId,
        organizationId: orgId,
        customerId,
        serviceId,
        staffId,
        locationId,
        status: "ACTIVE",
        priorityScore: 85,
        service: {
            id: serviceId,
            name: "Hair Styling",
            durationMin: 45,
            preBufferMin: 0,
            postBufferMin: 15,
            priceCents: 6000,
            currency: "USD",
            depositType: "FIXED",
            depositValue: 2000,
            taxBehavior: "EXCLUSIVE",
        },
        customer: {
            id: customerId,
            fullName: "Alice Smith",
            email: "alice@example.com",
            phone: "+15551234567",
        },
        staff: {
            id: staffId,
            displayName: "Elena Rostova",
        },
        location: {
            id: locationId,
            name: "Downtown Flagship",
        },
    };

    beforeEach(() => {
        mockPrisma = {
            waitlistEntry: {
                findFirst: jest.fn(),
                update: jest.fn(),
            },
            waitlistOffer: {
                create: jest.fn(),
                findFirst: jest.fn(),
                findUnique: jest.fn(),
                findMany: jest.fn(),
                update: jest.fn(),
            },
            bookingHold: {
                create: jest.fn(),
                findFirst: jest.fn(),
                update: jest.fn(),
                updateMany: jest.fn(),
                findMany: jest.fn(),
            },
            appointment: {
                findFirst: jest.fn(),
            },
            outboxEvent: {
                create: jest.fn(),
            },
            $transaction: jest.fn(async (callback) => {
                return callback(mockPrisma);
            }),
        };

        mockOutbox = {
            emit: jest.fn().mockResolvedValue(undefined),
            createEvent: jest.fn().mockResolvedValue(undefined),
        };

        mockPolicy = {
            resolvePolicy: jest.fn().mockResolvedValue({
                waitlistOfferExpiryMinutes: 15,
                cancellationWindowHours: 24,
                rescheduleWindowHours: 12,
            }),
            getPolicy: jest.fn().mockResolvedValue({
                cancellationWindowHours: 24,
                rescheduleWindowHours: 12,
            }),
        };

        mockPricing = {
            calculateQuote: jest.fn().mockResolvedValue({
                depositCents: 2000,
                totalCents: 6000,
            }),
            calculateDepositCents: jest.fn().mockReturnValue(2000),
            calculatePrice: jest.fn().mockReturnValue({
                finalPriceCents: 6000,
                taxCents: 0,
                depositCents: 2000,
                currency: "USD",
            }),
        };

        mockBusyIntervalRepo = {
            findOverlappingIntervals: jest.fn().mockResolvedValue([]),
        };

        mockAuthoritativeValidator = {
            validateSlotForRead: jest.fn().mockImplementation((orgId, locId, svcId, staffId, startAt) => {
                const s = new Date(startAt);
                return Promise.resolve({
                    isAvailable: true,
                    endAt: { toDate: () => new Date(s.getTime() + 60 * 60 * 1000) },
                });
            }),
            validateSlotForWrite: jest.fn().mockResolvedValue({ isValid: true }),
        };

        mockRealtime = {
            broadcastEvent: jest.fn().mockResolvedValue(undefined),
        };

        service = new WaitlistOfferService(
            mockPrisma,
            mockOutbox,
            mockPolicy,
            mockPricing,
            mockBusyIntervalRepo,
            mockAuthoritativeValidator,
            mockRealtime,
        );
    });

    describe("1. Atomic BookingHold & Offer Creation", () => {
        it("atomically creates a BookingHold in PostgreSQL and links it to the WaitlistOffer", async () => {
            mockPrisma.waitlistEntry.findFirst.mockResolvedValue(baseEntry);
            const futureStart = new Date(Date.now() + 2 * 3600 * 1000);
            const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000);

            const createdHold = {
                id: "hold-uuid-1",
                organizationId: orgId,
                locationId,
                staffId,
                serviceId,
                startAt: futureStart,
                endAt: futureEnd,
                status: "ACTIVE",
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            };
            mockPrisma.bookingHold.create.mockResolvedValue(createdHold);

            const createdOffer = {
                id: "offer-uuid-1",
                organizationId: orgId,
                waitlistEntryId: entryId,
                bookingHoldId: "hold-uuid-1",
                token: "token_64_characters_hash",
                status: "PENDING",
                startAt: futureStart,
                endAt: futureEnd,
                serviceId,
                staffId,
                locationId,
                offeredPriceCents: 6000,
                requiredDepositCents: 2000,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                createdAt: new Date(),
                waitlistEntry: baseEntry,
                service: baseEntry.service,
                staff: baseEntry.staff,
                location: baseEntry.location,
            };
            mockPrisma.waitlistOffer.create.mockResolvedValue(createdOffer);
            mockPrisma.waitlistEntry.update.mockResolvedValue({ ...baseEntry, status: "OFFERED" });

            const result = await service.createManualOffer(orgId, {
                waitlistEntryId: entryId,
                startAt: futureStart.toISOString(),
                endAt: futureEnd.toISOString(),
                expiresInMinutes: 15,
                staffId,
                locationId,
            });

            expect(result).toBeDefined();
            expect(mockPrisma.bookingHold.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        organizationId: orgId,
                        status: "ACTIVE",
                    }),
                }),
            );
            expect(mockPrisma.waitlistOffer.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        bookingHoldId: "hold-uuid-1",
                        status: "PENDING",
                    }),
                }),
            );
            expect(mockPrisma.waitlistEntry.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: entryId },
                    data: { status: "OFFERED" },
                }),
            );
            expect(mockRealtime.broadcastEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "waitlist.offer_created",
                    organizationId: orgId,
                }),
            );
        });

        it("throws NotFoundException if waitlist entry is missing or not active", async () => {
            mockPrisma.waitlistEntry.findFirst.mockResolvedValue(null);

            await expect(
                service.createManualOffer(orgId, {
                    waitlistEntryId: "nonexistent",
                    startAt: new Date().toISOString(),
                    endAt: new Date().toISOString(),
                }),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe("2. Customer Portal Active Offers Retrieval (/waitlist/offers/my)", () => {
        it("fetches active pending offers and formats pricing transparently", async () => {
            const futureStart = new Date(Date.now() + 2 * 3600 * 1000);
            const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000);
            const expiresAt = new Date(Date.now() + 12 * 60 * 1000);

            const mockOffer = {
                id: "offer-1",
                organizationId: orgId,
                waitlistEntryId: entryId,
                bookingHoldId: "hold-1",
                token: "tok_secret_123",
                status: "PENDING",
                startAt: futureStart,
                endAt: futureEnd,
                serviceId,
                staffId,
                locationId,
                offeredPriceCents: 6000,
                requiredDepositCents: 2000,
                expiresAt,
                createdAt: new Date(),
                waitlistEntry: {
                    ...baseEntry,
                    notes: "Reschedule request for appointment #appt-100",
                },
                organization: {
                    id: orgId,
                    name: "BookPro Salon",
                },
                service: baseEntry.service,
                staff: baseEntry.staff,
                location: baseEntry.location,
            };

            mockPrisma.waitlistOffer.findMany.mockResolvedValue([mockOffer]);

            const offers = await service.getCustomerActiveOffers(orgId, customerId);

            expect(offers).toHaveLength(1);
            expect(offers[0].offerId).toBe("offer-1");
            expect(offers[0].token).toBe("tok_secret_123");
            expect(offers[0].serviceName).toBe("Hair Styling");
            expect(offers[0].staffName).toBe("Elena Rostova");
            expect(offers[0].locationName).toBe("Downtown Flagship");
            expect(offers[0].depositRequiredCents).toBe(2000);
            expect(offers[0].priceCents).toBe(6000);
        });
    });

    describe("3. Offer Decline Flow & Hold Release", () => {
        it("declining an offer revokes offer, releases BookingHold, re-queues candidate to #1 and emits events", async () => {
            const mockOffer = {
                id: "offer-1",
                organizationId: orgId,
                waitlistEntryId: entryId,
                bookingHoldId: "hold-1",
                token: "token_decline_123",
                status: "PENDING",
                startAt: new Date(),
                endAt: new Date(),
                serviceId,
                staffId,
                locationId,
            };
            mockPrisma.waitlistOffer.findUnique.mockResolvedValue(mockOffer);

            const result = await service.declineOffer("token_decline_123", "Time does not work", false);

            expect(result).toEqual({ success: true, message: "Offer declined. You remain on the priority waitlist for future openings." });
            // Verifies offer revoked
            expect(mockPrisma.waitlistOffer.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "offer-1" },
                    data: expect.objectContaining({ status: "REVOKED" }),
                }),
            );
            // Verifies hold released
            expect(mockPrisma.bookingHold.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "hold-1", status: "ACTIVE" },
                    data: { status: "RELEASED" },
                }),
            );
            // Verifies entry restored to ACTIVE
            expect(mockPrisma.waitlistEntry.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: entryId },
                    data: { status: "ACTIVE" },
                }),
            );
            // Verifies outbox event emitted
            expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        eventType: "waitlist.offer_declined",
                        aggregateType: "WaitlistOffer",
                        aggregateId: "offer-1",
                    }),
                }),
            );
            // Verifies realtime broadcast
            expect(mockRealtime.broadcastEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "waitlist.offer_revoked",
                    organizationId: orgId,
                }),
            );
        });

        it("cancels entry completely if customer chooses removeFromWaitlist: true", async () => {
            const mockOffer = {
                id: "offer-1",
                organizationId: orgId,
                waitlistEntryId: entryId,
                bookingHoldId: "hold-1",
                token: "token_decline_remove",
                status: "PENDING",
                startAt: new Date(),
                endAt: new Date(),
                serviceId,
                staffId,
                locationId,
            };
            mockPrisma.waitlistOffer.findUnique.mockResolvedValue(mockOffer);

            await service.declineOffer("token_decline_remove", "No longer interested", true);

            expect(mockPrisma.waitlistEntry.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: entryId },
                    data: { status: "CANCELLED" },
                }),
            );
        });

        it("throws NotFoundException if offer token is invalid or offer is not PENDING", async () => {
            mockPrisma.waitlistOffer.findFirst.mockResolvedValue(null);

            await expect(
                service.declineOffer("invalid_token"),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe("4. Calendar Visual Hold Blocks (/organizations/:orgId/waitlist/holds)", () => {
        it("returns active waitlist holds with countdown durations for the staff calendar", async () => {
            const futureStart = new Date(Date.now() + 3600 * 1000);
            const futureEnd = new Date(futureStart.getTime() + 45 * 60 * 1000);
            const expiresAt = new Date(Date.now() + 14 * 60 * 1000);

            const activeHoldOffer = {
                id: "offer-hold-1",
                bookingHoldId: "hold-1",
                startAt: futureStart,
                endAt: futureEnd,
                expiresAt,
                serviceId,
                staffId,
                locationId,
                waitlistEntryId: entryId,
                score: 95,
                waitlistEntry: baseEntry,
                service: baseEntry.service,
                staff: baseEntry.staff,
                location: baseEntry.location,
            };

            mockPrisma.waitlistOffer.findMany.mockResolvedValue([activeHoldOffer]);

            const holds = await service.getWaitlistHoldBlocks(
                orgId,
                new Date(Date.now() - 3600 * 1000).toISOString(),
                new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
            );

            expect(holds).toHaveLength(1);
            expect(holds[0].id).toBe("hold-1");
            expect(holds[0].offerId).toBe("offer-hold-1");
            expect(holds[0].customerName).toBe("Alice Smith");
            expect(holds[0].serviceName).toBe("Hair Styling");
            expect(holds[0].staffName).toBe("Elena Rostova");
            expect(holds[0].status).toBe("HELD");
        });
    });

    describe("5. Staff Revocation Protocol", () => {
        it("revokes offer, releases hold and re-queues candidate", async () => {
            const mockOffer = {
                id: "offer-1",
                organizationId: orgId,
                waitlistEntryId: entryId,
                bookingHoldId: "hold-1",
                status: "PENDING",
                startAt: new Date(),
                endAt: new Date(),
                expiresAt: new Date(),
                createdAt: new Date(),
                service: baseEntry.service,
                staff: baseEntry.staff,
                location: baseEntry.location,
            };
            mockPrisma.waitlistOffer.findFirst.mockResolvedValue(mockOffer);
            mockPrisma.waitlistOffer.update.mockResolvedValue(mockOffer);

            await service.revokeOffer(orgId, "offer-1");

            expect(mockPrisma.waitlistOffer.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "offer-1" },
                    data: expect.objectContaining({ status: "REVOKED" }),
                }),
            );
            expect(mockPrisma.bookingHold.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "hold-1", status: "ACTIVE" },
                    data: { status: "RELEASED" },
                }),
            );
            expect(mockPrisma.waitlistEntry.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: entryId },
                    data: { status: "ACTIVE" },
                }),
            );
        });
    });
});
