import { Injectable, Logger } from "@nestjs/common";
import { GeminiAIAdapter } from "../ai/gemini-ai.adapter";
import { ScoredCandidateMatch } from "@bookpro/contracts";

export interface ExplanationFactsInput {
    locationName: string;
    staffName?: string | null;
    serviceName: string;
    gapDurationMin: number;
    startAt: Date;
    endAt: Date;
    potentialRevenueCents: number;
    topMatches: ScoredCandidateMatch[];
}

@Injectable()
export class AIOptimizerExplanationService {
    private readonly logger = new Logger(AIOptimizerExplanationService.name);

    constructor(private readonly geminiAdapter: GeminiAIAdapter) {}

    /**
     * Generates a concise manager-friendly explanation for a schedule insight.
     * Uses Gemini AI with deterministic template fallback if AI is offline, disabled, or fails.
     */
    async generateExplanation(facts: ExplanationFactsInput): Promise<string> {
        // Build deterministic fallback template first
        const formattedPrice = (facts.potentialRevenueCents / 100).toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
        });
        const staffProse = facts.staffName ? `${facts.staffName}` : "An open schedule";
        const dateStr = facts.startAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        const timeStr = facts.startAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        const matchCount = facts.topMatches.length;

        const fallback = `${staffProse} has a ${facts.gapDurationMin}-minute opening on ${dateStr} at ${timeStr} (${facts.locationName}). ${
            matchCount > 0
                ? `${matchCount} waitlisted customer${matchCount > 1 ? "s" : ""} match this opening with high confidence. Filling this slot could recover ${formattedPrice}.`
                : `No active waitlist entries currently match this opening.`
        }`;

        if (!this.geminiAdapter.isConfigured() || matchCount === 0) {
            return fallback;
        }

        try {
            const prompt = `You are BookPro's Schedule Optimizer AI. Generate a concise, professional, 2-sentence manager recommendation based strictly on these deterministic facts:
- Location: ${facts.locationName}
- Staff: ${facts.staffName || "Unassigned"}
- Service: ${facts.serviceName}
- Gap Duration: ${facts.gapDurationMin} minutes
- Date & Time: ${dateStr} at ${timeStr}
- Potential Revenue: ${formattedPrice}
- Qualified Waitlist Candidates: ${matchCount}
- Top Candidate: ${facts.topMatches[0]?.customerName} (Score: ${facts.topMatches[0]?.totalScore}/100, Reason: ${facts.topMatches[0]?.reasoning.slice(0, 2).join("; ")})

Rules:
- Strictly factual, no fabrication.
- Explain why filling this gap is operationally beneficial.
- Keep it under 40 words.`;

            const response = await this.geminiAdapter.generate({
                systemInstruction: "You are BookPro's schedule optimization intelligence assistant.",
                messages: [{ role: "user", parts: [{ text: prompt }] }],
                tools: [],
                correlationId: `opt_${Date.now()}`,
            });

            if (response.text && response.text.trim().length > 10) {
                return response.text.trim();
            }
            return fallback;
        } catch (error: any) {
            this.logger.debug(`[AIOptimizer] Gemini explanation fallback triggered: ${error.message}`);
            return fallback;
        }
    }
}
