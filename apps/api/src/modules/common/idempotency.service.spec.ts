import { Test, TestingModule } from "@nestjs/testing";
import { IdempotencyService } from "./idempotency.service";
import { PrismaService } from "../database/prisma.service";
import { ConflictException } from "@nestjs/common";
import { IdempotencyStatus } from "@prisma/client";

describe("IdempotencyService", () => {
    let service: IdempotencyService;
    let mockPrisma: any;
    let recordsStore: any[] = [];

    beforeEach(async () => {
        recordsStore = [];

        mockPrisma = {
            idempotencyRecord: {
                create: jest.fn().mockImplementation(async ({ data }) => {
                    const existing = recordsStore.find(
                        (r) =>
                            r.organizationId === data.organizationId &&
                            r.operation === data.operation &&
                            r.idempotencyKey === data.idempotencyKey
                    );
                    if (existing) {
                        const error: any = new Error("Unique constraint failed");
                        error.code = "P2002";
                        throw error;
                    }
                    const record = {
                        id: `idemp-${recordsStore.length + 1}`,
                        ...data,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    };
                    recordsStore.push(record);
                    return record;
                }),
                findUnique: jest.fn().mockImplementation(async ({ where }) => {
                    const criteria = where.organizationId_operation_idempotencyKey;
                    return (
                        recordsStore.find(
                            (r) =>
                                r.organizationId === criteria.organizationId &&
                                r.operation === criteria.operation &&
                                r.idempotencyKey === criteria.idempotencyKey
                        ) || null
                    );
                }),
                update: jest.fn().mockImplementation(async ({ where, data }) => {
                    const idx = recordsStore.findIndex((r) => r.id === where.id);
                    if (idx === -1) throw new Error("Record not found");
                    recordsStore[idx] = {
                        ...recordsStore[idx],
                        ...data,
                        updatedAt: new Date(),
                    };
                    return recordsStore[idx];
                }),
                upsert: jest.fn().mockImplementation(async ({ where, create, update }) => {
                    const criteria = where.organizationId_operation_idempotencyKey;
                    const idx = recordsStore.findIndex(
                        (r) =>
                            r.organizationId === criteria.organizationId &&
                            r.operation === criteria.operation &&
                            r.idempotencyKey === criteria.idempotencyKey
                    );
                    if (idx >= 0) {
                        recordsStore[idx] = { ...recordsStore[idx], ...update, updatedAt: new Date() };
                        return recordsStore[idx];
                    } else {
                        const rec = {
                            id: `idemp-${recordsStore.length + 1}`,
                            ...create,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        };
                        recordsStore.push(rec);
                        return rec;
                    }
                }),
            },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                IdempotencyService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile();

        service = module.get<IdempotencyService>(IdempotencyService);
    });

    const orgId = "11111111-1111-4111-8111-111111111111";

    it("should compute identical canonical hashes regardless of object key order", () => {
        const payload1 = { b: 2, a: 1, details: { z: 26, y: 25 } };
        const payload2 = { a: 1, details: { y: 25, z: 26 }, b: 2 };

        expect(service.generateRequestHash(payload1)).toBe(service.generateRequestHash(payload2));
    });

    it("should atomically execute and cache responses for identical requests", async () => {
        let executionCount = 0;
        const handler = async () => {
            executionCount++;
            return { statusCode: 201, data: { id: "res-123", success: true } };
        };

        const options = {
            organizationId: orgId,
            operation: "APPOINTMENT_CREATE",
            idempotencyKey: "ik_test_001",
            payload: { customerId: "cust-1", serviceId: "srv-1" },
        };

        // First execution: live run
        const res1 = await service.executeIdempotent<{ id: string; success: boolean }>(options, handler);
        expect(res1.fromCache).toBe(false);
        expect(res1.statusCode).toBe(201);
        expect(res1.data.id).toBe("res-123");
        expect(executionCount).toBe(1);

        // Second execution with identical payload and key: cached replay
        const res2 = await service.executeIdempotent<{ id: string; success: boolean }>(options, handler);
        expect(res2.fromCache).toBe(true);
        expect(res2.statusCode).toBe(201);
        expect(res2.data.id).toBe("res-123");
        expect(executionCount).toBe(1); // Handler was NOT executed again
    });

    it("should throw 409 Conflict when an idempotency key is reused with a different payload", async () => {
        const handler = async () => ({ statusCode: 200, data: { result: "ok" } });

        // Initial request
        await service.executeIdempotent(
            {
                organizationId: orgId,
                operation: "PAYMENT",
                idempotencyKey: "ik_pay_001",
                payload: { amountCents: 5000 },
            },
            handler
        );

        // Attempt reuse with different amount
        await expect(
            service.executeIdempotent(
                {
                    organizationId: orgId,
                    operation: "PAYMENT",
                    idempotencyKey: "ik_pay_001",
                    payload: { amountCents: 9000 }, // Different payload!
                },
                handler
            )
        ).rejects.toThrow(ConflictException);
    });

    it("should reject concurrent in-progress requests under active lease with 409", async () => {
        // Manually place an IN_PROGRESS record with active lease
        recordsStore.push({
            id: "idemp-active",
            organizationId: orgId,
            operation: "HOLD_CREATE",
            idempotencyKey: "ik_hold_concurrent",
            requestHash: service.generateRequestHash({ hold: true }),
            status: IdempotencyStatus.IN_PROGRESS,
            lockedAt: new Date(),
            expiresAt: new Date(Date.now() + 60000),
            updatedAt: new Date(),
        });

        const handler = jest.fn();

        await expect(
            service.executeIdempotent(
                {
                    organizationId: orgId,
                    operation: "HOLD_CREATE",
                    idempotencyKey: "ik_hold_concurrent",
                    payload: { hold: true },
                },
                handler
            )
        ).rejects.toThrow(ConflictException);

        expect(handler).not.toHaveBeenCalled();
    });

    it("should recover and execute stale in-progress leases (>60s)", async () => {
        const staleDate = new Date(Date.now() - 120000); // 2 minutes ago
        recordsStore.push({
            id: "idemp-stale",
            organizationId: orgId,
            operation: "HOLD_CREATE",
            idempotencyKey: "ik_hold_stale",
            requestHash: service.generateRequestHash({ hold: true }),
            status: IdempotencyStatus.IN_PROGRESS,
            lockedAt: staleDate,
            expiresAt: new Date(Date.now() + 60000),
            updatedAt: staleDate,
        });

        const handler = jest.fn().mockResolvedValue({ id: "recovered" });

        const result = await service.executeIdempotent<{ id: string }>(
            {
                organizationId: orgId,
                operation: "HOLD_CREATE",
                idempotencyKey: "ik_hold_stale",
                payload: { hold: true },
            },
            handler
        );

        expect(result.fromCache).toBe(false);
        expect(result.data.id).toBe("recovered");
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should recycle expired idempotency records on execution", async () => {
        const expiredDate = new Date(Date.now() - 3600000); // 1 hour ago
        recordsStore.push({
            id: "idemp-expired",
            organizationId: orgId,
            operation: "HOLD_CREATE",
            idempotencyKey: "ik_hold_expired",
            requestHash: "old_hash",
            status: IdempotencyStatus.COMPLETED,
            statusCode: 200,
            responseBody: { old: true },
            expiresAt: expiredDate,
            updatedAt: expiredDate,
        });

        const handler = jest.fn().mockResolvedValue({ new: true });

        const result = await service.executeIdempotent<{ new: boolean }>(
            {
                organizationId: orgId,
                operation: "HOLD_CREATE",
                idempotencyKey: "ik_hold_expired",
                payload: { fresh: true },
            },
            handler
        );

        expect(result.fromCache).toBe(false);
        expect(result.data).toEqual({ new: true });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should mark record as FAILED on unhandled exception and re-throw", async () => {
        const failingHandler = async () => {
            throw new Error("Downstream service exploded");
        };

        await expect(
            service.executeIdempotent(
                {
                    organizationId: orgId,
                    operation: "CRASH_TEST",
                    idempotencyKey: "ik_crash",
                    payload: { data: 1 },
                },
                failingHandler
            )
        ).rejects.toThrow("Downstream service exploded");

        const saved = recordsStore.find((r) => r.idempotencyKey === "ik_crash");
        expect(saved).toBeDefined();
        expect(saved.status).toBe(IdempotencyStatus.FAILED);
        expect(saved.errorMessage).toContain("Downstream service exploded");
    });
});
