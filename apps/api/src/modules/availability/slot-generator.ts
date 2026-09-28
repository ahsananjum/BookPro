import { Injectable } from "@nestjs/common";
import { CandidateSlot } from "@bookpro/contracts";
import { TimeInterval, Instant } from "@bookpro/server-core";

@Injectable()
export class SlotGenerator {
    generateCandidateSlots(
        availableIntervals: TimeInterval[],
        serviceDurationMin: number,
        preBufferMin: number,
        postBufferMin: number,
        stepMinutes: number,
        minNoticeInstant: Instant,
        maxNoticeInstant: Instant,
        presentationTimezone: string,
        locationId: string,
        serviceId: string,
        staffId: string,
        staffName: string,
        serviceCapacity: number,
        allocatedResourceIds: string[] = [],
    ): CandidateSlot[] {
        const slots: CandidateSlot[] = [];

        for (const availInt of availableIntervals) {
            let candidateStart = availInt.start;

            while (candidateStart.addMinutes(serviceDurationMin).isBeforeOrEqual(availInt.end)) {
                const serviceEnd = candidateStart.addMinutes(serviceDurationMin);

                // Service itself must fit within the available interval
                const fitsService =
                    availInt.start.isBeforeOrEqual(candidateStart) &&
                    availInt.end.isAfterOrEqual(serviceEnd);

                // Buffer checks: Pre-buffer only constrains if preceded by busy time within shift (not at shift start)
                const preBufferOk =
                    preBufferMin === 0 ||
                    availInt.start.equals(candidateStart) ||
                    availInt.start.isBeforeOrEqual(candidateStart.addMinutes(-preBufferMin));

                // Post-buffer check: Post-buffer only constrains if followed by busy time within shift (not at shift end)
                const postBufferOk =
                    postBufferMin === 0 ||
                    availInt.end.equals(serviceEnd) ||
                    availInt.end.isAfterOrEqual(candidateStart.addMinutes(serviceDurationMin + postBufferMin));

                const isFullyAvailable = fitsService && preBufferOk && postBufferOk;

                const isFuture = candidateStart.toDate().getTime() > Date.now();
                const meetsPolicy =
                    candidateStart.isAfterOrEqual(minNoticeInstant) &&
                    candidateStart.isBeforeOrEqual(maxNoticeInstant);

                if (isFullyAvailable && meetsPolicy && isFuture) {
                    const serviceEnd = candidateStart.addMinutes(serviceDurationMin);
                    const formattedStart = this.formatInTimezone(candidateStart.toDate(), presentationTimezone);
                    const formattedEnd = this.formatInTimezone(serviceEnd.toDate(), presentationTimezone);

                    slots.push({
                        startTime: candidateStart.toIso(),
                        endTime: serviceEnd.toIso(),
                        formattedStartTime: formattedStart,
                        formattedEndTime: formattedEnd,
                        presentationTimezone,
                        staffId,
                        staffName,
                        locationId,
                        serviceId,
                        availableCapacity: serviceCapacity,
                        allocatedResourceIds,
                    });
                }

                candidateStart = candidateStart.addMinutes(stepMinutes);
            }
        }

        return slots;
    }

    private formatInTimezone(date: Date, timeZone: string): string {
        return new Intl.DateTimeFormat("en-US", {
            timeZone,
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        }).format(date);
    }
}
