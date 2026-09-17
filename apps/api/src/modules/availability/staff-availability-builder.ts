import { Injectable } from "@nestjs/common";
import {
    LocalDate,
    LocalTime,
    LocalDateTime,
    TimeInterval,
    Instant,
    resolveLocalToInstant,
} from "@bookpro/server-core";

@Injectable()
export class StaffAvailabilityBuilder {
    /**
     * Computes available working intervals for a staff member on a specific date,
     * intersecting staff recurring schedule with operating windows and subtracting
     * staff breaks, approved leaves, and manual schedule blocks.
     */
    buildStaffWorkingIntervals(
        date: LocalDate,
        locationTimezone: string,
        operatingWindows: TimeInterval[],
        staffAvailabilities: { dayOfWeek: number; startTime: string; endTime: string }[] = [],
        staffBreaks: { dayOfWeek: number | null; startTime: string; endTime: string }[] = [],
        staffLeaves: { startDate: Date; endDate: Date }[] = [],
        scheduleBlocks: { startAt: Date; endAt: Date; staffId?: string | null }[] = [],
        staffId: string,
    ): TimeInterval[] {
        const dayOfWeekNum = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();

        const staffScheds = staffAvailabilities.filter((s) => s.dayOfWeek === dayOfWeekNum);
        let rawStaffIntervals: TimeInterval[] = [];

        if (staffAvailabilities.length === 0) {
            // Default to location operating windows only if no custom recurring schedule configured at all
            rawStaffIntervals = [...operatingWindows];
        } else if (staffScheds.length === 0) {
            // Staff has defined working days and this specific day is an off day
            return [];
        } else {
            for (const opWin of operatingWindows) {
                for (const sSched of staffScheds) {
                    const sStartLocal = new LocalDateTime(date, LocalTime.parse(sSched.startTime));
                    const sEndLocal = new LocalDateTime(date, LocalTime.parse(sSched.endTime));

                    const sStartInstant = resolveLocalToInstant(sStartLocal, locationTimezone);
                    const sEndInstant = resolveLocalToInstant(sEndLocal, locationTimezone);
                    const sInterval = new TimeInterval(sStartInstant, sEndInstant);

                    const intersect = opWin.intersection(sInterval);
                    if (intersect) {
                        rawStaffIntervals.push(intersect);
                    }
                }
            }
        }

        if (rawStaffIntervals.length === 0) return [];

        // Build subtrahends: breaks, leaves, schedule blocks
        const breakSubtrahends: TimeInterval[] = [];
        for (const b of staffBreaks) {
            if (b.dayOfWeek === null || b.dayOfWeek === dayOfWeekNum) {
                const bStartLocal = new LocalDateTime(date, LocalTime.parse(b.startTime));
                const bEndLocal = new LocalDateTime(date, LocalTime.parse(b.endTime));
                const bStartInstant = resolveLocalToInstant(bStartLocal, locationTimezone);
                const bEndInstant = resolveLocalToInstant(bEndLocal, locationTimezone);
                breakSubtrahends.push(new TimeInterval(bStartInstant, bEndInstant));
            }
        }

        const leaveSubtrahends: TimeInterval[] = staffLeaves.map(
            (l) => new TimeInterval(Instant.fromDate(l.startDate), Instant.fromDate(l.endDate)),
        );

        const blockSubtrahends: TimeInterval[] = scheduleBlocks
            .filter((b) => !b.staffId || b.staffId === staffId)
            .map((b) => new TimeInterval(Instant.fromDate(b.startAt), Instant.fromDate(b.endAt)));

        const allSubtrahends = TimeInterval.normalizeSet([
            ...breakSubtrahends,
            ...leaveSubtrahends,
            ...blockSubtrahends,
        ]);

        return TimeInterval.subtractSet(rawStaffIntervals, allSubtrahends);
    }
}
