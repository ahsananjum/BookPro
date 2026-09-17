import {
    Instant,
    LocalDate,
    LocalTime,
    LocalDateTime,
    TimeInterval,
    resolveLocalToInstant,
} from "./time-primitives";

describe("Time Primitives", () => {
    describe("TimeInterval Math", () => {
        it("intersects half-open intervals correctly", () => {
            const a = new TimeInterval(Instant.fromIso("2026-08-20T10:00:00Z"), Instant.fromIso("2026-08-20T11:00:00Z"));
            const b = new TimeInterval(Instant.fromIso("2026-08-20T11:00:00Z"), Instant.fromIso("2026-08-20T12:00:00Z"));
            const c = new TimeInterval(Instant.fromIso("2026-08-20T10:30:00Z"), Instant.fromIso("2026-08-20T11:30:00Z"));

            expect(a.intersects(b)).toBe(false); // Back-to-back half-open does not intersect
            expect(a.intersects(c)).toBe(true);
        });

        it("subtracts overlapping intervals", () => {
            const base = new TimeInterval(Instant.fromIso("2026-08-20T09:00:00Z"), Instant.fromIso("2026-08-20T17:00:00Z"));
            const breakTime = new TimeInterval(Instant.fromIso("2026-08-20T12:00:00Z"), Instant.fromIso("2026-08-20T13:00:00Z"));

            const remaining = base.subtract(breakTime);
            expect(remaining.length).toBe(2);
            expect(remaining[0].start.toIso()).toBe("2026-08-20T09:00:00.000Z");
            expect(remaining[0].end.toIso()).toBe("2026-08-20T12:00:00.000Z");
            expect(remaining[1].start.toIso()).toBe("2026-08-20T13:00:00.000Z");
            expect(remaining[1].end.toIso()).toBe("2026-08-20T17:00:00.000Z");
        });
    });

    describe("DST & Timezone Resolver", () => {
        it("resolves local wall clock in Asia/Karachi (UTC+5)", () => {
            const local = new LocalDateTime(new LocalDate(2026, 8, 20), new LocalTime(14, 30));
            const instant = resolveLocalToInstant(local, "Asia/Karachi");
            expect(instant.toIso()).toBe("2026-08-20T09:30:00.000Z");
        });

        it("resolves local wall clock in America/New_York (EDT UTC-4)", () => {
            const local = new LocalDateTime(new LocalDate(2026, 8, 20), new LocalTime(9, 0));
            const instant = resolveLocalToInstant(local, "America/New_York");
            expect(instant.toIso()).toBe("2026-08-20T13:00:00.000Z");
        });
    });
});
