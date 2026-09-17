import { IdempotencyJanitorService } from "./idempotency-janitor.service";

describe("IdempotencyJanitorService", () => {
    let service: IdempotencyJanitorService;
    let mockPrisma: any;

    beforeEach(() => {
        mockPrisma = {
            idempotencyRecord: {
                deleteMany: jest.fn(),
            },
        };
        service = new IdempotencyJanitorService(mockPrisma);
    });

    afterEach(() => {
        service.onModuleDestroy();
        jest.clearAllMocks();
    });

    it("should purge expired idempotency records", async () => {
        mockPrisma.idempotencyRecord.deleteMany.mockResolvedValue({ count: 5 });

        const count = await service.cleanupExpiredRecords();

        expect(count).toBe(5);
        expect(mockPrisma.idempotencyRecord.deleteMany).toHaveBeenCalledWith({
            where: {
                expiresAt: { lt: expect.any(Date) },
            },
        });
    });

    it("should prevent concurrent overlapping cleanups", async () => {
        let resolveDelete: any;
        const deletePromise = new Promise((resolve) => {
            resolveDelete = resolve;
        });

        mockPrisma.idempotencyRecord.deleteMany.mockReturnValue(deletePromise);

        const run1 = service.cleanupExpiredRecords();
        const run2 = service.cleanupExpiredRecords();

        expect(await run2).toBe(0);

        resolveDelete({ count: 2 });
        expect(await run1).toBe(2);
        expect(mockPrisma.idempotencyRecord.deleteMany).toHaveBeenCalledTimes(1);
    });

    it("should handle exceptions gracefully without throwing", async () => {
        mockPrisma.idempotencyRecord.deleteMany.mockRejectedValue(new Error("Database connection lost"));

        const count = await service.cleanupExpiredRecords();

        expect(count).toBe(0);
    });
});
