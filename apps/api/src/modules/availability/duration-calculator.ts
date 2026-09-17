import { Injectable } from "@nestjs/common";
import { Instant, TimeInterval } from "@bookpro/server-core";

export interface DurationBreakdown {
    serviceDurationMin: number;
    addOnsDurationMin: number;
    totalDurationMin: number;
    preBufferMin: number;
    postBufferMin: number;
    totalOccupiedMin: number;
}

@Injectable()
export class DurationCalculator {
    calculateDuration(
        serviceDurationMin: number,
        preBufferMin: number = 0,
        postBufferMin: number = 0,
        addOnDurations: number[] = [],
    ): DurationBreakdown {
        const addOnsDurationMin = addOnDurations.reduce((sum, d) => sum + d, 0);
        const totalDurationMin = serviceDurationMin + addOnsDurationMin;
        const totalOccupiedMin = preBufferMin + totalDurationMin + postBufferMin;

        return {
            serviceDurationMin,
            addOnsDurationMin,
            totalDurationMin,
            preBufferMin,
            postBufferMin,
            totalOccupiedMin,
        };
    }

    computeIntervals(
        startInstant: Instant,
        duration: DurationBreakdown,
    ): {
        serviceInterval: TimeInterval;
        occupiedInterval: TimeInterval;
    } {
        const serviceEnd = startInstant.addMinutes(duration.totalDurationMin);
        const occupiedStart = startInstant.addMinutes(-duration.preBufferMin);
        const occupiedEnd = startInstant.addMinutes(duration.totalDurationMin + duration.postBufferMin);

        return {
            serviceInterval: new TimeInterval(startInstant, serviceEnd),
            occupiedInterval: new TimeInterval(occupiedStart, occupiedEnd),
        };
    }
}
