/**
 * BookPro Domain Time Primitives
 * Architecture §§30-33, ADR-0003
 */

export interface Clock {
    now(): Instant;
}

export class SystemClock implements Clock {
    now(): Instant {
        return Instant.now();
    }
}

export class FixedClock implements Clock {
    private currentInstant: Instant;

    constructor(instant: Instant) {
        this.currentInstant = instant;
    }

    now(): Instant {
        return this.currentInstant;
    }

    set(instant: Instant): void {
        this.currentInstant = instant;
    }

    advanceMs(ms: number): void {
        this.currentInstant = Instant.fromEpochMs(this.currentInstant.toEpochMs() + ms);
    }
}

export class Instant {
    private readonly date: Date;

    private constructor(date: Date) {
        if (isNaN(date.getTime())) {
            throw new Error("Invalid Instant date value");
        }
        this.date = new Date(date.getTime());
    }

    static now(): Instant {
        return new Instant(new Date());
    }

    static fromIso(isoString: string): Instant {
        return new Instant(new Date(isoString));
    }

    static fromDate(date: Date): Instant {
        return new Instant(date);
    }

    static fromEpochMs(ms: number): Instant {
        return new Instant(new Date(ms));
    }

    toIso(): string {
        return this.date.toISOString();
    }

    toDate(): Date {
        return new Date(this.date.getTime());
    }

    toEpochMs(): number {
        return this.date.getTime();
    }

    equals(other: Instant): boolean {
        return this.toEpochMs() === other.toEpochMs();
    }

    isBefore(other: Instant): boolean {
        return this.toEpochMs() < other.toEpochMs();
    }

    isAfter(other: Instant): boolean {
        return this.toEpochMs() > other.toEpochMs();
    }

    isBeforeOrEqual(other: Instant): boolean {
        return this.toEpochMs() <= other.toEpochMs();
    }

    isAfterOrEqual(other: Instant): boolean {
        return this.toEpochMs() >= other.toEpochMs();
    }

    addMinutes(minutes: number): Instant {
        return new Instant(new Date(this.date.getTime() + minutes * 60 * 1000));
    }

    addMs(ms: number): Instant {
        return new Instant(new Date(this.date.getTime() + ms));
    }
}

export class LocalDate {
    constructor(
        public readonly year: number,
        public readonly month: number, // 1-12
        public readonly day: number,   // 1-31
    ) {
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            throw new Error(`Invalid LocalDate parameters: ${year}-${month}-${day}`);
        }
    }

    static parse(dateStr: string): LocalDate {
        const parts = dateStr.split("-").map((p) => parseInt(p, 10));
        if (parts.length !== 3 || parts.some(isNaN)) {
            throw new Error(`Invalid LocalDate format: ${dateStr}, expected YYYY-MM-DD`);
        }
        return new LocalDate(parts[0], parts[1], parts[2]);
    }

    toString(): string {
        const m = this.month.toString().padStart(2, "0");
        const d = this.day.toString().padStart(2, "0");
        return `${this.year}-${m}-${d}`;
    }

    getDayOfWeek(): number {
        // 0 = Sunday, 1 = Monday, ..., 6 = Saturday (computed in UTC calendar frame without local offset drift)
        return new Date(Date.UTC(this.year, this.month - 1, this.day)).getUTCDay();
    }

    equals(other: LocalDate): boolean {
        return this.year === other.year && this.month === other.month && this.day === other.day;
    }
}

export class LocalTime {
    constructor(
        public readonly hour: number,   // 0-23
        public readonly minute: number, // 0-59
        public readonly second: number = 0,
    ) {
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
            throw new Error(`Invalid LocalTime parameters: ${hour}:${minute}:${second}`);
        }
    }

    static parse(timeStr: string): LocalTime {
        const parts = timeStr.split(":").map((p) => parseInt(p, 10));
        if (parts.length < 2 || parts.some(isNaN)) {
            throw new Error(`Invalid LocalTime format: ${timeStr}, expected HH:mm or HH:mm:ss`);
        }
        return new LocalTime(parts[0], parts[1], parts[2] || 0);
    }

    toMinutesOfDay(): number {
        return this.hour * 60 + this.minute;
    }

    toString(): string {
        const h = this.hour.toString().padStart(2, "0");
        const m = this.minute.toString().padStart(2, "0");
        return `${h}:${m}`;
    }

    isBefore(other: LocalTime): boolean {
        return this.toMinutesOfDay() < other.toMinutesOfDay();
    }

    isAfter(other: LocalTime): boolean {
        return this.toMinutesOfDay() > other.toMinutesOfDay();
    }
}

export class LocalDateTime {
    constructor(
        public readonly date: LocalDate,
        public readonly time: LocalTime,
    ) { }

    toString(): string {
        return `${this.date.toString()}T${this.time.toString()}`;
    }
}

export function isValidIanaTimezone(timeZone: string): boolean {
    try {
        Intl.DateTimeFormat(undefined, { timeZone });
        return true;
    } catch {
        return false;
    }
}

/**
 * Resolves wall-clock local date/time in an IANA timezone to a concrete UTC Instant.
 * Handles DST gaps (spring forward) and ambiguous times (fall back).
 */
export function resolveLocalToInstant(
    local: LocalDateTime,
    timeZone: string,
    disambiguation: "earlier" | "later" = "earlier",
): Instant {
    if (!isValidIanaTimezone(timeZone)) {
        throw new Error(`Invalid IANA timezone: ${timeZone}`);
    }

    const d = local.date;
    const t = local.time;

    // Construct nominal UTC date
    const utcGuess = new Date(Date.UTC(d.year, d.month - 1, d.day, t.hour, t.minute, t.second));

    // Determine wall-clock time offset for that target zone
    const getOffsetMs = (targetDate: Date): number => {
        const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hour12: false,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
        const parts = formatter.formatToParts(targetDate);
        const partMap: Record<string, string> = {};
        for (const p of parts) {
            partMap[p.type] = p.value;
        }
        const year = parseInt(partMap.year, 10);
        const month = parseInt(partMap.month, 10);
        const day = parseInt(partMap.day, 10);
        let hour = parseInt(partMap.hour, 10);
        if (hour === 24) hour = 0;
        const minute = parseInt(partMap.minute, 10);
        const second = parseInt(partMap.second, 10);

        const wallInUtc = Date.UTC(year, month - 1, day, hour, minute, second);
        return wallInUtc - targetDate.getTime();
    };

    const offsetMs = getOffsetMs(utcGuess);
    let resolvedMs = utcGuess.getTime() - offsetMs;
    const recheckOffsetMs = getOffsetMs(new Date(resolvedMs));

    if (offsetMs !== recheckOffsetMs) {
        if (disambiguation === "later") {
            resolvedMs = utcGuess.getTime() - recheckOffsetMs;
        }
    }

    return Instant.fromEpochMs(resolvedMs);
}

/**
 * TimeInterval abstraction representing a half-open interval [start, end).
 * Architecture §33 & §36
 */
export class TimeInterval {
    constructor(
        public readonly start: Instant,
        public readonly end: Instant,
    ) {
        if (end.isBefore(start)) {
            throw new Error(
                `Invalid TimeInterval: start (${start.toIso()}) must be <= end (${end.toIso()})`,
            );
        }
    }

    get durationMinutes(): number {
        return Math.round((this.end.toEpochMs() - this.start.toEpochMs()) / (60 * 1000));
    }

    get durationMs(): number {
        return this.end.toEpochMs() - this.start.toEpochMs();
    }

    contains(instant: Instant): boolean {
        return instant.isAfterOrEqual(this.start) && instant.isBefore(this.end);
    }

    intersects(other: TimeInterval): boolean {
        // Architecture §36: candidate.start < existing.end AND candidate.end > existing.start
        return this.start.isBefore(other.end) && this.end.isAfter(other.start);
    }

    intersection(other: TimeInterval): TimeInterval | null {
        if (!this.intersects(other)) {
            return null;
        }
        const maxStart = this.start.isAfter(other.start) ? this.start : other.start;
        const minEnd = this.end.isBefore(other.end) ? this.end : other.end;
        return new TimeInterval(maxStart, minEnd);
    }

    /**
     * Subtracts another interval `sub` from this interval.
     * Returns 0, 1, or 2 remaining sub-intervals.
     */
    subtract(sub: TimeInterval): TimeInterval[] {
        if (!this.intersects(sub)) {
            return [this];
        }
        const result: TimeInterval[] = [];
        if (this.start.isBefore(sub.start)) {
            result.push(new TimeInterval(this.start, sub.start));
        }
        if (this.end.isAfter(sub.end)) {
            result.push(new TimeInterval(sub.end, this.end));
        }
        return result;
    }

    /**
     * Normalizes a set of intervals: sorts by start time and merges overlapping/adjacent intervals.
     */
    static normalizeSet(intervals: TimeInterval[]): TimeInterval[] {
        if (intervals.length === 0) return [];
        const sorted = [...intervals].sort((a, b) => a.start.toEpochMs() - b.start.toEpochMs());
        const result: TimeInterval[] = [sorted[0]];

        for (let i = 1; i < sorted.length; i++) {
            const current = sorted[i];
            const last = result[result.length - 1];

            if (current.start.isBeforeOrEqual(last.end)) {
                // Merge
                const maxEnd = current.end.isAfter(last.end) ? current.end : last.end;
                result[result.length - 1] = new TimeInterval(last.start, maxEnd);
            } else {
                result.push(current);
            }
        }
        return result;
    }

    /**
     * Subtracts a list of subtrahend intervals from a list of base intervals.
     */
    static subtractSet(base: TimeInterval[], subtrahends: TimeInterval[]): TimeInterval[] {
        let currentBase = TimeInterval.normalizeSet(base);
        const normalizedSub = TimeInterval.normalizeSet(subtrahends);

        for (const sub of normalizedSub) {
            const nextBase: TimeInterval[] = [];
            for (const b of currentBase) {
                nextBase.push(...b.subtract(sub));
            }
            currentBase = nextBase;
        }
        return TimeInterval.normalizeSet(currentBase);
    }

    /**
     * Intersects two sets of intervals.
     */
    static intersectSets(setA: TimeInterval[], setB: TimeInterval[]): TimeInterval[] {
        const normA = TimeInterval.normalizeSet(setA);
        const normB = TimeInterval.normalizeSet(setB);
        const result: TimeInterval[] = [];

        for (const a of normA) {
            for (const b of normB) {
                const inter = a.intersection(b);
                if (inter && inter.durationMs > 0) {
                    result.push(inter);
                }
            }
        }
        return TimeInterval.normalizeSet(result);
    }
}
