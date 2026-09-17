import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { NoShowRiskFactors, NoShowRiskSignalDto } from "@bookpro/contracts";

@Injectable()
export class NoShowSignalService {
    private readonly logger = new Logger(NoShowSignalService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Computes an explainable no-show risk signal for a customer.
     * Feature-gated per tenant; evaluates strictly permitted operational factors.
     */
    async calculateCustomerRiskSignal(
        organizationId: string,
        customerId: string,
        appointmentContext?: {
            startAt?: Date;
            createdAt?: Date;
            isDepositPaid?: boolean;
            isConfirmed?: boolean;
            leadTimeHours?: number;
        }
    ): Promise<NoShowRiskSignalDto> {
        const [org, customer] = await Promise.all([
            this.prisma.organization.findUnique({ where: { id: organizationId } }),
            this.prisma.customer.findUnique({
                where: { id: customerId },
                include: {
                    appointments: {
                        where: { organizationId },
                        orderBy: { startAt: "desc" },
                        take: 20,
                    },
                },
            }),
        ]);

        if (!customer) {
            throw new NotFoundException(`Customer ${customerId} not found.`);
        }

        // If feature is disabled by tenant, return low-risk default with explanation
        if (!org?.noShowSignalEnabled) {
            return {
                customerId,
                riskLevel: "LOW",
                riskScore: 0,
                factors: {
                    noShowCount: 0,
                    lateCancellationCount: 0,
                    depositPaid: true,
                    leadTimeHours: 24,
                    isUnconfirmed: false,
                },
                explanation: "No-Show Risk Signal is disabled by organization policy.",
                permittedFactorsOnly: true,
            };
        }

        // Calculate permitted operational factors ONLY
        const historicalAppointments = customer.appointments || [];
        const noShowCount = historicalAppointments.filter((a) => a.status === "NO_SHOW").length;
        const lateCancellationCount = historicalAppointments.filter((a) => a.status === "CANCELLED" && a.cancelReason?.includes("LATE")).length;

        const now = new Date();
        const startAt = appointmentContext?.startAt || now;
        const createdAt = appointmentContext?.createdAt || now;
        const leadTimeHours = Math.max(0, Math.round((startAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60)));

        const depositPaid = appointmentContext?.isDepositPaid ?? (customer.totalSpentCents > 0);
        const isUnconfirmed = appointmentContext?.isConfirmed !== undefined ? !appointmentContext.isConfirmed : false;

        let riskScore = 10; // Baseline low risk

        // Factor 1: Prior No-Shows (+30 per incident, max 60)
        riskScore += Math.min(60, noShowCount * 30);

        // Factor 2: Prior Late Cancellations (+15 per incident, max 30)
        riskScore += Math.min(30, lateCancellationCount * 15);

        // Factor 3: Deposit Status (No deposit on high lead time adds +15)
        if (!depositPaid && leadTimeHours > 48) {
            riskScore += 15;
        }

        // Factor 4: Unconfirmed booking (+15)
        if (isUnconfirmed) {
            riskScore += 15;
        }

        // Factor 5: Reliable history discount (-20 for 3+ completed appointments with 0 no-shows)
        if (customer.completedAppointmentsCount >= 3 && noShowCount === 0) {
            riskScore = Math.max(5, riskScore - 20);
        }

        riskScore = Math.min(100, Math.max(0, riskScore));

        let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";
        if (riskScore >= 60) {
            riskLevel = "HIGH";
        } else if (riskScore >= 35) {
            riskLevel = "MEDIUM";
        }

        // Generate explainable narrative
        const reasons: string[] = [];
        if (noShowCount > 0) reasons.push(`${noShowCount} previous no-show${noShowCount > 1 ? "s" : ""}`);
        if (lateCancellationCount > 0) reasons.push(`${lateCancellationCount} late cancellation${lateCancellationCount > 1 ? "s" : ""}`);
        if (!depositPaid) reasons.push("no deposit attached");
        if (isUnconfirmed) reasons.push("unconfirmed status");
        if (customer.completedAppointmentsCount >= 3 && noShowCount === 0) reasons.push("proven positive attendance record");

        const explanation =
            reasons.length > 0
                ? `${riskLevel} attendance risk based on: ${reasons.join(", ")}. Suggested action: send automated appointment reminder.`
                : "Low attendance risk. Standard booking workflow applies.";

        const factors: NoShowRiskFactors = {
            noShowCount,
            lateCancellationCount,
            depositPaid,
            leadTimeHours,
            isUnconfirmed,
        };

        return {
            customerId,
            riskLevel,
            riskScore,
            factors,
            explanation,
            permittedFactorsOnly: true,
        };
    }
}
