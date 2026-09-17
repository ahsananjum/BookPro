import { Injectable } from "@nestjs/common";
import {
    LocalDate,
    LocalTime,
    LocalDateTime,
    TimeInterval,
    resolveLocalToInstant,
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
     * excluding location holidays and handling cross-midnight shifts.
     */
    buildOperatingWindows(
        date: LocalDate,
        locationTimezone: string,
        operatingHours: any,
        holidays: { date: Date; isClosed: boolean }[] = [],
    ): TimeInterval[] {
        // Check if the date is closed due to a holiday
        const isHolidayClosed = (holidays || []).some((h) => {
            const hDate = new Date(h.date);
            return (
                hDate.getUTCFullYear() === date.year &&
                hDate.getUTCMonth() + 1 === date.month &&
                hDate.getUTCDate() === date.day &&
                h.isClosed
            );
        });

        if (isHolidayClosed) {
            return [];
        }

        const normalizedRules = normalizeOperatingHours(operatingHours);
        const dayOfWeekNum = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();

        const rulesForDay = normalizedRules.filter(
            (h) => h.dayOfWeek === dayOfWeekNum && !h.isClosed,
        );

        const windows: TimeInterval[] = [];

        for (const rule of rulesForDay) {
            const startTime = LocalTime.parse(rule.startTime);
            const endTime = LocalTime.parse(rule.endTime);

            const startLocal = new LocalDateTime(date, startTime);

            let endLocal: LocalDateTime;
            // Handle cross-midnight shift (e.g. 22:00 to 06:00)
            if (!endTime.isAfter(startTime)) {
                const nextDayDate = new LocalDate(date.year, date.month, date.day + 1);
                endLocal = new LocalDateTime(nextDayDate, endTime);
            } else {
                endLocal = new LocalDateTime(date, endTime);
            }

            const startInstant = resolveLocalToInstant(startLocal, locationTimezone);
            const endInstant = resolveLocalToInstant(endLocal, locationTimezone);

            windows.push(new TimeInterval(startInstant, endInstant));
        }

        return windows;
    }
}
