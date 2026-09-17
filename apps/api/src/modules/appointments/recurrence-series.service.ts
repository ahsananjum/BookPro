import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AppointmentService } from './appointment.service';
import { RecurrenceSeries } from '@prisma/client';

export interface CreateRecurrenceSeriesInput {
    organizationId: string;
    locationId: string;
    serviceId: string;
    staffId?: string | null;
    customerId: string;
    frequency: 'WEEKLY' | 'MONTHLY_DATE' | 'MONTHLY_WEEKDAY';
    interval?: number;
    byDay?: string | null;
    startAt: string;
    endAt?: string | null;
    occurrencesCount?: number;
    createdById: string;
}

@Injectable()
export class RecurrenceSeriesService {
    private readonly logger = new Logger(RecurrenceSeriesService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly appointmentService: AppointmentService,
    ) { }

    /**
     * Creates a RecurrenceSeries record and materializes occurrences up to a bounded horizon (Architecture §55 & PRD §26)
     */
    async createSeries(input: CreateRecurrenceSeriesInput): Promise<RecurrenceSeries> {
        const startAt = new Date(input.startAt);
        const interval = input.interval ?? 1;

        const series = await this.prisma.recurrenceSeries.create({
            data: {
                organizationId: input.organizationId,
                locationId: input.locationId,
                serviceId: input.serviceId,
                staffId: input.staffId || null,
                customerId: input.customerId,
                frequency: input.frequency,
                interval,
                byDay: input.byDay || null,
                startAt,
                endAt: input.endAt ? new Date(input.endAt) : null,
                occurrencesCount: input.occurrencesCount || null,
                status: 'ACTIVE',
            },
        });

        // Materialize bounded occurrences (max 12 occurrences horizon)
        const occurrencesToGenerate = Math.min(input.occurrencesCount || 12, 12);
        const service = await this.prisma.service.findUnique({
            where: { id: input.serviceId },
        });
        const durationMs = (service?.durationMin ?? 30) * 60 * 1000;

        let currentStart = new Date(startAt);
        let count = 0;

        while (count < occurrencesToGenerate) {
            const currentEnd = new Date(currentStart.getTime() + durationMs);

            try {
                await this.appointmentService.createManualAppointment({
                    organizationId: input.organizationId,
                    locationId: input.locationId,
                    serviceId: input.serviceId,
                    staffId: input.staffId,
                    customerId: input.customerId,
                    startAt: currentStart.toISOString(),
                    endAt: currentEnd.toISOString(),
                    createdById: input.createdById,
                    internalNotes: `Occurrence #${count + 1} of series ${series.id}`,
                });
            } catch (err: any) {
                this.logger.warn(
                    `Skipped recurring occurrence #${count + 1} at ${currentStart.toISOString()} due to conflict: ${err.message}`,
                );
            }

            count++;
            // Increment according to frequency
            if (input.frequency === 'WEEKLY') {
                currentStart.setUTCDate(currentStart.getUTCDate() + 7 * interval);
            } else {
                currentStart.setUTCMonth(currentStart.getUTCMonth() + interval);
            }
        }

        return series;
    }
}
