import { Injectable, NotFoundException, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { CommissionStatus, CommissionType, CommissionBasis } from "@prisma/client";
import { ExchangeRateService } from "../payments/exchange-rate.service";

@Injectable()
export class CommissionsService {
    private readonly logger = new Logger(CommissionsService.name);

    constructor(
        private readonly prisma: PrismaService,
        @Optional() private readonly realtimeService?: RealtimeService,
        @Optional() private readonly exchangeRateService?: ExchangeRateService,
    ) { }

    private async broadcastCommissionEvent(organizationId: string, eventType: string, payload: any) {
        if (!this.realtimeService) return;
        try {
            await this.realtimeService.broadcastEvent({
                type: eventType as any,
                organizationId,
                metadata: payload,
                timestamp: new Date().toISOString(),
            });
        } catch (err: any) {
            this.logger.warn(`Failed to broadcast realtime event ${eventType}: ${err.message}`);
        }
    }

    /**
     * Calculates and persists an immutable CommissionRecord snapshot for an appointment.
     */
    async calculateCommissionForAppointment(appointmentId: string) {
        const appointment = await this.prisma.appointment.findUnique({
            where: { id: appointmentId },
            include: {
                staff: true,
                service: true,
                paymentRecords: {
                    include: { refunds: true },
                },
            },
        });

        if (!appointment) {
            throw new NotFoundException(`Appointment ${appointmentId} not found`);
        }

        if (!appointment.staffId) {
            this.logger.log(`Appointment ${appointmentId} has no staff assigned. Skipping commission.`);
            return null;
        }

        // Check if commission record already calculated for this appointment
        const existingRecord = await this.prisma.commissionRecord.findFirst({
            where: { appointmentId },
            include: {
                staff: true,
                appointment: {
                    include: { service: true, customer: true },
                },
            },
        });
        if (existingRecord) {
            return existingRecord;
        }

        // Find staff-specific rule or fallback to org default rule
        let rule = await this.prisma.commissionRule.findFirst({
            where: {
                organizationId: appointment.organizationId,
                staffId: appointment.staffId,
                isActive: true,
            },
            orderBy: { createdAt: "desc" },
        });

        if (!rule) {
            rule = await this.prisma.commissionRule.findFirst({
                where: {
                    organizationId: appointment.organizationId,
                    staffId: null,
                    isActive: true,
                },
                orderBy: { createdAt: "desc" },
            });
        }

        if (!rule) {
            this.logger.log(
                `No active commission rule found for org ${appointment.organizationId} / staff ${appointment.staffId}`
            );
            return null;
        }

        // Determine calculation basis amount in minor units (cents)
        let priceSnapshotCents = appointment.priceCents;

        if (rule.calculationBasis === CommissionBasis.TOTAL_APPOINTMENT_PRICE && appointment.paymentRecords.length > 0) {
            const succeededPayment = appointment.paymentRecords.find((p) => p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED");
            if (succeededPayment) {
                const pMeta = (succeededPayment.metadata as any) || {};
                let paidInApptCurrency = succeededPayment.amountCents;
                if (pMeta.originalCurrency === appointment.currency && pMeta.originalAmountCents != null) {
                    paidInApptCurrency = Number(pMeta.originalAmountCents);
                } else if (pMeta.exchangeRate && succeededPayment.currency !== appointment.currency) {
                    paidInApptCurrency = Math.round(succeededPayment.amountCents / Number(pMeta.exchangeRate));
                }
                priceSnapshotCents = paidInApptCurrency;
            }
        }

        let calculatedAmountCents = 0;
        if (rule.calculationType === CommissionType.PERCENTAGE) {
            // rateValue in basis points (e.g., 2000 = 20.00%)
            const rateBps = rule.rateValue <= 100 ? rule.rateValue * 100 : rule.rateValue;
            calculatedAmountCents = Math.round((priceSnapshotCents * rateBps) / 10000);
        } else {
            // FIXED_AMOUNT in minor units
            calculatedAmountCents = rule.rateValue;
        }

        const commissionRecord = await this.prisma.commissionRecord.create({
            data: {
                organizationId: appointment.organizationId,
                appointmentId: appointment.id,
                staffId: appointment.staffId,
                commissionRuleId: rule.id,
                calculatedAmountCents,
                currency: appointment.currency || "USD",
                calculationBasisSnapshot: rule.calculationBasis,
                rateValueSnapshot: rule.rateValue,
                ruleVersionSnapshot: rule.ruleVersion,
                priceSnapshotCents,
                status: CommissionStatus.PENDING,
            },
            include: {
                staff: true,
                appointment: {
                    include: { service: true, customer: true },
                },
            },
        });

        await this.broadcastCommissionEvent(appointment.organizationId, "commission.calculated", {
            commissionId: commissionRecord.id,
            appointmentId: appointment.id,
            staffId: appointment.staffId,
            calculatedAmountCents,
        });

        return commissionRecord;
    }

    async listCommissionLedger(
        organizationId: string,
        query?: { staffId?: string; status?: string }
    ) {
        const where: any = { organizationId };

        if (query?.staffId) {
            where.staffId = query.staffId;
        }

        if (query?.status) {
            where.status = query.status as CommissionStatus;
        }

        const [records, org] = await Promise.all([
            this.prisma.commissionRecord.findMany({
                where,
                include: {
                    staff: {
                        include: {
                            membership: {
                                include: {
                                    user: { select: { fullName: true, email: true } },
                                },
                            },
                        },
                    },
                    appointment: {
                        include: {
                            service: true,
                            customer: true,
                            paymentRecords: {
                                include: { refunds: true },
                            },
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
            }),
            this.prisma.organization.findUnique({
                where: { id: organizationId },
                select: { currency: true },
            }),
        ]);

        const orgCurrency = org?.currency || "USD";

        return Promise.all(
            records.map(async (r) => {
                let convertedAmountCents = r.calculatedAmountCents;
                let convertedPriceSnapshotCents = r.priceSnapshotCents;

                if (r.currency !== orgCurrency && this.exchangeRateService) {
                    const convAmt = await this.exchangeRateService
                        .convertCurrency(r.calculatedAmountCents, r.currency, orgCurrency)
                        .catch(() => ({ convertedAmountCents: r.calculatedAmountCents }));
                    convertedAmountCents = convAmt.convertedAmountCents;

                    const convPrice = await this.exchangeRateService
                        .convertCurrency(r.priceSnapshotCents, r.currency, orgCurrency)
                        .catch(() => ({ convertedAmountCents: r.priceSnapshotCents }));
                    convertedPriceSnapshotCents = convPrice.convertedAmountCents;
                }

                return {
                    ...r,
                    convertedAmountCents,
                    convertedPriceSnapshotCents,
                    convertedCurrency: orgCurrency,
                };
            })
        );
    }

    async listCommissionRules(organizationId: string) {
        const rules = await this.prisma.commissionRule.findMany({
            where: { organizationId },
            include: {
                staff: {
                    select: {
                        id: true,
                        displayName: true,
                        title: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        return rules.map((r) => ({
            ...r,
            rate: r.rateValue,
            type: r.calculationType,
        }));
    }

    async createCommissionRule(
        organizationId: string,
        dto: {
            staffId?: string;
            name: string;
            calculationType: CommissionType;
            rateValue: number;
            calculationBasis?: CommissionBasis;
        }
    ) {
        const rule = await this.prisma.commissionRule.create({
            data: {
                organizationId,
                staffId: dto.staffId || null,
                name: dto.name,
                calculationType: dto.calculationType,
                rateValue: dto.rateValue,
                calculationBasis: dto.calculationBasis || CommissionBasis.NET_SERVICE_PRICE,
                isActive: true,
            },
            include: {
                staff: {
                    select: {
                        id: true,
                        displayName: true,
                        title: true,
                    },
                },
            },
        });

        await this.broadcastCommissionEvent(organizationId, "commission.rule_created", {
            ruleId: rule.id,
            name: rule.name,
        });

        return {
            ...rule,
            rate: rule.rateValue,
            type: rule.calculationType,
        };
    }

    async updateCommissionRule(
        organizationId: string,
        ruleId: string,
        dto: {
            name?: string;
            rateValue?: number;
            calculationType?: CommissionType;
            calculationBasis?: CommissionBasis;
            isActive?: boolean;
            staffId?: string | null;
        }
    ) {
        const existing = await this.prisma.commissionRule.findFirst({
            where: { id: ruleId, organizationId },
        });

        if (!existing) {
            throw new NotFoundException(`CommissionRule ${ruleId} not found`);
        }

        const updated = await this.prisma.commissionRule.update({
            where: { id: ruleId },
            data: {
                ...dto,
                ruleVersion: { increment: 1 },
            },
            include: {
                staff: {
                    select: {
                        id: true,
                        displayName: true,
                        title: true,
                    },
                },
            },
        });

        await this.broadcastCommissionEvent(organizationId, "commission.rule_updated", {
            ruleId: updated.id,
            name: updated.name,
        });

        return {
            ...updated,
            rate: updated.rateValue,
            type: updated.calculationType,
        };
    }

    async deleteCommissionRule(organizationId: string, ruleId: string) {
        const existing = await this.prisma.commissionRule.findFirst({
            where: { id: ruleId, organizationId },
        });

        if (!existing) {
            throw new NotFoundException(`CommissionRule ${ruleId} not found`);
        }

        const res = await this.prisma.commissionRule.delete({
            where: { id: ruleId },
        });

        await this.broadcastCommissionEvent(organizationId, "commission.rule_deleted", {
            ruleId,
        });

        return {
            ...res,
            deleted: true,
            success: true,
        };
    }

    async getCommissionSummary(organizationId: string) {
        const [records, rulesCount, org] = await Promise.all([
            this.prisma.commissionRecord.findMany({
                where: { organizationId },
                select: {
                    id: true,
                    calculatedAmountCents: true,
                    status: true,
                    currency: true,
                },
            }),
            this.prisma.commissionRule.count({
                where: { organizationId, isActive: true },
            }),
            this.prisma.organization.findUnique({
                where: { id: organizationId },
                select: { currency: true },
            }),
        ]);

        const orgCurrency = org?.currency || "USD";
        let totalAccruedCents = 0;
        let totalPendingCents = 0;
        let totalApprovedCents = 0;
        let totalPaidCents = 0;
        let totalClawedBackCents = 0;
        let pendingCount = 0;

        for (const r of records) {
            let amountInOrgCurrency = r.calculatedAmountCents;
            if (r.currency !== orgCurrency && this.exchangeRateService) {
                const conv = await this.exchangeRateService
                    .convertCurrency(r.calculatedAmountCents, r.currency, orgCurrency)
                    .catch(() => ({ convertedAmountCents: r.calculatedAmountCents }));
                amountInOrgCurrency = conv.convertedAmountCents;
            }

            totalAccruedCents += amountInOrgCurrency;
            if (r.status === CommissionStatus.PENDING) {
                pendingCount++;
                totalPendingCents += amountInOrgCurrency;
            }
            if (r.status === CommissionStatus.APPROVED) totalApprovedCents += amountInOrgCurrency;
            if (r.status === CommissionStatus.PAID) totalPaidCents += amountInOrgCurrency;
            if (r.status === CommissionStatus.CLAWED_BACK) totalClawedBackCents += amountInOrgCurrency;
        }

        return {
            currency: orgCurrency,
            totalAccruedCents,
            totalPendingCents,
            totalApprovedCents,
            totalPaidCents,
            totalClawedBackCents,
            pendingCount,
            activeRulesCount: rulesCount,
            totalRecordsCount: records.length,
        };
    }

    async updateCommissionStatus(
        organizationId: string,
        recordId: string,
        status: CommissionStatus
    ) {
        const record = await this.prisma.commissionRecord.findFirst({
            where: { id: recordId, organizationId },
        });

        if (!record) {
            throw new NotFoundException(`CommissionRecord ${recordId} not found`);
        }

        const updated = await this.prisma.commissionRecord.update({
            where: { id: recordId },
            data: { status },
            include: {
                staff: true,
                appointment: {
                    include: { service: true, customer: true },
                },
            },
        });

        await this.broadcastCommissionEvent(organizationId, "commission.updated", {
            commissionId: updated.id,
            status: updated.status,
            calculatedAmountCents: updated.calculatedAmountCents,
        });

        return updated;
    }
}
