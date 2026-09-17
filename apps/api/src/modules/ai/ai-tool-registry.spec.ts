const TEST_SECRET = "test-proposal-secret-at-least-32-characters";
process.env.AI_PROPOSAL_SECRET = TEST_SECRET;
process.env.JWT_SECRET = TEST_SECRET;

import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ActorType, PermissionKey } from "@bookpro/contracts";
import { createHash, createHmac } from "crypto";
import { AIToolRegistryService, TrustedAIContext } from "./ai-tool-registry.service";

function makePrisma() {
    return {
        aIToolExecution: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: "exec-1" }),
            update: jest.fn().mockResolvedValue({}),
        },
        aIActionProposal: {
            create: jest.fn().mockResolvedValue({}),
            findFirst: jest.fn(),
            update: jest.fn().mockResolvedValue({}),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        organization: {
            findUnique: jest.fn().mockResolvedValue({
                id: "11111111-1111-4111-8111-111111111111",
                name: "Grand Salon",
                brandName: "Grand Salon & Spa",
                slug: "grand-salon",
                industry: "Beauty & Wellness",
                timezone: "America/New_York",
                currency: "USD",
                phone: "+1234567890",
                email: "contact@grandsalon.com",
                website: "https://grandsalon.com",
                locations: [{
                    id: "55555555-5555-4555-8555-555555555555",
                    name: "Downtown",
                    address: "123 Main St",
                    city: "New York",
                    state: "NY",
                    postalCode: "10001",
                    phone: "+1234567890",
                    email: "downtown@grandsalon.com",
                    timezone: "America/New_York",
                    operatingHours: null,
                }],
            }),
        },
        customer: {
            findFirst: jest.fn().mockResolvedValue({
                id: "22222222-2222-4222-8222-222222222222",
                fullName: "Jane Doe",
                email: "jane@example.com",
                phone: "+15551234567",
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
            }),
        },
        user: {
            findUnique: jest.fn().mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333", email: "jane@example.com" }),
        },
        appointment: {
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(1),
        },
        bookingHold: {
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
        },
        waitlistEntry: {
            findFirst: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(1),
            update: jest.fn().mockResolvedValue({ id: "wait-1", status: "CANCELLED" }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn().mockImplementation(async (ops: any[]) => Promise.all(ops)),
    } as any;
}

function makeDependencies() {
    return {
        services: { getServices: jest.fn().mockResolvedValue([]), getServiceById: jest.fn().mockResolvedValue({ id: "66666666-6666-4666-8666-666666666666", name: "Cut" }) },
        availability: { searchAvailability: jest.fn(), validateAvailability: jest.fn() },
        appointments: { getAppointmentDetail: jest.fn(), reschedule: jest.fn(), cancel: jest.fn(), convertHoldToAppointment: jest.fn() },
        holds: { getHold: jest.fn(), createHold: jest.fn() },
        pricing: { calculateQuote: jest.fn() },
        policies: {
            getCancellationQuote: jest.fn(),
            resolvePolicy: jest.fn().mockResolvedValue({
                minNoticeHours: 24,
                maxNoticeDays: 60,
                cancelCutoffHours: 24,
                cancelFeeType: "PERCENTAGE",
                cancelFeeValue: 50,
                rescheduleCutoffHours: 12,
                holdDurationMinutes: 10,
                waitlistOfferExpiryMinutes: 60,
            }),
        },
        waitlist: { joinWaitlist: jest.fn() },
        payments: { createPaymentIntent: jest.fn() },
        locations: { getLocationById: jest.fn().mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555", name: "Main Location" }) },
        staff: { getStaffById: jest.fn().mockResolvedValue({ id: "77777777-7777-4777-8777-777777777777", displayName: "Elena" }) },
    } as any;
}

function context(overrides: Partial<TrustedAIContext> = {}): TrustedAIContext {
    return {
        organizationId: "11111111-1111-4111-8111-111111111111",
        participantId: "22222222-2222-4222-8222-222222222222",
        customerId: "22222222-2222-4222-8222-222222222222",
        actorType: ActorType.CUSTOMER,
        subjectId: "33333333-3333-4333-8333-333333333333",
        permissions: [],
        correlationId: "corr-test",
        ...overrides,
    };
}

function registry(prisma = makePrisma(), deps = makeDependencies()) {
    return { prisma, deps, service: new AIToolRegistryService(prisma, deps.services, deps.availability, deps.appointments, deps.holds, deps.pricing, deps.policies, deps.waitlist, deps.payments, deps.locations, deps.staff) };
}

describe("AIToolRegistryService boundaries", () => {
    beforeEach(() => {
        process.env.AI_PROPOSAL_SECRET = TEST_SECRET;
        process.env.JWT_SECRET = TEST_SECRET;
    });

    it("rejects malformed and tenant-injected tool arguments before execution", async () => {
        const { service, prisma } = registry();
        await expect(service.execute("44444444-4444-4444-8444-444444444444", "findAvailability", { organizationId: "attacker", serviceId: "bad" }, context(), "request-1234")).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.aIToolExecution.create).not.toHaveBeenCalled();
    });

    it("rejects unregistered prompt-injected tools", async () => {
        const { service } = registry();
        await expect(service.execute("44444444-4444-4444-8444-444444444444", "executeSql", { sql: "select *" }, context(), "request-1234")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("returns only AvailabilityModule slots and never invents one", async () => {
        const { service, deps } = registry();
        deps.availability.searchAvailability.mockResolvedValue({ organizationId: context().organizationId, locationId: "55555555-5555-4555-8555-555555555555", serviceId: "66666666-6666-4666-8666-666666666666", presentationTimezone: "UTC", startDate: "2026-09-01", endDate: "2026-09-01", totalAvailableSlots: 0, slots: [] });
        const output = await service.execute("44444444-4444-4444-8444-444444444444", "findAvailability", { serviceId: "66666666-6666-4666-8666-666666666666", locationId: "55555555-5555-4555-8555-555555555555", startDate: "2026-09-01", endDate: "2026-09-01" }, context(), "request-1234");
        expect((output.result.slots as unknown[]).length).toBe(0);
    });

    it("hides another customer's booking behind a not-found response", async () => {
        const { service, deps } = registry();
        deps.appointments.getAppointmentDetail.mockResolvedValue({ customerId: "77777777-7777-4777-8777-777777777777", locationId: "55555555-5555-4555-8555-555555555555" });
        await expect(service.execute("44444444-4444-4444-8444-444444444444", "getBooking", { bookingId: "88888888-8888-4888-8888-888888888888" }, context(), "request-1234")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("places PricingService's authoritative quote in the confirmation proposal", async () => {
        const { service, deps } = registry();
        deps.services.getServiceById.mockResolvedValue({ id: "66666666-6666-4666-8666-666666666666", name: "Cut" });
        deps.pricing.calculateQuote.mockResolvedValue({ totalCents: 12345, currency: "USD", depositRequiredCents: 0, finalTotalCents: 12345 });
        deps.availability.validateAvailability.mockResolvedValue({ isAvailable: true, startTime: "2026-09-01T10:00:00.000Z", endTime: "2026-09-01T11:00:00.000Z" });
        const output = await service.execute("44444444-4444-4444-8444-444444444444", "createBookingHold", { serviceId: "66666666-6666-4666-8666-666666666666", locationId: "55555555-5555-4555-8555-555555555555", startAt: "2026-09-01T10:00:00.000Z", endAt: "2026-09-01T11:00:00.000Z" }, context(), "request-1234");
        expect((output.card.data.price as any).totalCents).toBe(12345);
        expect(output.card.kind).toBe("CONFIRMATION");
    });

    it("rejects a stale proposal even when its signed confirmation token is valid", async () => {
        const prisma = makePrisma();
        const { service } = registry(prisma);
        const proposalId = "99999999-9999-4999-8999-999999999999";
        const tokenExpiry = Date.now() + 60_000;
        const payload = `${proposalId}.${context().participantId}.${tokenExpiry}`;
        const token = `${payload}.${createHmac("sha256", TEST_SECRET).update(payload).digest("base64url")}`;
        prisma.aIActionProposal.findFirst.mockResolvedValue({ id: proposalId, conversationId: "44444444-4444-4444-8444-444444444444", organizationId: context().organizationId, participantId: context().participantId, status: "PENDING", expiresAt: new Date(Date.now() - 1), confirmationHash: createHash("sha256").update(token).digest("hex") });
        await expect(service.confirmProposal("44444444-4444-4444-8444-444444444444", proposalId, token, "request-1234", context())).rejects.toBeInstanceOf(ConflictException);
    });

    it("returns a persisted result for duplicate conversational retries", async () => {
        const prisma = makePrisma();
        prisma.aIToolExecution.findFirst.mockResolvedValue({ status: "SUCCEEDED", sideEffect: false, sanitizedResult: { result: { services: [] }, card: { kind: "TOOL_RESULT", toolName: "getServices", title: "Services", data: { services: [] } } } });
        const { service, deps } = registry(prisma);
        const output = await service.execute("44444444-4444-4444-8444-444444444444", "getServices", {}, context({ actorType: ActorType.STAFF, permissions: [PermissionKey.SERVICE_READ] }), "request-1234");
        expect(output.result).toEqual({ services: [] });
        expect(deps.services.getServices).not.toHaveBeenCalled();
    });

    it("recovers a successful hold with the same domain idempotency key after response persistence fails", async () => {
        const prisma = makePrisma();
        const deps = makeDependencies();
        const { service } = registry(prisma, deps);
        const proposalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
        const tokenExpiry = Date.now() + 60_000;
        const payload = `${proposalId}.${context().participantId}.${tokenExpiry}`;
        const token = `${payload}.${createHmac("sha256", TEST_SECRET).update(payload).digest("base64url")}`;
        const args = { serviceId: "66666666-6666-4666-8666-666666666666", locationId: "55555555-5555-4555-8555-555555555555", startAt: "2026-09-01T10:00:00.000Z", endAt: "2026-09-01T11:00:00.000Z", partySize: 1 };
        const proposal = { id: proposalId, conversationId: "44444444-4444-4444-8444-444444444444", organizationId: context().organizationId, participantId: context().participantId, actionType: "createBookingHold", status: "PENDING", expiresAt: new Date(tokenExpiry), confirmationHash: createHash("sha256").update(token).digest("hex"), executionArgs: args, authoritativeData: { price: { quoteVersion: "quote-1" } } };
        prisma.aIActionProposal.findFirst.mockResolvedValue(proposal);
        prisma.$transaction.mockRejectedValueOnce(new Error("response stream/persistence failed")).mockResolvedValueOnce([]);
        deps.availability.validateAvailability.mockResolvedValue({ isAvailable: true, endTime: args.endAt });
        deps.pricing.calculateQuote.mockResolvedValue({ quoteVersion: "quote-1" });
        deps.holds.createHold.mockResolvedValue({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", status: "ACTIVE", expiresAt: new Date(tokenExpiry), quoteSnapshot: { quoteVersion: "quote-1" } });

        await expect(service.confirmProposal(proposal.conversationId, proposalId, token, "client-attempt-1", context())).rejects.toThrow("response stream/persistence failed");
        const recovered = await service.confirmProposal(proposal.conversationId, proposalId, token, "client-attempt-2", context());

        expect(recovered.result.holdId).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
        expect(deps.holds.createHold.mock.calls[0][0].idempotencyKey).toBe(deps.holds.createHold.mock.calls[1][0].idempotencyKey);
    });

    it("returns authoritative organization profile with sanitized locations", async () => {
        const prisma = makePrisma();
        const { service } = registry(prisma);
        const output = await service.execute("44444444-4444-4444-8444-444444444444", "getOrganizationInfo", {}, context(), "request-org-info");

        expect(output.result.name).toBe("Grand Salon");
        expect(output.result.brandName).toBe("Grand Salon & Spa");
        expect(output.result.slug).toBe("grand-salon");
        expect(output.card.kind).toBe("TOOL_RESULT");
        expect(Array.isArray((output.result as any).locations)).toBe(true);
        expect((output.result as any).locations[0].name).toBe("Downtown");
    });

    it("returns customer's upcoming appointments and strictly avoids leaking internal notes", async () => {
        const prisma = makePrisma();
        prisma.appointment.findMany.mockResolvedValue([
            {
                id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
                status: "CONFIRMED",
                paymentStatus: "PAID",
                priceCents: 8500,
                currency: "USD",
                startAt: new Date("2026-09-10T14:00:00.000Z"),
                endAt: new Date("2026-09-10T15:00:00.000Z"),
                partySize: 1,
                service: { id: "s-1", name: "Balayage", durationMin: 60 },
                staff: { id: "st-1", displayName: "Elena Rostova" },
                location: { id: "loc-1", name: "SoHo Flagship", address: "100 Broadway", city: "New York", timezone: "America/New_York" },
                internalNotes: "VIP client - do not double book",
                operationalNotes: "Secret formula: 7N + 8G",
            },
        ]);

        const { service } = registry(prisma);
        const output = await service.execute(
            "44444444-4444-4444-8444-444444444444",
            "getMyUpcomingAppointments",
            { status: "UPCOMING", limit: 5 },
            context(),
            "request-my-appointments"
        );

        expect(output.card.kind).toBe("APPOINTMENT_LIST");
        const appts = (output.result as any).appointments;
        expect(appts.length).toBe(1);
        expect(appts[0].serviceName).toBe("Balayage");
        expect(appts[0].staffDisplayName).toBe("Elena Rostova");
        expect(appts[0].internalNotes).toBeUndefined();
        expect(appts[0].operationalNotes).toBeUndefined();
    });

    it("aggregates customer account overview with live counts", async () => {
        const prisma = makePrisma();
        prisma.appointment.count.mockResolvedValue(2);
        prisma.bookingHold.count.mockResolvedValue(1);
        prisma.waitlistEntry.count.mockResolvedValue(1);

        const { service } = registry(prisma);
        const output = await service.execute("44444444-4444-4444-8444-444444444444", "getMyAccountSummary", {}, context(), "request-account-summary");

        expect(output.card.kind).toBe("ACCOUNT_SUMMARY");
        expect((output.result as any).fullName).toBe("Jane Doe");
        expect((output.result as any).upcomingAppointmentsCount).toBe(2);
        expect((output.result as any).activeHoldsCount).toBe(1);
        expect((output.result as any).activeWaitlistCount).toBe(1);
    });

    it("resolves authoritative organization policies via PolicyService", async () => {
        const prisma = makePrisma();
        const deps = makeDependencies();
        const { service } = registry(prisma, deps);

        const output = await service.execute(
            "44444444-4444-4444-8444-444444444444",
            "getOrganizationPolicies",
            {},
            context(),
            "request-policies"
        );

        expect(output.card.kind).toBe("POLICY_SUMMARY");
        expect((output.result as any).cancelCutoffHours).toBe(24);
        expect((output.result as any).holdDurationMinutes).toBe(10);
        expect(deps.policies.resolvePolicy).toHaveBeenCalledWith(context().organizationId, undefined, undefined);
    });

    it("creates a leaveWaitlist proposal and executes cancellation upon confirmation", async () => {
        const prisma = makePrisma();
        const waitlistEntryId = "66666666-6666-4666-8666-666666666666";
        prisma.waitlistEntry.findFirst.mockResolvedValue({
            id: waitlistEntryId,
            organizationId: context().organizationId,
            customerId: context().customerId,
            status: "ACTIVE",
            service: { name: "Balayage" },
        });

        const { service } = registry(prisma);
        const proposalResult = await service.execute(
            "44444444-4444-4444-8444-444444444444",
            "leaveWaitlist",
            { waitlistEntryId, reason: "Schedule changed" },
            context(),
            "request-leave-waitlist"
        );

        expect(proposalResult.card.kind).toBe("CONFIRMATION");
        expect(proposalResult.card.toolName).toBe("leaveWaitlist");
        const token = proposalResult.card.confirmationToken!;
        const proposalId = proposalResult.card.proposalId!;

        prisma.aIActionProposal.findFirst.mockResolvedValue({
            id: proposalId,
            conversationId: "44444444-4444-4444-8444-444444444444",
            organizationId: context().organizationId,
            participantId: context().participantId,
            actionType: "leaveWaitlist",
            status: "PENDING",
            expiresAt: new Date(Date.now() + 60_000),
            confirmationHash: createHash("sha256").update(token).digest("hex"),
            executionArgs: { waitlistEntryId, reason: "Schedule changed" },
            authoritativeData: proposalResult.result.authoritativeData,
        });

        const confirmResult = await service.confirmProposal(
            "44444444-4444-4444-8444-444444444444",
            proposalId,
            token,
            "confirm-leave-waitlist",
            context()
        );

        expect(confirmResult.card.kind).toBe("CANONICAL_REFETCH");
        expect(prisma.waitlistEntry.update).toHaveBeenCalledWith({
            where: { id: waitlistEntryId },
            data: { status: "CANCELLED" },
        });
    });

    it("releases a booking hold immediately and returns HOLD_RELEASED card", async () => {
        const { service, deps } = registry();
        const holdId = "12121212-1212-4212-8212-121212121212";
        deps.holds.cancelHold = jest.fn().mockResolvedValue({ id: holdId, status: "CANCELLED" });

        const output = await service.execute(
            "44444444-4444-4444-8444-444444444444",
            "releaseBookingHold",
            { holdId, reason: "Customer decided not to proceed" },
            context(),
            "request-release-hold"
        );

        expect(output.card.kind).toBe("HOLD_RELEASED");
        expect(output.result.released).toBe(true);
        expect(deps.holds.cancelHold).toHaveBeenCalledWith(holdId, context().organizationId);
    });

    it("handles 'tomorrow' as a relative date in findAvailability", async () => {
        const { service, deps } = registry();
        deps.availability.searchAvailability.mockResolvedValue({
            organizationId: context().organizationId,
            locationId: "55555555-5555-4555-8555-555555555555",
            serviceId: "66666666-6666-4666-8666-666666666666",
            presentationTimezone: "UTC",
            startDate: "2026-09-02",
            endDate: "2026-09-04",
            totalAvailableSlots: 2,
            slots: [
                { startTime: "2026-09-02T10:00:00.000Z", endTime: "2026-09-02T11:00:00.000Z", isAvailable: true },
            ],
        });

        const output = await service.execute(
            "44444444-4444-4444-8444-444444444444",
            "findAvailability",
            { serviceId: "66666666-6666-4666-8666-666666666666", startDate: "tomorrow" },
            context(),
            "request-find-tomorrow"
        );

        expect(output.card.kind).toBe("AVAILABILITY_SLOTS");
        expect(deps.availability.searchAvailability).toHaveBeenCalled();
    });

    it("confirms zero-deposit booking with BOOKING_RECEIPT card", async () => {
        const { service, deps } = registry();
        const holdId = "12121212-1212-4212-8212-121212121212";
        const appointmentId = "34343434-3434-4434-8434-343434343434";

        deps.holds.getHold.mockResolvedValue({
            id: holdId,
            status: "ACTIVE",
            serviceId: "66666666-6666-4666-8666-666666666666",
            locationId: "55555555-5555-4555-8555-555555555555",
            customerId: context().customerId,
            startAt: new Date("2026-09-02T10:00:00.000Z"),
            endAt: new Date("2026-09-02T11:00:00.000Z"),
            expiresAt: new Date(Date.now() + 600_000),
            quoteSnapshot: { priceCents: 5000, payableNowCents: 0, currency: "USD" },
        });

        deps.appointments.convertHoldToAppointment.mockResolvedValue({
            id: appointmentId,
            status: "CONFIRMED",
            paymentStatus: "NOT_REQUIRED",
        });

        deps.appointments.getAppointmentDetail.mockResolvedValue({
            id: appointmentId,
            status: "CONFIRMED",
            paymentStatus: "NOT_REQUIRED",
            priceCents: 5000,
            currency: "USD",
            startAt: new Date("2026-09-02T10:00:00.000Z"),
            endAt: new Date("2026-09-02T11:00:00.000Z"),
            service: { name: "Haircut", durationMin: 60 },
            location: { name: "Main Salon", address: "123 Main St", city: "Lahore" },
            staff: { displayName: "Sarah" },
            customer: { email: "customer@example.com" },
        });

        const proposalResult = await service.execute(
            "44444444-4444-4444-8444-444444444444",
            "confirmBooking",
            { holdId },
            context(),
            "request-confirm-proposal"
        );

        expect(proposalResult.card.kind).toBe("CONFIRMATION");
        const token = proposalResult.card.confirmationToken!;
        const proposalId = proposalResult.card.proposalId!;

        const prisma = makePrisma();
        prisma.aIActionProposal.findFirst.mockResolvedValue({
            id: proposalId,
            conversationId: "44444444-4444-4444-8444-444444444444",
            organizationId: context().organizationId,
            participantId: context().participantId,
            actionType: "confirmBooking",
            status: "PENDING",
            expiresAt: new Date(Date.now() + 60_000),
            confirmationHash: createHash("sha256").update(token).digest("hex"),
            executionArgs: { holdId },
            authoritativeData: proposalResult.result.authoritativeData,
        });

        const registryWithPrisma = registry(prisma, deps);
        const confirmResult = await registryWithPrisma.service.confirmProposal(
            "44444444-4444-4444-8444-444444444444",
            proposalId,
            token,
            "confirm-booking-execution",
            context()
        );

        expect(confirmResult.card.kind).toBe("BOOKING_RECEIPT");
        expect(confirmResult.card.data.referenceCode).toMatch(/^BK-/);
        expect(confirmResult.card.data.status).toBe("CONFIRMED");
    });
});
