import { Injectable, Logger, ConflictException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { computeCanonicalRequestHash } from "@bookpro/server-core";
import { IdempotencyStatus, Prisma } from "@prisma/client";

export interface IdempotencyCheckResult {
    isDuplicate: boolean;
    statusCode?: number;
    responseBody?: any;
}

export interface ExecuteIdempotentOptions {
    organizationId: string;
    operation?: string;
    idempotencyKey?: string | null;
    payload: any;
    ttlSeconds?: number;
    lockTimeoutMs?: number;
}

export interface HandlerResult<T> {
    statusCode?: number;
    data: T;
}

export interface ExecuteResult<T> {
    statusCode: number;
    data: T;
    fromCache: boolean;
}

@Injectable()
export class IdempotencyService {
    private readonly logger = new Logger(IdempotencyService.name);
    private readonly defaultTtlSeconds = 24 * 60 * 60; // 24 hours
    private readonly defaultLockTimeoutMs = 60 * 1000; // 60 seconds lease

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Generates a deterministic SHA-256 hash of request parameters using canonical key-sorting.
     */
    generateRequestHash(payload: any): string {
        return computeCanonicalRequestHash(payload);
    }

    /**
     * Atomically claims an idempotency key, executes the given handler under concurrency locking,
     * and persists the response for duplicate request replay.
     *
     * Lifecycle guarantees:
     * - Returns cached response immediately if already COMPLETED with identical hash.
     * - Throws 409 Conflict if key was previously used with a different request hash.
     * - Throws 409 Conflict if a concurrent request is currently IN_PROGRESS under an active lease.
     * - Automatically recovers stale IN_PROGRESS leases (>60s) or expired records.
     * - Marks record as FAILED on uncaught exception.
     */
    async executeIdempotent<T>(
        options: ExecuteIdempotentOptions,
        fn: () => Promise<HandlerResult<T> | T>,
    ): Promise<ExecuteResult<T>> {
        const { organizationId, payload } = options;
        const operation = options.operation || "DEFAULT";
        const idempotencyKey = options.idempotencyKey?.trim();
        const ttlSeconds = options.ttlSeconds || this.defaultTtlSeconds;
        const lockTimeoutMs = options.lockTimeoutMs || this.defaultLockTimeoutMs;

        // If no idempotency key provided, execute handler directly without persistence
        if (!idempotencyKey) {
            const rawResult = await fn();
            const normalized = this.normalizeHandlerResult(rawResult);
            return {
                statusCode: normalized.statusCode || 200,
                data: normalized.data,
                fromCache: false,
            };
        }

        const requestHash = this.generateRequestHash(payload);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

        // Step 1: Attempt atomic claim (insert with status IN_PROGRESS)
        let recordId: string | null = null;
        try {
            const created = await this.prisma.idempotencyRecord.create({
                data: {
                    organizationId,
                    operation,
                    idempotencyKey,
                    requestHash,
                    status: IdempotencyStatus.IN_PROGRESS,
                    lockedAt: now,
                    expiresAt,
                },
            });
            recordId = created.id;
        } catch (err: any) {
            // Handle unique constraint collision on [organizationId, operation, idempotencyKey]
            if (err.code === "P2002" || err.message?.includes("Unique constraint")) {
                const existing = await this.prisma.idempotencyRecord.findUnique({
                    where: {
                        organizationId_operation_idempotencyKey: {
                            organizationId,
                            operation,
                            idempotencyKey,
                        },
                    },
                });

                if (!existing) {
                    // Race condition: record was deleted between create and find
                    return this.executeIdempotent(options, fn);
                }

                // A. Expiry Check: If existing record is expired, recycle it
                if (existing.expiresAt <= now) {
                    this.logger.log(`Recycling expired idempotency key ${idempotencyKey} for org ${organizationId}`);
                    const reclaimed = await this.prisma.idempotencyRecord.update({
                        where: { id: existing.id },
                        data: {
                            requestHash,
                            status: IdempotencyStatus.IN_PROGRESS,
                            statusCode: null,
                            responseBody: Prisma.DbNull,
                            errorMessage: null,
                            lockedAt: now,
                            expiresAt,
                            updatedAt: now,
                        },
                    });
                    recordId = reclaimed.id;
                } else {
                    // B. Payload Hash Mismatch Check: Throw 409 Conflict
                    if (existing.requestHash !== requestHash) {
                        this.logger.warn(
                            `Idempotency payload mismatch for key '${idempotencyKey}', operation '${operation}', org '${organizationId}'`,
                        );
                        throw new ConflictException({
                            code: "IDEMPOTENCY_CONFLICT",
                            message: `Idempotency conflict: key '${idempotencyKey}' was already used with different parameters.`,
                        });
                    }

                    // C. Completed Status: Return cached response immediately
                    if (existing.status === IdempotencyStatus.COMPLETED) {
                        return {
                            statusCode: existing.statusCode || 200,
                            data: existing.responseBody as T,
                            fromCache: true,
                        };
                    }

                    // D. In-Progress Status: Check lease duration
                    if (existing.status === IdempotencyStatus.IN_PROGRESS) {
                        const lockTime = existing.lockedAt?.getTime() || existing.updatedAt.getTime();
                        const lockAgeMs = now.getTime() - lockTime;

                        if (lockAgeMs < lockTimeoutMs) {
                            throw new ConflictException({
                                code: "IDEMPOTENCY_CONFLICT",
                                message: `A request with idempotency key '${idempotencyKey}' is currently in progress. Please retry after initial request completes.`,
                            });
                        }

                        // Stale lease recovery
                        this.logger.warn(`Recovering stale IN_PROGRESS claim for idempotency key ${idempotencyKey} (age: ${lockAgeMs}ms)`);
                        const updated = await this.prisma.idempotencyRecord.update({
                            where: { id: existing.id },
                            data: {
                                lockedAt: now,
                                updatedAt: now,
                            },
                        });
                        recordId = updated.id;
                    } else if (existing.status === IdempotencyStatus.FAILED) {
                        // Previous attempt failed, allow atomic retry
                        const updated = await this.prisma.idempotencyRecord.update({
                            where: { id: existing.id },
                            data: {
                                status: IdempotencyStatus.IN_PROGRESS,
                                lockedAt: now,
                                errorMessage: null,
                                updatedAt: now,
                            },
                        });
                        recordId = updated.id;
                    }
                }
            } else {
                throw err;
            }
        }

        // Step 2: Execute side-effect business logic
        let executedResult: HandlerResult<T>;
        try {
            const rawResult = await fn();
            executedResult = this.normalizeHandlerResult(rawResult);
        } catch (execErr: any) {
            // Update idempotency record to FAILED
            if (recordId) {
                try {
                    await this.prisma.idempotencyRecord.update({
                        where: { id: recordId },
                        data: {
                            status: IdempotencyStatus.FAILED,
                            errorMessage: execErr.message || String(execErr),
                            lockedAt: null,
                        },
                    });
                } catch (updateErr: any) {
                    this.logger.error(`Failed to mark idempotency record ${recordId} as FAILED: ${updateErr.message}`);
                }
            }
            throw execErr;
        }

        // Step 3: Transition to COMPLETED with cached response body
        const finalStatusCode = executedResult.statusCode || 200;
        if (recordId) {
            try {
                await this.prisma.idempotencyRecord.update({
                    where: { id: recordId },
                    data: {
                        status: IdempotencyStatus.COMPLETED,
                        statusCode: finalStatusCode,
                        responseBody: (executedResult.data === undefined ? null : executedResult.data) as any,
                        errorMessage: null,
                        lockedAt: null,
                    },
                });
            } catch (saveErr: any) {
                this.logger.error(`Failed to complete idempotency record ${recordId}: ${saveErr.message}`);
            }
        }

        return {
            statusCode: finalStatusCode,
            data: executedResult.data,
            fromCache: false,
        };
    }

    /**
     * Checks if an idempotency record exists for the given organization & idempotency key.
     * Enforces expiry check on read and throws 409 on request hash mismatch.
     */
    async checkIdempotency(
        organizationId: string,
        idempotencyKey: string,
        payload: any,
        operation = "DEFAULT",
    ): Promise<IdempotencyCheckResult> {
        if (!idempotencyKey) {
            return { isDuplicate: false };
        }

        const hash = this.generateRequestHash(payload);
        const existing = await this.prisma.idempotencyRecord.findUnique({
            where: {
                organizationId_operation_idempotencyKey: {
                    organizationId,
                    operation,
                    idempotencyKey,
                },
            },
        });

        if (!existing) {
            return { isDuplicate: false };
        }

        // Expiry check
        if (existing.expiresAt <= new Date()) {
            return { isDuplicate: false };
        }

        // Hash mismatch check -> strictly throw 409
        if (existing.requestHash !== hash) {
            this.logger.warn(
                `Idempotency key collision with different payload! Key: ${idempotencyKey}`,
            );
            throw new ConflictException({
                code: "IDEMPOTENCY_CONFLICT",
                message: `Idempotency conflict: key '${idempotencyKey}' was already used with different parameters.`,
            });
        }

        if (existing.status === IdempotencyStatus.IN_PROGRESS) {
            throw new ConflictException({
                code: "IDEMPOTENCY_CONFLICT",
                message: `A request with idempotency key '${idempotencyKey}' is currently in progress.`,
            });
        }

        if (existing.status === IdempotencyStatus.COMPLETED) {
            return {
                isDuplicate: true,
                statusCode: existing.statusCode || 200,
                responseBody: existing.responseBody,
            };
        }

        return { isDuplicate: false };
    }

    /**
     * Saves or updates an idempotency record with response body (COMPLETED state)
     */
    async saveIdempotencyRecord(
        organizationId: string,
        idempotencyKey: string,
        payload: any,
        statusCode: number,
        responseBody: any,
        operation = "DEFAULT",
    ): Promise<void> {
        if (!idempotencyKey) return;

        const hash = this.generateRequestHash(payload);

        await this.prisma.idempotencyRecord.upsert({
            where: {
                organizationId_operation_idempotencyKey: {
                    organizationId,
                    operation,
                    idempotencyKey,
                },
            },
            create: {
                organizationId,
                operation,
                idempotencyKey,
                requestHash: hash,
                status: IdempotencyStatus.COMPLETED,
                statusCode,
                responseBody: (responseBody === undefined ? null : responseBody) as any,
                expiresAt: new Date(Date.now() + this.defaultTtlSeconds * 1000),
            },
            update: {
                requestHash: hash,
                status: IdempotencyStatus.COMPLETED,
                statusCode,
                responseBody: (responseBody === undefined ? null : responseBody) as any,
                lockedAt: null,
                errorMessage: null,
            },
        });
    }

    private normalizeHandlerResult<T>(result: HandlerResult<T> | T): HandlerResult<T> {
        if (result && typeof result === "object" && "data" in result && ("statusCode" in result || Object.keys(result).length <= 2)) {
            const cast = result as HandlerResult<T>;
            if ("data" in cast) {
                return {
                    statusCode: cast.statusCode || 200,
                    data: cast.data,
                };
            }
        }
        return {
            statusCode: 200,
            data: result as T,
        };
    }
}
