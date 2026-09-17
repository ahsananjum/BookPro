import { RedisService } from "./redis.service";

describe("RedisService Subscriber Lifecycle & Refcounting", () => {
    let service: RedisService;
    let mockSubscriberClient: any;
    let messageHandler: ((channel: string, message: string) => void) | null = null;
    let readyHandler: (() => Promise<void>) | null = null;

    beforeEach(() => {
        service = new RedisService();

        messageHandler = null;
        readyHandler = null;

        mockSubscriberClient = {
            on: jest.fn((event: string, handler: any) => {
                if (event === "message") {
                    messageHandler = handler;
                }
                if (event === "ready") {
                    readyHandler = handler;
                }
            }),
            subscribe: jest.fn().mockResolvedValue(1),
            unsubscribe: jest.fn().mockResolvedValue(1),
            disconnect: jest.fn(),
        };

        // Inject mock subscriber client
        (service as any).subscriberClient = mockSubscriberClient;
    });

    afterEach(() => {
        service.onModuleDestroy();
    });

    it("subscribes to a new channel and attaches single message dispatcher", async () => {
        const receivedMessages: string[] = [];
        const callback = (msg: string) => receivedMessages.push(msg);

        const unsub = await service.subscribe("realtime:org_123", callback);

        expect(mockSubscriberClient.subscribe).toHaveBeenCalledTimes(1);
        expect(mockSubscriberClient.subscribe).toHaveBeenCalledWith("realtime:org_123");
        expect(service.getSubscriberChannelCount()).toBe(1);
        expect(service.getChannelListenerCount("realtime:org_123")).toBe(1);

        // Simulate incoming message
        expect(messageHandler).toBeDefined();
        messageHandler!("realtime:org_123", JSON.stringify({ type: "appointment.created" }));

        expect(receivedMessages).toHaveLength(1);
        expect(JSON.parse(receivedMessages[0])).toEqual({ type: "appointment.created" });

        await unsub();
        expect(mockSubscriberClient.unsubscribe).toHaveBeenCalledWith("realtime:org_123");
        expect(service.getSubscriberChannelCount()).toBe(0);
    });

    it("multiplexes multiple callbacks onto the same Redis channel without duplicate subscribe calls", async () => {
        const messagesA: string[] = [];
        const messagesB: string[] = [];

        const cbA = (msg: string) => messagesA.push(msg);
        const cbB = (msg: string) => messagesB.push(msg);

        const unsubA = await service.subscribe("realtime:org_123", cbA);
        const unsubB = await service.subscribe("realtime:org_123", cbB);

        // Redis SUBSCRIBE should only be called ONCE for the channel
        expect(mockSubscriberClient.subscribe).toHaveBeenCalledTimes(1);
        expect(service.getChannelListenerCount("realtime:org_123")).toBe(2);

        // Simulate message dispatch
        messageHandler!("realtime:org_123", "payload_test");
        expect(messagesA).toEqual(["payload_test"]);
        expect(messagesB).toEqual(["payload_test"]);

        // Unsubscribe first listener - channel should remain active
        await unsubA();
        expect(mockSubscriberClient.unsubscribe).not.toHaveBeenCalled();
        expect(service.getChannelListenerCount("realtime:org_123")).toBe(1);

        // Unsubscribe second listener - channel should now unsubscribe from Redis
        await unsubB();
        expect(mockSubscriberClient.unsubscribe).toHaveBeenCalledTimes(1);
        expect(mockSubscriberClient.unsubscribe).toHaveBeenCalledWith("realtime:org_123");
        expect(service.getChannelListenerCount("realtime:org_123")).toBe(0);
        expect(service.getSubscriberChannelCount()).toBe(0);
    });

    it("isolates errors in one callback from affecting other subscriber callbacks", async () => {
        const messagesB: string[] = [];

        const faultyCb = () => {
            throw new Error("Callback exploded");
        };
        const goodCb = (msg: string) => messagesB.push(msg);

        await service.subscribe("realtime:org_abc", faultyCb);
        await service.subscribe("realtime:org_abc", goodCb);

        expect(() => {
            messageHandler!("realtime:org_abc", "safe_message");
        }).not.toThrow();

        expect(messagesB).toEqual(["safe_message"]);
    });

    it("resubscribes all active channels upon Redis client reconnect", async () => {
        await service.subscribe("realtime:org_1", () => { });
        await service.subscribe("realtime:org_2", () => { });

        expect(mockSubscriberClient.subscribe).toHaveBeenCalledTimes(2);

        // Clear mock calls
        mockSubscriberClient.subscribe.mockClear();

        // Trigger 'ready' reconnect event
        expect(readyHandler).toBeDefined();
        await readyHandler!();

        expect(mockSubscriberClient.subscribe).toHaveBeenCalledTimes(1);
        expect(mockSubscriberClient.subscribe).toHaveBeenCalledWith("realtime:org_1", "realtime:org_2");
    });
});
