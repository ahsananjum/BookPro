export const AI_PROVIDER = Symbol("AI_PROVIDER");

export interface AIToolDeclaration {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

export interface AIProviderMessage {
    role: "user" | "model";
    parts: Array<
        | { text: string }
        | { functionCall: { name: string; args: Record<string, unknown> } }
        | { functionResponse: { name: string; response: Record<string, unknown> } }
    >;
}

export interface AIProviderRequest {
    systemInstruction: string;
    messages: AIProviderMessage[];
    tools: AIToolDeclaration[];
    correlationId: string;
}

export interface AIProviderResponse {
    text: string;
    toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
    rawModelParts: AIProviderMessage["parts"];
    provider: "gemini";
    model: string;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostMicros: number | null;
}

export class AIProviderUnavailableError extends Error {
    readonly code = "AI_PROVIDER_UNAVAILABLE";

    constructor(message = "The AI receptionist is temporarily unavailable.") {
        super(message);
        this.name = "AIProviderUnavailableError";
    }
}

export interface AIProvider {
    generate(request: AIProviderRequest): Promise<AIProviderResponse>;
    isConfigured(): boolean;
}
