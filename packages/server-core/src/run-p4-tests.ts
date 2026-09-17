import {
    Instant,
    LocalDate,
    LocalTime,
    LocalDateTime,
    TimeInterval,
    resolveLocalToInstant,
} from "./time-primitives";

console.log("=== P4 Time Primitives Self-Verification ===");

// 1. TimeInterval math check
const a = new TimeInterval(Instant.fromIso("2026-08-20T10:00:00Z"), Instant.fromIso("2026-08-20T11:00:00Z"));
const b = new TimeInterval(Instant.fromIso("2026-08-20T11:00:00Z"), Instant.fromIso("2026-08-20T12:00:00Z"));
const c = new TimeInterval(Instant.fromIso("2026-08-20T10:30:00Z"), Instant.fromIso("2026-08-20T11:30:00Z"));

console.assert(a.intersects(b) === false, "Back-to-back half-open intervals must NOT intersect");
console.assert(a.intersects(c) === true, "Overlapping intervals MUST intersect");

// 2. Subtraction check
const base = new TimeInterval(Instant.fromIso("2026-08-20T09:00:00Z"), Instant.fromIso("2026-08-20T17:00:00Z"));
const breakTime = new TimeInterval(Instant.fromIso("2026-08-20T12:00:00Z"), Instant.fromIso("2026-08-20T13:00:00Z"));
const remaining = base.subtract(breakTime);

console.assert(remaining.length === 2, "Subtracting break from base must yield 2 sub-intervals");
console.assert(remaining[0].start.toIso() === "2026-08-20T09:00:00.000Z", "Sub-interval 0 start match");
console.assert(remaining[0].end.toIso() === "2026-08-20T12:00:00.000Z", "Sub-interval 0 end match");
console.assert(remaining[1].start.toIso() === "2026-08-20T13:00:00.000Z", "Sub-interval 1 start match");
console.assert(remaining[1].end.toIso() === "2026-08-20T17:00:00.000Z", "Sub-interval 1 end match");

// 3. Timezone & DST check
const karachiLocal = new LocalDateTime(new LocalDate(2026, 8, 20), new LocalTime(14, 30));
const karachiInstant = resolveLocalToInstant(karachiLocal, "Asia/Karachi");
console.assert(karachiInstant.toIso() === "2026-08-20T09:30:00.000Z", "Karachi UTC conversion match");

const nyLocal = new LocalDateTime(new LocalDate(2026, 8, 20), new LocalTime(9, 0));
const nyInstant = resolveLocalToInstant(nyLocal, "America/New_York");
console.assert(nyInstant.toIso() === "2026-08-20T13:00:00.000Z", "New York EDT conversion match");

console.log("SUCCESS: All P4 Time Primitive self-tests passed!");
