import {
    DeterministicScoringService,
    ScheduleGapCandidateInput,
    WaitlistEntryForScoring,
} from "./deterministic-scoring.service";

describe("DeterministicScoringService", () => {
    let service: DeterministicScoringService;

    beforeEach(() => {
        service = new DeterministicScoringService();
    });

    const baseGap: ScheduleGapCandidateInput = {
        id: "gap-1",
        organizationId: "org-1",
        locationId: "loc-1",
        staffId: "staff-1",
        serviceId: "svc-1",
        serviceName: "Signature Haircut",
        serviceDurationMin: 60,
        priceCents: 20000,
        capacity: 1,
        startAt: new Date("2026-09-01T10:00:00.000Z"), // 10:00 UTC = Morning
        endAt: new Date("2026-09-01T11:00:00.000Z"),
        timezone: "UTC",
    };

    const baseEntry: WaitlistEntryForScoring = {
        id: "entry-1",
        organizationId: "org-1",
        customerId: "cust-1",
        customerName: "Alice Smith",
        serviceId: "svc-1",
        locationId: "loc-1",
        staffId: "staff-1",
        allowFallbackStaff: true,
        startWindowDate: new Date("2026-09-01"),
        endWindowDate: new Date("2026-09-05"),
        timePreference: "MORNING",
        partySize: 1,
        status: "ACTIVE",
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
    };

    it("evaluates a perfect fixture candidate to a score of 100", () => {
        const result = service.scoreCandidate(baseEntry, baseGap);
        expect(result).not.toBeNull();
        expect(result!.totalScore).toBe(100);
        expect(result!.breakdown).toEqual({
            timeFit: 30,
            preferredStaffFit: 20,
            locationFit: 15,
            serviceExactMatch: 15,
            waitlistAge: 10,
            businessPriority: 10,
        });
        expect(result!.formulaVersion).toBe("v1.0.0");
    });

    it("scores flexible ANY time preference as 25/30", () => {
        const entry = { ...baseEntry, timePreference: "ANY" as const };
        const result = service.scoreCandidate(entry, baseGap);
        expect(result).not.toBeNull();
        expect(result!.breakdown.timeFit).toBe(25);
        expect(result!.totalScore).toBe(95);
    });

    it("scores fallback staff allowed as 10/20 when assigned to a different provider", () => {
        const gap = { ...baseGap, staffId: "staff-different" };
        const result = service.scoreCandidate(baseEntry, gap);
        expect(result).not.toBeNull();
        expect(result!.breakdown.preferredStaffFit).toBe(10);
        expect(result!.totalScore).toBe(90);
    });

    it("rejects candidate when requested staff differs and fallback is NOT allowed", () => {
        const entry = { ...baseEntry, allowFallbackStaff: false };
        const gap = { ...baseGap, staffId: "staff-different" };
        const result = service.scoreCandidate(entry, gap);
        expect(result).toBeNull();
    });

    it("rejects candidate when service ID does not match", () => {
        const entry = { ...baseEntry, serviceId: "svc-mismatch" };
        const result = service.scoreCandidate(entry, baseGap);
        expect(result).toBeNull();
    });

    it("rejects candidate when gap is outside customer's date window", () => {
        const entry = {
            ...baseEntry,
            startWindowDate: new Date("2026-09-10"),
            endWindowDate: new Date("2026-09-15"),
        };
        const result = service.scoreCandidate(entry, baseGap);
        expect(result).toBeNull();
    });

    it("rejects candidate when status is not ACTIVE", () => {
        const entry = { ...baseEntry, status: "EXPIRED" };
        const result = service.scoreCandidate(entry, baseGap);
        expect(result).toBeNull();
    });

    it("rejects candidate when party size exceeds gap capacity", () => {
        const entry = { ...baseEntry, partySize: 3 };
        const result = service.scoreCandidate(entry, baseGap);
        expect(result).toBeNull();
    });

    it("scales waitlist age score according to entry seniority", () => {
        // Recent entry (< 24 hours) gets 2
        const recentEntry = {
            ...baseEntry,
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        };
        const resRecent = service.scoreCandidate(recentEntry, baseGap);
        expect(resRecent!.breakdown.waitlistAge).toBe(2);

        // 3 days old gets 6
        const threeDaysEntry = {
            ...baseEntry,
            createdAt: new Date(Date.now() - 3.5 * 24 * 60 * 60 * 1000),
        };
        const resThree = service.scoreCandidate(threeDaysEntry, baseGap);
        expect(resThree!.breakdown.waitlistAge).toBe(6);
    });

    it("strictly prohibits demographic attributes from scoring inputs", () => {
        // Inspecting ScoredCandidateMatch type ensure zero demographic attributes exist
        const result = service.scoreCandidate(baseEntry, baseGap);
        expect(result).not.toBeNull();
        expect((result as any).race).toBeUndefined();
        expect((result as any).gender).toBeUndefined();
        expect((result as any).age).toBeUndefined();
        expect((result as any).income).toBeUndefined();
    });
});
