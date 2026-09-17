import { AppointmentService } from "./appointment.service";
import { AppointmentStatus } from "@prisma/client";

describe("AppointmentWaitlistIntegrationSpec - Automation & Overrides", () => {
    let service: AppointmentService;
    let mockPrisma: any;
    let mockScheduleGuard: any;
    let mockIdempotency: any;
    let mockOutbox: any;
    let mockAuthoritativeValidator: any;
    let mockScheduleInsightService: any;
    let mockRealtime: any;

    const orgId = "org-1";
    const locId = "loc-1";
    const staffId = "staff-1";
    const serviceId = "svc-1";
    const customerId = "cust-1";

    beforeEach(() => {
        mockPrisma = {
            customer: {
                findFirst: jest.fn().mockResolvedValue({ id: customerId, email: "cust@example.com", fullName: "Test Customer" }),
            },
            waitlistOffer: {
                findMany: jest.fn().mockResolvedValue([]),
                update: jest.fn(),
            },
            bookingHold: {
                updateMany: jest.fn(),
            },
            waitlistEntry: {
                update: jest.fn(),
            },
            outboxEvent: {
                create: jest.fn(),
            },
            appointment: {
                findFirst: jest.fn(),
                findMany: jest.fn().mockResolvedValue([]),
                update: jest.fn(),
            },
            $transaction: jest.fn(async (cb) => cb(mockPrisma)),
        };

        mockScheduleGuard = {
            createManualAppointment: jest.fn().mockResolvedValue({
                appointment: {
                    id: "appt-manual-1",
                    organizationId: orgId,
                    locationId: locId,
                    staffId,
                    serviceId,
                    customerId,
                    status: "CONFIRMED",
                },
            }),
        };

        mockIdempotency = {
            executeIdempotent: jest.fn(async (opts, fn) => fn()),
        };

        mockOutbox = {
            createEvent: jest.fn(),
        };

        mockAuthoritativeValidator = {
            validateAndReserveSlot: jest.fn().mockResolvedValue({
                appointment: {
                    id: "appt-manual-1",
                    organizationId: orgId,
                    locationId: locId,
                    staffId,
                    serviceId,
                    customerId,
                    status: "CONFIRMED",
                },
            }),
            validateSlotForWrite: jest.fn().mockResolvedValue({ isValid: true }),
        };

        mockScheduleInsightService = {
            processSlotOpening: jest.fn().mockResolvedValue({ offerDispatched: true }),
        };

        mockRealtime = {
            broadcastEvent: jest.fn().mockResolvedValue(undefined),
        };

        service = new AppointmentService(
            mockPrisma,
            mockScheduleGuard,
            mockIdempotency,
            mockOutbox,
            mockAuthoritativeValidator,
            undefined, // commissionsService
            undefined, // policyService
            undefined, // refundsService
            undefined, // paymentsService
            mockRealtime,
            undefined, // redisService
            mockScheduleInsightService,
        );
    });

    describe("1. Staff Calendar Manual Override Protocol", () => {
        it("releases BookingHold, revokes offer, and restores customer #1 when staff overrides slot", async () => {
            const startAt = new Date(Date.now() + 3600 * 1000);
            const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

            const heldOffer = {
                id: "offer-held-1",
                bookingHoldId: "hold-uuid-1",
                waitlistEntryId: "entry-1",
                organizationId: orgId,
                status: "PENDING",
                waitlistEntry: {
                    id: "entry-1",
                    customerId: "cust-waitlist",
                    customer: { fullName: "Waitlist Customer", email: "waitlist@example.com" },
                },
            };

            mockPrisma.waitlistOffer.findMany.mockResolvedValue([heldOffer]);

            await service.createManualAppointment({
                organizationId: orgId,
                locationId: locId,
                serviceId,
                staffId,
                customerId,
                startAt: startAt.toISOString(),
                endAt: endAt.toISOString(),
                overrideReason: "Staff calendar manual override",
                createdById: "staff-user-1",
            });

            // 1. Offer revoked
            expect(mockPrisma.waitlistOffer.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "offer-held-1" },
                    data: expect.objectContaining({ status: "REVOKED" }),
                }),
            );

            // 2. BookingHold released
            expect(mockPrisma.bookingHold.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "hold-uuid-1", status: "ACTIVE" },
                    data: { status: "RELEASED" },
                }),
            );

            // 3. WaitlistEntry preserved in ACTIVE status (seniority intact)
            expect(mockPrisma.waitlistEntry.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "entry-1" },
                    data: { status: "ACTIVE" },
                }),
            );

            // 4. Outbox notification created
            expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        eventType: "waitlist.offer_revoked_by_staff_override",
                        aggregateId: "offer-held-1",
                    }),
                }),
            );
        });
    });

    describe("2. No-Show Emergency Recovery Trigger", () => {
        it("triggers processSlotOpening when an appointment is transitioned to NO_SHOW", async () => {
            const fiveMinAgo = new Date(Date.now() - 6 * 60 * 1000);
            const apptNoShow = {
                id: "appt-no-show-1",
                organizationId: orgId,
                locationId: locId,
                staffId,
                serviceId,
                startAt: fiveMinAgo,
                endAt: new Date(fiveMinAgo.getTime() + 60 * 60 * 1000),
                status: AppointmentStatus.CONFIRMED,
            };

            mockPrisma.appointment.findMany
                .mockResolvedValueOnce([]) // checked_in for auto-start
                .mockResolvedValueOnce([]) // in_progress for auto-complete
                .mockResolvedValueOnce([apptNoShow]); // confirmed for auto-no-show

            // Mock transitionStatus internals
            jest.spyOn(service, "transitionStatus").mockResolvedValue({
                ...apptNoShow,
                status: AppointmentStatus.NO_SHOW,
            } as any);

            const result = await service.autoProgressLifecycleStates();

            expect(result.autoNoShow).toBe(1);
            expect(mockScheduleInsightService.processSlotOpening).toHaveBeenCalledWith(
                orgId,
                locId,
                staffId,
                apptNoShow.startAt,
                apptNoShow.endAt,
                serviceId,
            );
        });
    });
});
