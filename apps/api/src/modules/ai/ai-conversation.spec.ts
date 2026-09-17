import { ActorType, RequestContext } from "@bookpro/contracts";
import { AIProviderUnavailableError } from "./ai-provider.interface";
import { AIConversationService } from "./ai-conversation.service";

const orgId = "11111111-1111-4111-8111-111111111111";
const participantId = "22222222-2222-4222-8222-222222222222";
const conversationId = "33333333-3333-4333-8333-333333333333";

function requestContext(actorType: ActorType = ActorType.STAFF): RequestContext {
    return {
        requestId: "req-1",
        correlationId: "corr-1",
        actorType,
        subjectId: participantId,
        organizationId: orgId,
        permissions: [],
        locale: "en-US",
        timezone: "UTC",
        isPlatformAdmin: false,
        issuedAt: new Date().toISOString(),
    };
}

function setup(entitled = true, scope = "OWNER", actorType = ActorType.STAFF) {
    const baseConversation = {
        id: conversationId,
        organizationId: orgId,
        participantId,
        channel: "TEXT",
        status: "ACTIVE",
        safeHistory: [],
        scope,
        participantType: actorType === ActorType.CUSTOMER ? "CUSTOMER" : "STAFF",
        retentionExpiresAt: new Date(Date.now() + 60_000),
    };
    const prisma = {
        aIConversation: {
            create: jest.fn().mockResolvedValue(baseConversation),
            findFirst: jest.fn().mockResolvedValue(baseConversation),
            update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...baseConversation, safeHistory: data.safeHistory, lastErrorCode: data.lastErrorCode })),
            aggregate: jest.fn().mockResolvedValue({ _sum: { messageCount: 0 } }),
        },
    } as any;
    const entitlements = { hasFeature: jest.fn().mockResolvedValue(entitled) } as any;
    const registry = {
        buildTrustedContext: jest.fn().mockImplementation((ctx: RequestContext) => ({
            organizationId: orgId,
            participantId: ctx?.subjectId || participantId,
            actorType: ctx?.actorType || actorType,
            subjectId: ctx?.subjectId || participantId,
            permissions: [],
            correlationId: "corr-1",
        })),
    } as any;
    const redis = { getClient: jest.fn().mockReturnValue(null), getIsConnected: jest.fn().mockReturnValue(false) } as any;
    const provider = { isConfigured: jest.fn().mockReturnValue(false), generate: jest.fn().mockRejectedValue(new AIProviderUnavailableError()) } as any;
    return { service: new AIConversationService(prisma, entitlements, registry, redis, provider), prisma, provider };
}

describe("AIConversationService controls", () => {
    it("enforces tenant entitlement", async () => {
        const { service } = setup(false);
        await expect(service.createConversation(requestContext())).rejects.toMatchObject({ response: { code: "AI_ENTITLEMENT_REQUIRED" } });
    });

    it("returns the normal-booking fallback when Gemini is unavailable in customer session", async () => {
        const { service } = setup(true, "CUSTOMER", ActorType.CUSTOMER);
        const response = await service.sendMessage(conversationId, "Find a service", "request-1234", requestContext(ActorType.CUSTOMER));
        expect(response.degraded).toBe(true);
        expect(response.assistantMessage).toContain("normal booking flow");
        expect(response.cards).toEqual([]);
    });

    it("returns the standard operations fallback when Gemini is unavailable in owner session", async () => {
        const { service } = setup(true, "OWNER", ActorType.STAFF);
        const response = await service.sendMessage(conversationId, "Show agenda", "request-5678", requestContext(ActorType.STAFF));
        expect(response.degraded).toBe(true);
        expect(response.assistantMessage).toContain("standard BookPro operations");
        expect(response.cards).toEqual([]);
    });

    it("keeps voice fail-closed while the deferred feature flag is off", async () => {
        const previous = process.env.AI_VOICE_ENABLED;
        process.env.AI_VOICE_ENABLED = "false";
        const { service } = setup(true);
        await expect(service.createConversation(requestContext(), "VOICE")).rejects.toMatchObject({ response: { code: "AI_VOICE_DISABLED" } });
        process.env.AI_VOICE_ENABLED = previous;
    });

    it("enforces the configured per-participant rate limit", async () => {
        const previous = process.env.AI_REQUESTS_PER_MINUTE;
        process.env.AI_REQUESTS_PER_MINUTE = "1";
        const { service } = setup(true);
        await (service as any).assertRateLimit(orgId, participantId);
        await expect((service as any).assertRateLimit(orgId, participantId)).rejects.toMatchObject({ status: 429 });
        process.env.AI_REQUESTS_PER_MINUTE = previous;
    });
});
