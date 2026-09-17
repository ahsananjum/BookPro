import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Subject, Observable, merge } from "rxjs";
import { filter, map } from "rxjs/operators";
import { RedisService } from "@bookpro/server-core";
import { RealtimeEventHint } from "@bookpro/contracts";
import { MessageEvent } from "@nestjs/common";

@Injectable()
export class RealtimeService implements OnModuleInit {
    private readonly logger = new Logger(RealtimeService.name);
    private readonly localEventStream = new Subject<RealtimeEventHint>();

    constructor(private readonly redisService: RedisService) { }

    onModuleInit() {
        this.logger.log("[RealtimeService] Initialized Realtime event distributor with Redis Pub/Sub subscriber support.");
    }

    /**
     * Broadcasts a real-time event hint to a specific tenant across all processes via Redis Pub/Sub
     */
    async broadcastEvent(hint: RealtimeEventHint): Promise<void> {
        // Emit to process-local subject
        this.localEventStream.next(hint);

        // Broadcast across cluster / worker processes via Redis
        if (this.redisService && this.redisService.getIsConnected()) {
            await this.redisService.publish(`realtime:${hint.organizationId}`, hint);
        }
    }

    /**
     * Creates an observable stream of real-time events scoped strictly to an organization.
     * Integrates directly with Redis pub/sub channels (`realtime:<orgId>`) with refcounted
     * subscription lifecycle and automatic RxJS teardown cleanup when SSE clients disconnect.
     */
    getEventStream(organizationId: string): Observable<MessageEvent> {
        const redisStream$ = new Observable<MessageEvent>((subscriber) => {
            const channel = `realtime:${organizationId}`;
            let isCleanedUp = false;
            let unsubscribeHandle: (() => Promise<void>) | null = null;

            const handleMessage = (rawMessage: string) => {
                try {
                    const hint: RealtimeEventHint = typeof rawMessage === "string" ? JSON.parse(rawMessage) : rawMessage;

                    // Defense-in-depth tenant isolation
                    if (hint && hint.organizationId === organizationId) {
                        const eventId = hint.correlationId || hint.entityId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
                        subscriber.next({
                            id: eventId,
                            type: hint.type || "message",
                            data: JSON.stringify(hint),
                        } as MessageEvent);
                    }
                } catch (err: any) {
                    this.logger.warn(`[RealtimeService] Error parsing Redis payload on ${channel}: ${err.message}`);
                }
            };

            // Subscribe to Redis pub/sub channel
            const subPromise = this.redisService
                .subscribe(channel, handleMessage)
                .then((unsub) => {
                    unsubscribeHandle = unsub;
                    if (isCleanedUp) {
                        return unsub().catch((err: any) =>
                            this.logger.warn(`[RealtimeService] Error during early unsubscribe on ${channel}: ${err.message}`)
                        );
                    }
                })
                .catch((err: any) => {
                    this.logger.error(`[RealtimeService] Failed to subscribe to Redis channel ${channel}: ${err.message}`);
                });

            // RxJS Teardown logic invoked when SSE client disconnects
            return () => {
                isCleanedUp = true;
                if (unsubscribeHandle) {
                    unsubscribeHandle().catch((err: any) => {
                        this.logger.warn(`[RealtimeService] Error unsubscribing from Redis channel ${channel}: ${err.message}`);
                    });
                } else if (subPromise) {
                    subPromise.then(() => {
                        if (unsubscribeHandle) {
                            unsubscribeHandle().catch((err: any) => {
                                this.logger.warn(`[RealtimeService] Error unsubscribing from Redis channel ${channel}: ${err.message}`);
                            });
                        }
                    });
                }
            };
        });

        // Local fallback stream for in-process broadcasts when Redis is disconnected or during unit tests
        const localStream$ = this.localEventStream.asObservable().pipe(
            filter((event) => event.organizationId === organizationId),
            map((event) => {
                const eventId = event.correlationId || event.entityId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
                return {
                    id: eventId,
                    type: event.type || "message",
                    data: JSON.stringify(event),
                } as MessageEvent;
            }),
        );

        // When Redis is connected, Redis Pub/Sub already delivers messages broadcasted by this or other instances.
        // We merge localStream$ filtered so it acts seamlessly.
        return merge(redisStream$, localStream$);
    }
}

