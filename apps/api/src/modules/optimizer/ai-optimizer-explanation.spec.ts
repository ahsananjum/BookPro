import { AIOptimizerExplanationService } from "./ai-optimizer-explanation.service";

describe("AIOptimizerExplanationService", () => {
    let service: AIOptimizerExplanationService;
    let mockGeminiAdapter: any;

    beforeEach(() => {
        mockGeminiAdapter = {
            isConfigured: jest.fn(),
            generate: jest.fn(),
        };
        service = new AIOptimizerExplanationService(mockGeminiAdapter);
    });

    const baseFacts = {
        locationName: "Downtown Flagship",
        staffName: "Sarah Jenkins",
        serviceName: "Signature Balayage",
        gapDurationMin: 90,
        startAt: new Date("2026-09-02T14:00:00.000Z"),
        endAt: new Date("2026-09-02T15:30:00.000Z"),
        potentialRevenueCents: 15000,
        topMatches: [
            {
                waitlistEntryId: "entry-1",
                customerId: "cust-1",
                customerName: "Jessica Alba",
                serviceId: "svc-1",
                serviceName: "Signature Balayage",
                serviceDurationMin: 90,
                priceCents: 15000,
                totalScore: 95,
                breakdown: {
                    timeFit: 25,
                    preferredStaffFit: 20,
                    locationFit: 15,
                    serviceExactMatch: 15,
                    waitlistAge: 10,
                    businessPriority: 10,
                },
                formulaVersion: "v1.0.0",
                reasoning: ["Direct staff match (+20)", "Waitlist senior (+10)"],
            },
        ],
    };

    it("generates structured template fallback when AI provider is not configured", async () => {
        mockGeminiAdapter.isConfigured.mockReturnValue(false);

        const explanation = await service.generateExplanation(baseFacts);
        expect(explanation).toContain("Sarah Jenkins has a 90-minute opening");
        expect(explanation).toContain("1 waitlisted customer");
        expect(explanation).toContain("$150.00");
    });

    it("uses Gemini AI generated narrative when provider is configured and available", async () => {
        mockGeminiAdapter.isConfigured.mockReturnValue(true);
        mockGeminiAdapter.generate.mockResolvedValue({
            text: "Sarah Jenkins has a 90-min gap. Offering this to top match Jessica Alba will recover $150.",
        });

        const explanation = await service.generateExplanation(baseFacts);
        expect(explanation).toBe("Sarah Jenkins has a 90-min gap. Offering this to top match Jessica Alba will recover $150.");
        expect(mockGeminiAdapter.generate).toHaveBeenCalledTimes(1);
    });

    it("gracefully falls back to template if Gemini API errors or times out", async () => {
        mockGeminiAdapter.isConfigured.mockReturnValue(true);
        mockGeminiAdapter.generate.mockRejectedValue(new Error("Gemini quota exceeded"));

        const explanation = await service.generateExplanation(baseFacts);
        expect(explanation).toContain("Sarah Jenkins has a 90-minute opening");
        expect(explanation).toContain("$150.00");
    });

    it("proves AI explanation does not modify candidate score or ordering", async () => {
        mockGeminiAdapter.isConfigured.mockReturnValue(true);
        mockGeminiAdapter.generate.mockResolvedValue({
            text: "AI generated explanation",
        });

        const originalScore = baseFacts.topMatches[0].totalScore;
        await service.generateExplanation(baseFacts);

        // Invariant check: candidate score remains strictly intact
        expect(baseFacts.topMatches[0].totalScore).toBe(originalScore);
        expect(baseFacts.topMatches[0].formulaVersion).toBe("v1.0.0");
    });
});
