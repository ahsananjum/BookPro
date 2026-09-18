import { Injectable, Logger } from "@nestjs/common";
import {
    HoldJanitorService,
    OutboxDispatcherService,
    WaitlistJanitorService,
    IdempotencyJanitorService,
    AppointmentLifecycleJanitorService,
} from "@bookpro/worker";

@Injectable()
export class CronService {
    private readonly logger = new Logger(CronService.name);

    constructor(
        private readonly holdJanitor: HoldJanitorService,
        private readonly outboxDispatcher: OutboxDispatcherService,
        private readonly waitlistJanitor: WaitlistJanitorService,
        private readonly idempotencyJanitor: IdempotencyJanitorService,
        private readonly appointmentJanitor: AppointmentLifecycleJanitorService,
    ) { }

    async runAll() {
        this.logger.log("Executing scheduled worker cron cycle...");
        const [holds, outbox, reminders, waitlist, idempotency, lifecycle] = await Promise.allSettled([
            this.holdJanitor.cleanupExpiredHolds(),
            this.outboxDispatcher.pollAndDispatch(),
            this.outboxDispatcher.pollScheduledNotifications(),
            this.waitlistJanitor.cleanupExpiredWaitlist(),
            this.idempotencyJanitor.cleanupExpiredRecords(),
            this.appointmentJanitor.processLifecycleTransitions(),
        ]);

        return {
            cleanedHolds: holds.status === "fulfilled" ? holds.value : 0,
            dispatchedOutbox: outbox.status === "fulfilled" ? outbox.value : 0,
            remindersChecked: reminders.status === "fulfilled" ? true : false,
            waitlist: waitlist.status === "fulfilled" ? waitlist.value : null,
            idempotency: idempotency.status === "fulfilled" ? idempotency.value : 0,
            lifecycle: lifecycle.status === "fulfilled" ? lifecycle.value : null,
        };
    }
}
