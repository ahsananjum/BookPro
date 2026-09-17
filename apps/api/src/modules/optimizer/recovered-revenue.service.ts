import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { RecoveredRevenueStatsDto } from "@bookpro/contracts";

@Injectable()
export class RecoveredRevenueService {
    private readonly logger = new Logger(RecoveredRevenueService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Attributes recovered revenue to a finalized appointment.
     */
    async attributeRecoveredRevenue(
        organizationId: string,
        appointmentId: string,
        recoveredAmountCents: number
    ): Promise<void> {
        await this.prisma.appointment.update({
            where: { id: appointmentId },
            data: {
                recoveredRevenueCents: recoveredAmountCents,
            },
        });
        this.logger.log(`[RecoveredRevenue] Attributed $${(recoveredAmountCents / 100).toFixed(2)} to appointment ${appointmentId}`);
    }

    /**
     * Computes recovered revenue metrics and active optimizer opportunities.
     */
    async getRecoveredRevenueStats(organizationId: string): Promise<RecoveredRevenueStatsDto> {
        const [recoveredAppointments, activeInsights] = await Promise.all([
            this.prisma.appointment.findMany({
                where: {
                    organizationId,
                    recoveredRevenueCents: { not: null, gt: 0 },
                    status: { notIn: ["CANCELLED"] },
                },
                select: { recoveredRevenueCents: true },
            }),
            this.prisma.scheduleInsight.findMany({
                where: {
                    organizationId,
                    status: "ACTIVE",
                    startAt: { gt: new Date() },
                },
                select: { potentialRevenueCents: true },
            }),
        ]);

        const totalRecoveredRevenueCents = recoveredAppointments.reduce(
            (acc, curr) => acc + (curr.recoveredRevenueCents || 0),
            0
        );
        const recoveredBookingsCount = recoveredAppointments.length;
        const averageRecoveredBookingCents =
            recoveredBookingsCount > 0
                ? Math.round(totalRecoveredRevenueCents / recoveredBookingsCount)
                : 0;

        const activeOpportunitiesCount = activeInsights.length;
        const potentialRevenueCents = activeInsights.reduce(
            (acc, curr) => acc + (curr.potentialRevenueCents || 0),
            0
        );

        return {
            totalRecoveredRevenueCents,
            recoveredBookingsCount,
            averageRecoveredBookingCents,
            activeOpportunitiesCount,
            potentialRevenueCents,
        };
    }
}
