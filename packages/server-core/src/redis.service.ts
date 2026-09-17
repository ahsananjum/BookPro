import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import Redis, { Redis as RedisClient } from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private client: RedisClient | null = null;
    private subscriberClient: RedisClient | null = null;
    private isConnected = false;

    private readonly channelSubscribers = new Map<string, Set<(message: string) => void>>();
    private subscriberInitialized = false;

    onModuleInit() {
        this.initClients();
    }

    onModuleDestroy() {
        this.disconnect();
    }

    private initClients() {
        const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
        try {
            this.client = new Redis(redisUrl, {
                maxRetriesPerRequest: 3,
                retryStrategy(times: number) {
                    return Math.min(times * 100, 3000);
                },
                lazyConnect: false,
                enableReadyCheck: true,
            });

            this.client.on("connect", () => {
                this.logger.log("[RedisService] Connected to configured Redis endpoint");
                this.isConnected = true;
            });

            this.client.on("error", (err: any) => {
                this.logger.warn(`[RedisService] Redis connection error: ${err.message}`);
                this.isConnected = false;
            });

            this.client.on("close", () => {
                this.isConnected = false;
            });
        } catch (err: any) {
            this.logger.warn(`[RedisService] Failed to initialize Redis client: ${err.message}`);
            this.isConnected = false;
        }
    }

    private ensureSubscriberClient(): RedisClient | null {
        if (this.subscriberClient) {
            return this.subscriberClient;
        }

        const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
        try {
            this.subscriberClient = new Redis(redisUrl, {
                maxRetriesPerRequest: 3,
                retryStrategy(times: number) {
                    return Math.min(times * 100, 3000);
                },
                lazyConnect: false,
                enableReadyCheck: true,
            });

            // Single message listener for all subscriptions on this client connection
            this.subscriberClient.on("message", (channel: string, message: string) => {
                const callbacks = this.channelSubscribers.get(channel);
                if (callbacks && callbacks.size > 0) {
                    callbacks.forEach((callback) => {
                        try {
                            callback(message);
                        } catch (cbErr: any) {
                            this.logger.error(`[RedisService] Error in subscriber callback for channel ${channel}: ${cbErr.message}`);
                        }
                    });
                }
            });

            this.subscriberClient.on("error", (err: any) => {
                this.logger.warn(`[RedisService] Subscriber Redis client error: ${err.message}`);
            });

            this.subscriberInitialized = true;
            return this.subscriberClient;
        } catch (err: any) {
            this.logger.warn(`[RedisService] Failed to initialize subscriber Redis client: ${err.message}`);
            return null;
        }
    }

    getClient(): RedisClient | null {
        return this.client;
    }

    getSubscriberClient(): RedisClient | null {
        return this.subscriberClient;
    }

    getIsConnected(): boolean {
        return this.isConnected;
    }

    getSubscriberChannelCount(): number {
        return this.channelSubscribers.size;
    }

    getChannelListenerCount(channel: string): number {
        return this.channelSubscribers.get(channel)?.size || 0;
    }

    async ping(): Promise<boolean> {
        if (!this.client || !this.isConnected) return false;
        try {
            const res = await this.client.ping();
            return res === "PONG";
        } catch {
            return false;
        }
    }

    /**
     * Tenant-safe key prefixing
     */
    static buildKey(orgId: string, namespace: string, ...parts: string[]): string {
        return `bookpro:${orgId}:${namespace}:${parts.filter(Boolean).join(":")}`;
    }

    async get<T = any>(key: string): Promise<T | null> {
        if (!this.client || !this.isConnected) return null;
        try {
            const raw = await this.client.get(key);
            if (!raw) return null;
            return JSON.parse(raw) as T;
        } catch (err: any) {
            this.logger.warn(`[RedisService] get("${key}") failed: ${err.message}`);
            return null;
        }
    }

    async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
        if (!this.client || !this.isConnected) return false;
        try {
            const serialized = JSON.stringify(value);
            if (ttlSeconds && ttlSeconds > 0) {
                await this.client.set(key, serialized, "EX", ttlSeconds);
            } else {
                await this.client.set(key, serialized);
            }
            return true;
        } catch (err: any) {
            this.logger.warn(`[RedisService] set("${key}") failed: ${err.message}`);
            return false;
        }
    }

    async del(...keys: string[]): Promise<boolean> {
        if (!this.client || !this.isConnected || keys.length === 0) return false;
        try {
            await this.client.del(...keys);
            return true;
        } catch (err: any) {
            this.logger.warn(`[RedisService] del() failed: ${err.message}`);
            return false;
        }
    }

    /**
     * Non-blocking scan-based deletion for targeted cache prefix invalidation
     */
    async delPrefix(prefix: string): Promise<number> {
        if (!this.client || !this.isConnected) return 0;
        try {
            let cursor = "0";
            let totalDeleted = 0;
            do {
                const [nextCursor, keys] = await this.client.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 50);
                cursor = nextCursor;
                if (keys.length > 0) {
                    await this.client.del(...keys);
                    totalDeleted += keys.length;
                }
            } while (cursor !== "0");
            return totalDeleted;
        } catch (err: any) {
            this.logger.warn(`[RedisService] delPrefix("${prefix}") failed: ${err.message}`);
            return 0;
        }
    }

    async publish(channel: string, message: any): Promise<boolean> {
        if (!this.client || !this.isConnected) return false;
        try {
            const payload = typeof message === "string" ? message : JSON.stringify(message);
            await this.client.publish(channel, payload);
            return true;
        } catch (err: any) {
            this.logger.warn(`[RedisService] publish("${channel}") failed: ${err.message}`);
            return false;
        }
    }

    /**
     * Subscribes to a channel using a refcounted, single-listener Redis subscriber client.
     * Returns an explicit unsubscribe function closure for cleanup.
     */
    async subscribe(channel: string, callback: (message: string) => void): Promise<() => Promise<void>> {
        const client = this.ensureSubscriberClient();
        if (!client) {
            this.logger.warn(`[RedisService] Cannot subscribe to ${channel}: subscriber client unavailable`);
            return async () => { };
        }

        let callbacks = this.channelSubscribers.get(channel);
        const isFirstSubscriber = !callbacks || callbacks.size === 0;

        if (!callbacks) {
            callbacks = new Set();
            this.channelSubscribers.set(channel, callbacks);
        }

        callbacks.add(callback);

        if (isFirstSubscriber) {
            try {
                await client.subscribe(channel);
            } catch (subErr: any) {
                this.logger.error(`[RedisService] Failed to execute SUBSCRIBE for channel ${channel}: ${subErr.message}`);
                callbacks.delete(callback);
                if (callbacks.size === 0) {
                    this.channelSubscribers.delete(channel);
                }
                throw subErr;
            }
        }

        // Return unsubscribe handle
        return async () => {
            await this.unsubscribe(channel, callback);
        };
    }

    /**
     * Unsubscribes a specific callback from a channel. If refcount hits 0, unsubscribes from Redis.
     */
    async unsubscribe(channel: string, callback: (message: string) => void): Promise<void> {
        const callbacks = this.channelSubscribers.get(channel);
        if (!callbacks) return;

        callbacks.delete(callback);

        if (callbacks.size === 0) {
            this.channelSubscribers.delete(channel);
            if (this.subscriberClient) {
                try {
                    await this.subscriberClient.unsubscribe(channel);
                } catch (unsubErr: any) {
                    this.logger.warn(`[RedisService] Failed to execute UNSUBSCRIBE for channel ${channel}: ${unsubErr.message}`);
                }
            }
        }
    }

    private disconnect() {
        if (this.client) {
            try {
                this.client.disconnect();
            } catch { }
            this.client = null;
        }
        if (this.subscriberClient) {
            try {
                this.subscriberClient.disconnect();
            } catch { }
            this.subscriberClient = null;
        }
        this.channelSubscribers.clear();
        this.isConnected = false;
        this.subscriberInitialized = false;
    }
}
