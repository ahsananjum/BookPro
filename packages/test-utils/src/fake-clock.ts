export class FakeClock {
    private currentTime: Date;

    constructor(initialTime?: Date | string) {
        this.currentTime = initialTime ? new Date(initialTime) : new Date("2026-08-20T10:00:00.000Z");
    }

    now(): Date {
        return new Date(this.currentTime);
    }

    isoNow(): string {
        return this.currentTime.toISOString();
    }

    advanceMinutes(minutes: number): Date {
        this.currentTime = new Date(this.currentTime.getTime() + minutes * 60 * 1000);
        return this.now();
    }

    advanceHours(hours: number): Date {
        return this.advanceMinutes(hours * 60);
    }

    setTime(time: Date | string): void {
        this.currentTime = new Date(time);
    }
}
