import { Test, TestingModule } from "@nestjs/testing";
import { RealtimeService } from "../src/modules/realtime/realtime.service";
import { RealtimeController } from "../src/modules/realtime/realtime.controller";
import { RedisService } from "@bookpro/server-core";
import { ForbiddenException, UnauthorizedException, MessageEvent } from "@nestjs/common";
import { firstValueFrom, toArray, take } from "rxjs";

describe("Realtime Redis Subscriber & SSE Tenant Isolation Suite", () => {
    let realtimeService: RealtimeService;
    let realtimeController: RealtimeController;
    let redisService: RedisService;

    // Simulated Redis in-memory pubsub bus
    let channelSubscriptions: Map<string, Set<(msg: string) => void>>;
    let redisSubscribeSpy: jest.SpyInstance;
    let redisUnsubscribeSpy: jest.SpyInstance;
    let redisPublishSpy: jest.SpyInstance;

    beforeEach(async () => {
        channelSubscriptions = new Map();

        const mockRedisService = {
            getIsConnected: jest.fn().mockReturnValue(true),
            subscribe: jest.fn(async (channel: string, callback: (msg: string) => void) => {
                let set = channelSubscriptions.get(channel);
                const isFirst = !set || set.size === 0;
                if (!set) {
                    set = new Set();
                    channelSubscriptions.set(channel, set);
                }
                set.add(callback);

                return async () => {
                    const existing = channelSubscriptions.get(channel);
                    if (existing) {
                        existing.delete(callback);
                        if (existing.size === 0) {
                            channelSubscriptions.delete(channel);
                        }
                    }
                };
            }),
            unsubscribe: jest.fn(async (channel: string, callback: (msg: string) => void) => {
                const existing = channelSubscriptions.get(channel);
                if (existing) {
                    existing.delete(callback);
                    if (existing.size === 0) {
                        channelSubscriptions.delete(channel);
                    }
                }
            }),
            publish: jest.fn(async (channel: string, message: any) => {
                const serialized = typeof message === "string" ? message : JSON.stringify(message);
                const listeners = channelSubscriptions.get(channel);
                if (listeners && listeners.size > 0) {
                    listeners.forEach((cb) => cb(serialized));
                }
                return true;
            }),
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [RealtimeController],
            providers: [
                RealtimeService,
                { provide: RedisService, useValue: mockRedisService },
            ],
        }).compile();

        realtimeService = module.get<RealtimeService>(RealtimeService);
        realtimeController = module.get<RealtimeController>(RealtimeController);
        redisService = module.get<RedisService>(RedisService);

        redisSubscribeSpy = jest.spyOn(redisService, "subscribe");
        redisPublishSpy = jest.spyOn(redisService, "publish");
    });

    afterEach(() => {
        jest.clearAllMocks();
        channelSubscriptions.clear();
    });

    it("delivers worker-originated Redis messages to API SSE stream", async () => {
        const testOrgId = "org_enterprise_alpha";
        const eventsStream$ = realtimeService.getEventStream(testOrgId);

        const receivedEvents: MessageEvent[] = [];
        const subscription = eventsStream$.subscribe((event) => {
            receivedEvents.push(event);
        });

        // Simulate Worker process publishing outbox event to Redis
        const workerEvent = {
            type: "appointment.confirmed",
            entityId: "appt_98765",
            aggregateType: "Appointment",
            version: 1,
            organizationId: testOrgId,
            timestamp: new Date().toISOString(),
            correlationId: "corr_worker_123",
        };

        await redisService.publish(`realtime:${testOrgId}`, workerEvent);

        expect(receivedEvents).toHaveLength(1);
        expect(receivedEvents[0].id).toBe("corr_worker_123");
        expect(receivedEvents[0].type).toBe("appointment.confirmed");

        const parsedData = JSON.parse(receivedEvents[0].data as string);
        expect(parsedData.entityId).toBe("appt_98765");
        expect(parsedData.organizationId).toBe(testOrgId);

        subscription.unsubscribe();
    });

    it("strictly isolates tenant events so Org A never receives Org B events", async () => {
        const orgA = "org_tenant_A";
        const orgB = "org_tenant_B";

        const receivedOrgA: MessageEvent[] = [];
        const receivedOrgB: MessageEvent[] = [];

        const subA = realtimeService.getEventStream(orgA).subscribe((evt) => receivedOrgA.push(evt));
        const subB = realtimeService.getEventStream(orgB).subscribe((evt) => receivedOrgB.push(evt));

        // Publish to Org A
        await redisService.publish(`realtime:${orgA}`, {
            type: "appointment.created",
            entityId: "appt_A1",
            organizationId: orgA,
            timestamp: new Date().toISOString(),
        });

        // Publish to Org B
        await redisService.publish(`realtime:${orgB}`, {
            type: "appointment.created",
            entityId: "appt_B1",
            organizationId: orgB,
            timestamp: new Date().toISOString(),
        });

        expect(receivedOrgA).toHaveLength(1);
        expect(JSON.parse(receivedOrgA[0].data as string).entityId).toBe("appt_A1");

        expect(receivedOrgB).toHaveLength(1);
        expect(JSON.parse(receivedOrgB[0].data as string).entityId).toBe("appt_B1");

        subA.unsubscribe();
        subB.unsubscribe();
    });

    it("cleans up Redis subscription refcounts when client unsubscribes", async () => {
        const testOrgId = "org_cleanup_test";

        const sub1 = realtimeService.getEventStream(testOrgId).subscribe(() => { });
        const sub2 = realtimeService.getEventStream(testOrgId).subscribe(() => { });

        expect(channelSubscriptions.get(`realtime:${testOrgId}`)?.size).toBe(2);

        // First client disconnects
        sub1.unsubscribe();
        expect(channelSubscriptions.get(`realtime:${testOrgId}`)?.size).toBe(1);

        // Second client disconnects
        sub2.unsubscribe();
        expect(channelSubscriptions.get(`realtime:${testOrgId}`)).toBeUndefined();
    });

    it("controller streamEvents emits initial connected frame with canonical refetch instruction", async () => {
        const testOrgId = "org_controller_test";
        const mockCtx: any = { organizationId: testOrgId, actorType: "STAFF" };

        const sse$ = realtimeController.streamEvents(
            testOrgId,
            testOrgId,
            undefined,
            undefined,
            mockCtx
        );

        // Read first event emitted by stream
        const firstFrame = await firstValueFrom(sse$);

        expect(firstFrame.type).toBe("connected");
        const payload = JSON.parse(firstFrame.data as string);
        expect(payload.type).toBe("connected");
        expect(payload.organizationId).toBe(testOrgId);
        expect(payload.reconnectStrategy).toBe("canonical_refetch");
    });

    it("controller streamEvents rejects cross-tenant subscription requests with 403 Forbidden", () => {
        const authOrgId = "org_legitimate";
        const attackerOrgId = "org_victim";
        const mockCtx: any = { organizationId: authOrgId, actorType: "STAFF" };

        expect(() => {
            realtimeController.streamEvents(
                attackerOrgId,
                attackerOrgId,
                undefined,
                undefined,
                mockCtx
            );
        }).toThrow(ForbiddenException);
    });

    it("controller streamEvents rejects unauthenticated requests with 401 Unauthorized", () => {
        expect(() => {
            realtimeController.streamEvents(
                undefined,
                undefined,
                undefined,
                undefined,
                undefined
            );
        }).toThrow(UnauthorizedException);
    });
});
