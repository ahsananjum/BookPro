import { Injectable } from "@nestjs/common";
import {
    LocalDate,
    LocalTime,
    LocalDateTime,
    TimeInterval,
    Instant,
    resolveLocalToInstant,
} from "@bookpro/server-core";

export interface StaffAvailabilityItem {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    locationId?: string | null;
}

export interface StaffBreakItem {
    dayOfWeek: number | null;
    startTime: string;
    endTime: string;
}

@Injectable()
export class StaffAvailabilityBuilder {
    /**
     * Computes available working intervals for a staff member on a specific date,
     * intersecting staff recurring schedule with operating windows across [date - 1, date]
     * to support cross-midnight shifts and breaks, prioritizing location-specific shifts,
     * and subtracting breaks, approved leaves, and manual schedule blocks.
     */
    buildStaffWorkingIntervals(
        date: LocalDate,
        locationTimezone: string,
        operatingWindows: TimeInterval[],
        staffAvailabilities: StaffAvailabilityItem[] = [],
        staffBreaks: StaffBreakItem[] = [],
        staffLeaves: { startDate: Date; endDate: Date }[] = [],
        scheduleBlocks: { startAt: Date; endAt: Date; staffId?: string | null }[] = [],
        staffId: string,
        targetLocationId?: string | null,
    ): TimeInterval[] {
        if (operatingWindows.length === 0) {
            return [];
        }

        // 1. Filter staff availabilities by location priority per day of week if targetLocationId provided
        let candidateAvails = staffAvailabilities;
        if (targetLocationId) {
            const dayMap = new Map<number, StaffAvailabilityItem[]>();
            for (const item of staffAvailabilities) {
                const list = dayMap.get(item.dayOfWeek) || [];
                list.push(item);
                dayMap.set(item.dayOfWeek, list);
            }

            candidateAvails = [];
            for (const [, items] of dayMap.entries()) {
                const locSpecific = items.filter((s) => s.locationId && s.locationId === targetLocationId);
                if (locSpecific.length > 0) {
                    candidateAvails.push(...locSpecific);
                } else {
                    const orgWide = items.filter((s) => !s.locationId);
                    candidateAvails.push(...orgWide);
                }
            }
        }

        let rawStaffIntervals: TimeInterval[] = [];

        if (staffAvailabilities.length === 0) {
            // Default to location operating windows only if no custom recurring schedule configured at all
            rawStaffIntervals = [...operatingWindows];
        } else {
            const shiftIntervals: TimeInterval[] = [];

            // A. Check previous day (date - 1) shifts that cross midnight into target date
            const prevDate = date.minusDays(1);
            const prevDayOfWeek = prevDate.getDayOfWeek();
            const prevShifts = candidateAvails.filter((s) => s.dayOfWeek === prevDayOfWeek);
            for (const s of prevShifts) {
                const sStartTime = LocalTime.parse(s.startTime);
                const sEndTime = LocalTime.parse(s.endTime);
                if (!sEndTime.isAfter(sStartTime)) {
                    // Crosses midnight
                    const sStartLocal = new LocalDateTime(prevDate, sStartTime);
                    const sEndLocal = new LocalDateTime(date, sEndTime);
                    const sStartInstant = resolveLocalToInstant(sStartLocal, locationTimezone);
                    const sEndInstant = resolveLocalToInstant(sEndLocal, locationTimezone);
                    if (sEndInstant.isAfter(sStartInstant)) {
                        shiftIntervals.push(new TimeInterval(sStartInstant, sEndInstant));
                    }
                }
            }

            // B. Check current day (date) shifts
            const dayOfWeekNum = date.getDayOfWeek();
            const currentShifts = candidateAvails.filter((s) => s.dayOfWeek === dayOfWeekNum);
            for (const s of currentShifts) {
                const sStartTime = LocalTime.parse(s.startTime);
                const sEndTime = LocalTime.parse(s.endTime);

                const sStartLocal = new LocalDateTime(date, sStartTime);
                let sEndLocal: LocalDateTime;
                if (!sEndTime.isAfter(sStartTime)) {
                    sEndLocal = new LocalDateTime(date.plusDays(1), sEndTime);
                } else {
                    sEndLocal = new LocalDateTime(date, sEndTime);
                }

                const sStartInstant = resolveLocalToInstant(sStartLocal, locationTimezone);
                const sEndInstant = resolveLocalToInstant(sEndLocal, locationTimezone);
                if (sEndInstant.isAfter(sStartInstant)) {
                    shiftIntervals.push(new TimeInterval(sStartInstant, sEndInstant));
                }
            }

            if (shiftIntervals.length === 0) {
                // Staff has defined schedule but not scheduled to work on this day
                return [];
            }

            const normalizedShifts = TimeInterval.normalizeSet(shiftIntervals);
            rawStaffIntervals = TimeInterval.intersectSets(operatingWindows, normalizedShifts);
        }

        if (rawStaffIntervals.length === 0) return [];

        // 2. Build subtrahends: breaks, leaves, schedule blocks
        const breakSubtrahends: TimeInterval[] = [];

        // A. Breaks from previous day that cross midnight into target date
        const prevDate = date.minusDays(1);
        const prevDayOfWeek = prevDate.getDayOfWeek();
        for (const b of staffBreaks) {
            if (b.dayOfWeek === null || b.dayOfWeek === prevDayOfWeek) {
                const bStartTime = LocalTime.parse(b.startTime);
                const bEndTime = LocalTime.parse(b.endTime);
                if (!bEndTime.isAfter(bStartTime)) {
                    const bStartLocal = new LocalDateTime(prevDate, bStartTime);
                    const bEndLocal = new LocalDateTime(date, bEndTime);
                    const bStartInstant = resolveLocalToInstant(bStartLocal, locationTimezone);
                    const bEndInstant = resolveLocalToInstant(bEndLocal, locationTimezone);
                    if (bEndInstant.isAfter(bStartInstant)) {
                        breakSubtrahends.push(new TimeInterval(bStartInstant, bEndInstant));
                    }
                }
            }
        }

        // B. Breaks from current day
        const dayOfWeekNum = date.getDayOfWeek();
        for (const b of staffBreaks) {
            if (b.dayOfWeek === null || b.dayOfWeek === dayOfWeekNum) {
                const bStartTime = LocalTime.parse(b.startTime);
                const bEndTime = LocalTime.parse(b.endTime);

                const bStartLocal = new LocalDateTime(date, bStartTime);
                let bEndLocal: LocalDateTime;
                if (!bEndTime.isAfter(bStartTime)) {
                    bEndLocal = new LocalDateTime(date.plusDays(1), bEndTime);
                } else {
                    bEndLocal = new LocalDateTime(date, bEndTime);
                }

                const bStartInstant = resolveLocalToInstant(bStartLocal, locationTimezone);
                const bEndInstant = resolveLocalToInstant(bEndLocal, locationTimezone);
                if (bEndInstant.isAfter(bStartInstant)) {
                    breakSubtrahends.push(new TimeInterval(bStartInstant, bEndInstant));
                }
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
