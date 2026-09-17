import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';

export interface EmitOutboxEventInput {
    organizationId?: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    eventVersion?: number;
    payload: Record<string, any>;
    availableAt?: Date;
}

@Injectable()
export class OutboxService {
    private readonly logger = new Logger(OutboxService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Inserts an outbox event record inside an existing Prisma database transaction
     */
    async emitInTx(
        tx: Prisma.TransactionClient,
        input: EmitOutboxEventInput,
    ): Promise<void> {
        const organizationId = input.organizationId || input.payload?.organizationId;
        await tx.outboxEvent.create({
            data: {
                organizationId: organizationId || null,
                aggregateType: input.aggregateType,
                aggregateId: input.aggregateId,
                eventType: input.eventType,
                eventVersion: input.eventVersion || 1,
                payload: input.payload || {},
                availableAt: input.availableAt || new Date(),
                status: 'PENDING',
            },
        });

        this.logger.log(
            `Outbox event emitted in TX: ${input.aggregateType}.${input.eventType} [ID: ${input.aggregateId}, Org: ${organizationId || 'GLOBAL'}]`,
        );
    }

    /**
     * Standalone emit outbox event outside transaction
     */
    async emit(input: EmitOutboxEventInput): Promise<void> {
        const organizationId = input.organizationId || input.payload?.organizationId;
        await this.prisma.outboxEvent.create({
            data: {
                organizationId: organizationId || null,
                aggregateType: input.aggregateType,
                aggregateId: input.aggregateId,
                eventType: input.eventType,
                eventVersion: input.eventVersion || 1,
                payload: input.payload || {},
                availableAt: input.availableAt || new Date(),
                status: 'PENDING',
            },
        });
    }
}
