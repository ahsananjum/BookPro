import { Injectable, Logger } from "@nestjs/common";
import {
    AIProvider,
    AIProviderRequest,
    AIProviderResponse,
    AIProviderUnavailableError,
} from "./ai-provider.interface";

interface GeminiResponse {
    candidates?: Array<{ content?: { parts?: Array<Record<string, any>> } }>;
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
    };
    error?: { code?: number; message?: string; status?: string };
}

@Injectable()
export class GeminiAIAdapter implements AIProvider {
    private readonly logger = new Logger(GeminiAIAdapter.name);

    private getApiKey(): string | undefined {
        return process.env.GEMINI_API_KEY?.trim();
    }

    private getModel(): string {
        return process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
    }

    private getTimeoutMs(): number {
        return Number(process.env.AI_PROVIDER_TIMEOUT_MS || 30000);
    }

    isConfigured(): boolean {
        return process.env.AI_ENABLED === "true" && Boolean(this.getApiKey());
    }

    async generate(request: AIProviderRequest): Promise<AIProviderResponse> {
        if (!this.isConfigured()) {
            throw new AIProviderUnavailableError("Gemini is not configured or AI is disabled.");
        }

        const apiKey = this.getApiKey()!;
        const primaryModel = this.getModel();
        const timeoutMs = this.getTimeoutMs();

        // Models to attempt: primary model first, fallback through fast available models on transient 503 / 429 quota
        const candidateModels = [
            primaryModel,
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-1.5-flash",
            "gemini-1.5-flash-latest",
            "gemini-flash-latest",
            "gemini-3.5-flash-lite",
            "gemini-3.6-flash",
            "gemini-3.7-flash",
        ].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

        let lastError: any = null;

        for (const currentModel of candidateModels) {
            const startedAt = Date.now();
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(currentModel)}:generateContent`;
            try {
                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": apiKey,
                        "x-goog-request-params": `model=models/${currentModel}`,
                    },
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: request.systemInstruction }] },
                        contents: request.messages,
                        tools: [{
                            functionDeclarations: request.tools.map((tool) => ({
                                name: tool.name,
                                description: tool.description,
                                parameters: tool.parameters,
                            })),
                        }],
                        toolConfig: {
                            functionCallingConfig: {
                                mode: "AUTO",
                            },
                        },
                        generationConfig: {
                            temperature: 0.2,
                            maxOutputTokens: 1200,
                        },
                    }),
                    signal: AbortSignal.timeout(timeoutMs),
                });

                const payload = (await response.json()) as GeminiResponse;
                if (!response.ok || payload.error) {
                    const safeStatus = payload.error?.status || `HTTP_${response.status}`;
                    this.logger.warn(`[Gemini] request failed on model=${currentModel} correlation=${request.correlationId} status=${safeStatus} error=${JSON.stringify(payload.error || payload)}`);
                    
                    // If transient 503 UNAVAILABLE, 429 RESOURCE_EXHAUSTED, or NOT_FOUND, try fallback model
                    if (
                        response.status === 503 || payload.error?.code === 503 || safeStatus === "UNAVAILABLE" ||
                        response.status === 429 || payload.error?.code === 429 || safeStatus === "RESOURCE_EXHAUSTED" ||
                        response.status === 404 || safeStatus === "NOT_FOUND"
                    ) {
                        lastError = new AIProviderUnavailableError(`Gemini model ${currentModel} is busy (${safeStatus}).`);
                        continue;
                    }
                    throw new AIProviderUnavailableError(`Gemini request failed (${safeStatus}).`);
                }

                const parts = payload.candidates?.[0]?.content?.parts || [];
                const text = parts
                    .filter((part) => typeof part.text === "string")
                    .map((part) => part.text as string)
                    .join("\n")
                    .trim();
                const toolCalls = parts
                    .filter((part) => part.functionCall?.name)
                    .map((part) => ({
                        name: String(part.functionCall.name),
                        args: (part.functionCall.args || {}) as Record<string, unknown>,
                    }));

                return {
                    text,
                    toolCalls,
                    rawModelParts: parts as AIProviderResponse["rawModelParts"],
                    provider: "gemini",
                    model: currentModel,
                    latencyMs: Date.now() - startedAt,
                    inputTokens: payload.usageMetadata?.promptTokenCount,
                    outputTokens: payload.usageMetadata?.candidatesTokenCount,
                    estimatedCostMicros: null,
                };
            } catch (error: any) {
                if (error instanceof AIProviderUnavailableError) {
                    lastError = error;
                    continue;
                }
                this.logger.error(`[Gemini] network or timeout error on model=${currentModel} correlation=${request.correlationId}: ${error.message}`);
                lastError = new AIProviderUnavailableError("Gemini provider request failed or timed out.");
            }
        }

        throw lastError || new AIProviderUnavailableError("All Gemini provider models failed or timed out.");
    }
}
