import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';

export type SubjectType = 'STAFF' | 'RESOURCE' | 'CAPACITY';

export interface GuardKey {
    organizationId: string;
    subjectType: SubjectType;
    subjectId: string;
    dateBucket: string; // YYYY-MM-DD
}

@Injectable()
export class ScheduleGuardService {
    private readonly logger = new Logger(ScheduleGuardService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Builds deterministic guard keys for affected scheduling entities across start/end interval
     */
    buildGuardKeys(
        organizationId: string,
        startAt: Date,
        endAt: Date,
        staffId?: string | null,
        resourceIds: string[] = [],
        capacityServiceId?: string | null,
    ): GuardKey[] {
        const dates = this.getDateBuckets(startAt, endAt);
        const keys: GuardKey[] = [];

        for (const dateBucket of dates) {
            if (staffId) {
                keys.push({
                    organizationId,
                    subjectType: 'STAFF',
                    subjectId: staffId,
                    dateBucket,
                });
            }
            for (const resId of resourceIds) {
                keys.push({
                    organizationId,
                    subjectType: 'RESOURCE',
                    subjectId: resId,
                    dateBucket,
                });
            }
            if (capacityServiceId) {
                keys.push({
                    organizationId,
                    subjectType: 'CAPACITY',
                    subjectId: capacityServiceId,
                    dateBucket,
                });
            }
        }

        return this.sortGuardKeys(keys);
    }

    /**
     * Sorts guard keys deterministically to eliminate deadlocks (Architecture §42 & §242)
     */
    sortGuardKeys(keys: GuardKey[]): GuardKey[] {
        return [...keys].sort((a, b) => {
            const keyA = `${a.organizationId}:${a.subjectType}:${a.subjectId}:${a.dateBucket}`;
            const keyB = `${b.organizationId}:${b.subjectType}:${b.subjectId}:${b.dateBucket}`;
            return keyA.localeCompare(keyB);
        });
    }

    /**
     * Acquires pessimistic row locks (SELECT FOR UPDATE) inside a PostgreSQL transaction.
     * Guarantees guard rows exist using INSERT ON CONFLICT DO NOTHING.
     */
    async acquireGuardsInTx(
        tx: Prisma.TransactionClient,
        guardKeys: GuardKey[],
    ): Promise<void> {
        if (guardKeys.length === 0) return;

        const sorted = this.sortGuardKeys(guardKeys);

        // Step 1: Ensure all guard rows exist in DB (Insert on conflict)
        for (const key of sorted) {
            await tx.$executeRaw`
        INSERT INTO "schedule_guards" ("id", "organizationId", "subjectType", "subjectId", "dateBucket", "createdAt")
        VALUES (gen_random_uuid(), ${key.organizationId}::uuid, ${key.subjectType}, ${key.subjectId}, ${key.dateBucket}, NOW())
        ON CONFLICT ("organizationId", "subjectType", "subjectId", "dateBucket") DO NOTHING;
      `;
        }

        // Step 2: Lock guard rows in sorted order via SELECT ... FOR UPDATE
        for (const key of sorted) {
            await tx.$executeRaw`
        SELECT "id" FROM "schedule_guards"
        WHERE "organizationId" = ${key.organizationId}::uuid
          AND "subjectType" = ${key.subjectType}
          AND "subjectId" = ${key.subjectId}
          AND "dateBucket" = ${key.dateBucket}
        FOR UPDATE;
      `;
        }
    }

    /**
     * Helper to derive array of YYYY-MM-DD local date buckets between startAt and endAt
     */
    private getDateBuckets(startAt: Date, endAt: Date): string[] {
        const buckets = new Set<string>();
        const curr = new Date(startAt);
        const end = new Date(endAt);

        // Format YYYY-MM-DD
        while (curr <= end) {
            const year = curr.getUTCFullYear();
            const month = String(curr.getUTCMonth() + 1).padStart(2, '0');
            const day = String(curr.getUTCDate()).padStart(2, '0');
            buckets.add(`${year}-${month}-${day}`);
            curr.setUTCDate(curr.getUTCDate() + 1);
        }
        return Array.from(buckets);
    }
}
