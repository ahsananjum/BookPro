import { HoldJanitorService } from "./hold-janitor.service";
import { WaitlistJanitorService } from "./waitlist-janitor.service";

describe("Worker Janitors Multi-Worker Concurrency Safety Suite", () => {
    let emittedOutboxEvents: any[];
    let mockPrisma: any;

    beforeEach(() => {
        emittedOutboxEvents = [];
    });

    describe("HoldJanitorService Concurrency", () => {
        it("should ensure only ONE worker claims expired hold and emits outbox event among 5 concurrent workers", async () => {
            const holdId = "hold-uuid-1";
            let holdStatus = "ACTIVE";

            // Simulating atomic database state with single-winner conditional update
            mockPrisma = {
                bookingHold: {
                    findMany: jest.fn().mockResolvedValue([
                        { id: holdId, organizationId: "org-1", status: "ACTIVE", expiresAt: new Date(Date.now() - 5000) }
                    ]),
                },
                $transaction: jest.fn().mockImplementation(async (callback) => {
                    const tx = {
                        bookingHold: {
                            updateMany: jest.fn().mockImplementation(({ where, data }) => {
                                if (where.id === holdId && where.status === "ACTIVE" && holdStatus === "ACTIVE") {
                                    holdStatus = data.status;
                                    return Promise.resolve({ count: 1 }); // Winner!
                                }
                                return Promise.resolve({ count: 0 }); // Loser (already expired by winning worker)
                            }),
                        },
                        outboxEvent: {
                            create: jest.fn().mockImplementation(({ data }) => {
                                emittedOutboxEvents.push(data);
                                return Promise.resolve({ id: "outbox-1", ...data });
                            }),
                        },
                    };
                    return callback(tx);
                }),
            };

            // Instantiate 5 concurrent worker janitor instances
            const workers = Array.from({ length: 5 }).map(() => new HoldJanitorService(mockPrisma));

            // Execute all 5 workers simultaneously against the same expired hold
            const results = await Promise.all(workers.map((w) => w.cleanupExpiredHolds()));

            // Exactly 1 worker should have cleaned up the hold
            const totalCleaned = results.reduce((sum, count) => sum + count, 0);
            expect(totalCleaned).toBe(1);

            // Exactly 1 outbox event should have been emitted
            expect(emittedOutboxEvents.length).toBe(1);
            expect(emittedOutboxEvents[0].eventType).toBe("booking_hold.expired");
            expect(emittedOutboxEvents[0].aggregateId).toBe(holdId);
        });
    });

    describe("WaitlistJanitorService Concurrency", () => {
        it("should ensure only ONE worker claims expired offer and entry among 5 concurrent workers", async () => {
            const offerId = "offer-uuid-1";
            let offerStatus = "PENDING";

            mockPrisma = {
                waitlistOffer: {
                    findMany: jest.fn().mockResolvedValue([
                        { id: offerId, waitlistEntryId: "entry-1", organizationId: "org-1" }
                    ]),
                },
                waitlistEntry: {
                    findMany: jest.fn().mockResolvedValue([]),
                },
                $transaction: jest.fn().mockImplementation(async (callback) => {
                    const tx = {
                        waitlistOffer: {
                            updateMany: jest.fn().mockImplementation(({ where, data }) => {
                                if (where.id === offerId && where.status === "PENDING" && offerStatus === "PENDING") {
                                    offerStatus = data.status;
                                    return Promise.resolve({ count: 1 });
                                }
                                return Promise.resolve({ count: 0 });
                            }),
                            count: jest.fn().mockResolvedValue(0),
                        },
                        waitlistEntry: {
                            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                        },
                        outboxEvent: {
                            create: jest.fn().mockImplementation(({ data }) => {
                                emittedOutboxEvents.push(data);
                                return Promise.resolve({ id: "outbox-1", ...data });
                            }),
                        },
                    };
                    return callback(tx);
                }),
            };

            const workers = Array.from({ length: 5 }).map(() => new WaitlistJanitorService(mockPrisma));
            const results = await Promise.all(workers.map((w) => w.cleanupExpiredWaitlist()));

            const totalOffersExpired = results.reduce((sum, r) => sum + r.expiredOffersCount, 0);
            expect(totalOffersExpired).toBe(1);
            expect(emittedOutboxEvents.length).toBe(1);
            expect(emittedOutboxEvents[0].eventType).toBe("waitlist.offer_expired");
        });
    });
});
