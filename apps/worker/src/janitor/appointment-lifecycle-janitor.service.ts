import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class AppointmentLifecycleJanitorService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(AppointmentLifecycleJanitorService.name);
    private janitorTimer: NodeJS.Timeout | null = null;
    private isRunning = false;

    constructor(private readonly prisma: PrismaService) { }

    onModuleInit() {
        this.logger.log("Starting Appointment Lifecycle Janitor (interval: 60s)...");
        this.janitorTimer = setInterval(() => this.processLifecycleTransitions(), 60000);
    }

    onModuleDestroy() {
        if (this.janitorTimer) {
            clearInterval(this.janitorTimer);
        }
    }

    /**
     * Executes automatic lifecycle transitions:
     * 1. Auto-Start: CHECKED_IN where startAt <= now -> IN_PROGRESS
     * 2. Auto-Complete: IN_PROGRESS or CHECKED_IN where endAt <= now - 10m -> COMPLETED
     * 3. Auto-No-Show: CONFIRMED where startAt <= now - 30m -> NO_SHOW
     */
    async processLifecycleTransitions(): Promise<{ started: number; completed: number; noShow: number }> {
        if (this.isRunning) return { started: 0, completed: 0, noShow: 0 };
        this.isRunning = true;

        let started = 0;
        let completed = 0;
        let noShow = 0;

        try {
            const now = new Date();

            // 1. Auto-Start: CHECKED_IN -> IN_PROGRESS when startAt <= now
            const startCandidates = await this.prisma.appointment.findMany({
                where: {
                    status: "CHECKED_IN",
                    startAt: { lte: now },
                },
                select: { id: true, organizationId: true, status: true },
                take: 50,
            });

            for (const appt of startCandidates) {
                try {
                    await this.prisma.$transaction(async (tx) => {
                        const updated = await tx.appointment.updateMany({
                            where: { id: appt.id, status: "CHECKED_IN" },
                            data: { status: "IN_PROGRESS", version: { increment: 1 } },
                        });
                        if (updated.count > 0) {
                            await tx.appointmentHistory.create({
                                data: {
                                    appointmentId: appt.id,
                                    actorType: "SYSTEM",
                                    actorId: "LIFECYCLE_JANITOR",
                                    action: "STATUS_CHANGE",
                                    fromStatus: "CHECKED_IN",
                                    toStatus: "IN_PROGRESS",
                                    changes: { reason: "Automated session start on scheduled time" },
                                },
                            });
                            await tx.outboxEvent.create({
                                data: {
                                    organizationId: appt.organizationId,
                                    aggregateType: "Appointment",
                                    aggregateId: appt.id,
                                    eventType: "appointment.in_progress",
                                    payload: { appointmentId: appt.id, fromStatus: "CHECKED_IN", toStatus: "IN_PROGRESS" },
                                    status: "PENDING",
                                },
                            });
                            started++;
                        }
                    });
                } catch (e: any) {
                    this.logger.debug(`Auto-start skip ${appt.id}: ${e.message}`);
                }
            }

            // 2. Auto-Complete: IN_PROGRESS -> COMPLETED when endAt <= now
            const completeCandidates = await this.prisma.appointment.findMany({
                where: {
                    status: "IN_PROGRESS",
                    endAt: { lte: now },
                },
                select: { id: true, organizationId: true, status: true },
                take: 50,
            });

            for (const appt of completeCandidates) {
                try {
                    await this.prisma.$transaction(async (tx) => {
                        const updated = await tx.appointment.updateMany({
                            where: { id: appt.id, status: "IN_PROGRESS" },
                            data: { status: "COMPLETED", version: { increment: 1 } },
                        });
                        if (updated.count > 0) {
                            await tx.appointmentHistory.create({
                                data: {
                                    appointmentId: appt.id,
                                    actorType: "SYSTEM",
                                    actorId: "LIFECYCLE_JANITOR",
                                    action: "STATUS_CHANGE",
                                    fromStatus: appt.status,
                                    toStatus: "COMPLETED",
                                    changes: { reason: "Automated session completion after scheduled duration elapsed" },
                                },
                            });
                            await tx.outboxEvent.create({
                                data: {
                                    organizationId: appt.organizationId,
                                    aggregateType: "Appointment",
                                    aggregateId: appt.id,
                                    eventType: "appointment.completed",
                                    payload: { appointmentId: appt.id, fromStatus: appt.status, toStatus: "COMPLETED" },
                                    status: "PENDING",
                                },
                            });
                            completed++;
                        }
                    });
                } catch (e: any) {
                    this.logger.debug(`Auto-complete skip ${appt.id}: ${e.message}`);
                }
            }

            // 3. Auto-No-Show: CONFIRMED -> NO_SHOW when startAt <= now - 5m (never checked in within 5 minutes)
            const noShowCutoff = new Date(now.getTime() - 5 * 60 * 1000);
            const noShowCandidates = await this.prisma.appointment.findMany({
                where: {
                    status: "CONFIRMED",
                    startAt: { lte: noShowCutoff },
                },
                select: { id: true, organizationId: true },
                take: 50,
            });

            for (const appt of noShowCandidates) {
                try {
                    await this.prisma.$transaction(async (tx) => {
                        const updated = await tx.appointment.updateMany({
                            where: { id: appt.id, status: "CONFIRMED" },
                            data: { status: "NO_SHOW", version: { increment: 1 } },
                        });
                        if (updated.count > 0) {
                            await tx.appointmentHistory.create({
                                data: {
                                    appointmentId: appt.id,
                                    actorType: "SYSTEM",
                                    actorId: "LIFECYCLE_JANITOR",
                                    action: "STATUS_CHANGE",
                                    fromStatus: "CONFIRMED",
                                    toStatus: "NO_SHOW",
                                    changes: { reason: "Automated no-show transition: client did not check in within 5m grace period" },
                                },
                            });
                            await tx.outboxEvent.create({
                                data: {
                                    organizationId: appt.organizationId,
                                    aggregateType: "Appointment",
                                    aggregateId: appt.id,
                                    eventType: "appointment.no_show",
                                    payload: { appointmentId: appt.id, fromStatus: "CONFIRMED", toStatus: "NO_SHOW" },
                                    status: "PENDING",
                                },
                            });
                            noShow++;
                        }
                    });
                } catch (e: any) {
                    this.logger.debug(`Auto-no-show skip ${appt.id}: ${e.message}`);
                }
            }
        } finally {
            this.isRunning = false;
        }

        return { started, completed, noShow };
    }
}
