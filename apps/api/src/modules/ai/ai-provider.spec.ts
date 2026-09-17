import { GeminiAIAdapter } from "./gemini-ai.adapter";
import { AIProviderUnavailableError } from "./ai-provider.interface";

describe("GeminiAIAdapter", () => {
    const previousEnabled = process.env.AI_ENABLED;
    const previousKey = process.env.GEMINI_API_KEY;

    afterEach(() => {
        process.env.AI_ENABLED = previousEnabled;
        process.env.GEMINI_API_KEY = previousKey;
    });

    it("fails safely when Gemini is disabled or has no server-side key", async () => {
        process.env.AI_ENABLED = "false";
        delete process.env.GEMINI_API_KEY;
        const adapter = new GeminiAIAdapter();
        await expect(adapter.generate({ systemInstruction: "safe", messages: [], tools: [], correlationId: "corr-test" })).rejects.toBeInstanceOf(AIProviderUnavailableError);
    });
});
