import { Injectable } from "@nestjs/common";
import {
    LocalDate,
    LocalTime,
    LocalDateTime,
    TimeInterval,
    Instant,
    resolveLocalToInstant,
    resolveInstantToLocalDate,
} from "@bookpro/server-core";

export interface OperatingHourRule {
    dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
    startTime: string; // "HH:mm"
    endTime: string;   // "HH:mm"
    isClosed?: boolean;
}

const DAY_NAME_TO_NUM: Record<string, number> = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
};

export function normalizeOperatingHours(raw: any): OperatingHourRule[] {
    if (!raw) {
        // Default Mon-Sun 08:00 - 20:00 when unconfigured
        return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
            dayOfWeek,
            startTime: "08:00",
            endTime: "20:00",
            isClosed: false,
        }));
    }

    if (Array.isArray(raw)) {
        if (raw.length === 0) {
            return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                dayOfWeek,
                startTime: "08:00",
                endTime: "20:00",
                isClosed: false,
            }));
        }
        return raw.map((item: any) => ({
            dayOfWeek: Number(item.dayOfWeek ?? item.day ?? 0),
            startTime: item.startTime || item.start || item.open || "09:00",
            endTime: item.endTime || item.end || item.close || "18:00",
            isClosed: Boolean(item.isClosed || item.closed),
        }));
    }

    if (typeof raw === "object") {
        const rules: OperatingHourRule[] = [];
        for (const [key, val] of Object.entries(raw)) {
            const dayNum = DAY_NAME_TO_NUM[key.toLowerCase()];
            if (dayNum === undefined) continue;

            if (Array.isArray(val)) {
                for (const interval of val) {
                    if (interval && (interval.start || interval.open) && (interval.end || interval.close)) {
                        rules.push({
                            dayOfWeek: dayNum,
                            startTime: interval.start || interval.open,
                            endTime: interval.end || interval.close,
                            isClosed: false,
                        });
                    }
                }
            } else if (typeof val === "object" && val !== null) {
                const item = val as any;
                if (item.active !== false && (item.open || item.start) && (item.close || item.end)) {
                    rules.push({
                        dayOfWeek: dayNum,
                        startTime: item.open || item.start,
                        endTime: item.close || item.end,
                        isClosed: false,
                    });
                } else if (item.active === false) {
                    rules.push({
                        dayOfWeek: dayNum,
                        startTime: "09:00",
                        endTime: "18:00",
                        isClosed: true,
                    });
                }
            }
        }
        if (rules.length > 0) return rules;
    }

    // Default fallback
    return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        dayOfWeek,
        startTime: "08:00",
        endTime: "20:00",
        isClosed: false,
    }));
}

@Injectable()
export class EffectiveOperatingWindowBuilder {
    /**
     * Builds effective operating window intervals for a given date in the location timezone,
     * evaluating a multi-day frame [date - 1, date] to seamlessly capture cross-midnight hours,
     * while normalizing timezone-safe location holiday closures.
     */
    buildOperatingWindows(
        date: LocalDate,
        locationTimezone: string,
        operatingHours: any,
        holidays: { date: Date; isClosed: boolean; name?: string }[] = [],
    ): TimeInterval[] {
        const isClosedOnDate = (d: LocalDate): boolean => {
            return (holidays || []).some((h) => {
                try {
                    const hLocalDate = resolveInstantToLocalDate(Instant.fromDate(new Date(h.date)), locationTimezone);
                    return hLocalDate.equals(d) && h.isClosed;
                } catch {
                    const hDate = new Date(h.date);
                    return (
                        hDate.getUTCFullYear() === d.year &&
                        hDate.getUTCMonth() + 1 === d.month &&
                        hDate.getUTCDate() === d.day &&
                        h.isClosed
                    );
                }
            });
        };

        if (isClosedOnDate(date)) {
            return [];
        }

        const normalizedRules = normalizeOperatingHours(operatingHours);
        const windows: TimeInterval[] = [];

        // 1. Check previous day (date - 1) for overnight shifts that cross into target date
        const prevDate = date.minusDays(1);
        if (!isClosedOnDate(prevDate)) {
            const prevDayOfWeek = prevDate.getDayOfWeek();
            const prevRules = normalizedRules.filter((r) => r.dayOfWeek === prevDayOfWeek && !r.isClosed);
            for (const rule of prevRules) {
                const startTime = LocalTime.parse(rule.startTime);
                const endTime = LocalTime.parse(rule.endTime);
                // Only consider rules that cross midnight into date
                if (!endTime.isAfter(startTime)) {
                    const startLocal = new LocalDateTime(prevDate, startTime);
                    const endLocal = new LocalDateTime(date, endTime);
                    const startInstant = resolveLocalToInstant(startLocal, locationTimezone);
                    const endInstant = resolveLocalToInstant(endLocal, locationTimezone);
                    if (endInstant.isAfter(startInstant)) {
                        windows.push(new TimeInterval(startInstant, endInstant));
                    }
                }
            }
        }

        // 2. Check current day (date) rules
        const dayOfWeekNum = date.getDayOfWeek();
        const rulesForDay = normalizedRules.filter((h) => h.dayOfWeek === dayOfWeekNum && !h.isClosed);

        for (const rule of rulesForDay) {
            const startTime = LocalTime.parse(rule.startTime);
            const endTime = LocalTime.parse(rule.endTime);

            const startLocal = new LocalDateTime(date, startTime);
            let endLocal: LocalDateTime;
            if (!endTime.isAfter(startTime)) {
                endLocal = new LocalDateTime(date.plusDays(1), endTime);
            } else {
                endLocal = new LocalDateTime(date, endTime);
            }

            const startInstant = resolveLocalToInstant(startLocal, locationTimezone);
            const endInstant = resolveLocalToInstant(endLocal, locationTimezone);

            if (endInstant.isAfter(startInstant)) {
                windows.push(new TimeInterval(startInstant, endInstant));
            }
        }

        return TimeInterval.normalizeSet(windows);
    }
}
