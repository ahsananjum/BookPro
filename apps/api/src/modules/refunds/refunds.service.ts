import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Logger,
    Inject,
    Optional,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { OutboxService } from "../outbox/outbox.service";
import { ProcessRefundDto, RefundResponseDto } from "@bookpro/contracts";
import { PaymentRecordStatus, RefundStatus, IncidentType, IncidentStatus, Prisma } from "@prisma/client";
import {
    PaymentProvider,
    PAYMENT_PROVIDER,
} from "../payments/payment-provider.interface";
import { ExchangeRateService } from "../payments/exchange-rate.service";
import { IdempotencyService } from "../common/idempotency.service";
import { RetryClassifier } from "@bookpro/server-core";
import * as crypto from "crypto";

@Injectable()
export class RefundsService {
    private readonly logger = new Logger(RefundsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly outboxService: OutboxService,
        private readonly idempotencyService: IdempotencyService,
        @Inject(PAYMENT_PROVIDER)
        private readonly paymentProvider: PaymentProvider,
        @Optional()
        private readonly exchangeRateService?: ExchangeRateService,
    ) { }

    /**
     * Processes a full or partial refund with atomic balance verification, provider idempotency,
     * immutable commission clawback calculation, and financial ledger logging.
     * Enforces: refund <= refundable captured balance & concurrent-refund serialization.
     */
    async processRefund(
        organizationId: string,
        dto: ProcessRefundDto
    ): Promise<RefundResponseDto> {
        const idempotencyKey = dto.idempotencyKey?.trim();
        if (!idempotencyKey) {
            throw new BadRequestException(
                "Idempotency key is required for refund operations to prevent duplicate refunds."
            );
        }

        const res = await this.idempotencyService.executeIdempotent<RefundResponseDto>(
            {
                organizationId,
                operation: "REFUND_PROCESS",
                idempotencyKey,
                payload: {
                    ...dto,
                    organizationId,
                },
            },
            async () => {
                // Check if existing refund record exists for this idempotency key
                const existingRefund = await this.prisma.refundRecord.findFirst({
                    where: {
                        organizationId,
                        idempotencyKey,
                    },
                });

                if (existingRefund && existingRefund.status === RefundStatus.SUCCEEDED) {
                    return {
                        refundRecordId: existingRefund.id,
                        paymentRecordId: existingRefund.paymentId,
                        providerRefundId: existingRefund.providerRefundId || undefined,
                        amountCents: existingRefund.amountCents,
                        currency: existingRefund.currency,
                        status: existingRefund.status,
                        reason: existingRefund.reason || undefined,
                        processedAt: existingRefund.processedAt?.toISOString(),
                    };
                }

                // 1. Transactional check & reserve refund balance
                const reservation = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                    const payment = await tx.paymentRecord.findFirst({
                        where: { id: dto.paymentRecordId, organizationId },
                        include: {
                            refunds: true,
                            organization: {
                                select: {
                                    id: true,
                                    currency: true,
                                    stripeAccountId: true,
                                },
                            },
                        },
                    });

                    if (!payment) {
                        throw new NotFoundException(`PaymentRecord ${dto.paymentRecordId} not found`);
                    }

                    if (
                        payment.status !== PaymentRecordStatus.SUCCEEDED &&
                        payment.status !== PaymentRecordStatus.PARTIALLY_REFUNDED
                    ) {
                        throw new BadRequestException(
                            `PaymentRecord status '${payment.status}' is not eligible for refund`
                        );
                    }

                    // Calculate existing non-failed refunds (both SUCCEEDED and in-flight PENDING, excluding current record if retrying)
                    const activeRefunds = payment.refunds.filter(
                        (r) => (r.status === RefundStatus.SUCCEEDED || r.status === RefundStatus.PENDING) && (!existingRefund || r.id !== existingRefund.id)
                    );
                    const activeRefundedCents = activeRefunds.reduce(
                        (sum: number, r: { amountCents: number }) => sum + r.amountCents,
                        0
                    );

                    const remainingBalanceCents = payment.amountCents - activeRefundedCents;

                    if (remainingBalanceCents <= 0) {
                        throw new BadRequestException("Payment is already fully refunded or has pending refunds for full balance");
                    }

                    const meta = (payment.metadata as any) || {};
                    const orgCurrency = payment.organization?.currency || "USD";

                    let requestedGatewayCents: number | undefined = undefined;
                    if (dto.amountCents != null) {
                        const inputCurr = (dto.currency || payment.currency).toUpperCase();
                        if (inputCurr === payment.currency.toUpperCase()) {
                            requestedGatewayCents = dto.amountCents;
                        } else if (
                            inputCurr === orgCurrency.toUpperCase() &&
                            meta.originalCurrency === orgCurrency &&
                            meta.originalAmountCents &&
                            payment.amountCents > 0
                        ) {
                            const ratio = payment.amountCents / Number(meta.originalAmountCents);
                            requestedGatewayCents = Math.round(dto.amountCents * ratio);
                        } else if (meta.exchangeRate && inputCurr !== payment.currency.toUpperCase()) {
                            requestedGatewayCents = Math.round(dto.amountCents * Number(meta.exchangeRate));
                        } else {
                            requestedGatewayCents = dto.amountCents;
                        }
                    }

                    const refundAmountCents = requestedGatewayCents != null ? requestedGatewayCents : remainingBalanceCents;

                    if (refundAmountCents > remainingBalanceCents) {
                        throw new BadRequestException(
                            `Requested refund amount ${refundAmountCents} exceeds available balance ${remainingBalanceCents}`
                        );
                    }

                    // Create or update PENDING RefundRecord (serialized reservation)
                    let refundRecord: any;
                    if (existingRefund) {
                        refundRecord = await tx.refundRecord.update({
                            where: { id: existingRefund.id },
                            data: {
                                amountCents: refundAmountCents,
                                currency: payment.currency,
                                status: RefundStatus.PENDING,
                                reason: dto.reason || "Customer requested refund",
                                actorType: dto.actorType || "STAFF",
                                actorId: dto.actorId || null,
                                failureReason: null,
                            },
                        });
                    } else {
                        refundRecord = await tx.refundRecord.create({
                            data: {
                                organizationId,
                                paymentId: payment.id,
                                amountCents: refundAmountCents,
                                currency: payment.currency,
                                status: RefundStatus.PENDING,
                                reason: dto.reason || "Customer requested refund",
                                actorType: dto.actorType || "STAFF",
                                actorId: dto.actorId || null,
                                idempotencyKey,
                            },
                        });
                    }

                    return {
                        payment,
                        refundRecord,
                        refundAmountCents,
                        existingRefundedCents: activeRefundedCents,
                    };
                });

                const { payment, refundRecord, refundAmountCents, existingRefundedCents } = reservation;
                const meta = (payment.metadata as any) || {};
                const orgCurrency = payment.organization?.currency || "USD";
                const connectedAccountId = payment.organization?.stripeAccountId || meta.connectedAccountId || undefined;
                const chargePattern = (meta.chargePattern as "DIRECT" | "DESTINATION") || (connectedAccountId ? "DESTINATION" : undefined);

                // 2. Call PaymentProvider OUTSIDE schedule/database lock transaction
                let providerResult: any;
                try {
                    providerResult = await this.paymentProvider.refund({
                        providerPaymentId: payment.providerPaymentId,
                        amountCents: refundAmountCents,
                        currency: payment.currency,
                        connectedAccountId,
                        chargePattern,
                        reason: dto.reason || "Customer requested refund",
                        idempotencyKey,
                    });
                } catch (err: any) {
                    this.logger.error(`Refund failed for PaymentRecord ${payment.id}: ${err.message}`);

                    const classification = RetryClassifier.classify(err);

                    if (classification.isRetryable) {
                        // Ambiguous network/timeout error: preserve PENDING and flag ReconciliationIncident
                        await this.prisma.refundRecord.update({
                            where: { id: refundRecord.id },
                            data: {
                                status: RefundStatus.PENDING,
                                failureReason: `AMBIGUOUS_PROVIDER_TIMEOUT: ${err.message}`,
                            },
                        }).catch(() => null);

                        if ((this.prisma as any).reconciliationIncident) {
                            await (this.prisma as any).reconciliationIncident.create({
                                data: {
                                    organizationId,
                                    incidentType: IncidentType.AMBIGUOUS_REFUND,
                                    providerPaymentId: payment.providerPaymentId,
                                    appointmentId: payment.appointmentId || undefined,
                                    status: IncidentStatus.OPEN,
                                    resolutionNotes: `Provider refund encountered ambiguous network timeout: ${err.message}. Preserved as PENDING for automated reconciliation.`,
                                    payload: {
                                        paymentRecordId: payment.id,
                                        refundRecordId: refundRecord.id,
                                        amountCents: refundAmountCents,
                                        idempotencyKey,
                                        error: err.message,
                                    },
                                },
                            }).catch(() => null);

                            await this.prisma.paymentRecord.update({
                                where: { id: payment.id },
                                data: { status: PaymentRecordStatus.REQUIRES_RECONCILIATION },
                            }).catch(() => null);
                        }

                        throw new BadRequestException(`Refund encountered provider network timeout: ${err.message}. State preserved for reconciliation.`);
                    }

                    // Terminal failure: mark RefundRecord FAILED
                    await this.prisma.refundRecord.update({
                        where: { id: refundRecord.id },
                        data: {
                            status: RefundStatus.FAILED,
                            failureReason: err.message || "Provider refund rejected",
                        },
                    });

                    throw new BadRequestException(`Refund failed: ${err.message}`);
                }

                // 3. Provider confirmed -> Transition to SUCCEEDED, record ledger entry, recalculate commission
                const totalRefundedNow = existingRefundedCents + refundAmountCents;
                const newPaymentStatus =
                    totalRefundedNow >= payment.amountCents
                        ? PaymentRecordStatus.REFUNDED
                        : PaymentRecordStatus.PARTIALLY_REFUNDED;

                let updatedRefund: any;
        try {
            updatedRefund = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                const res = await tx.refundRecord.update({
                    where: { id: refundRecord.id },
                    data: {
                        status: RefundStatus.SUCCEEDED,
                        providerRefundId: providerResult.providerRefundId,
                        processedAt: new Date(),
                    },
                });

                await tx.paymentRecord.update({
                    where: { id: payment.id },
                    data: { status: newPaymentStatus },
                });

                if (payment.appointmentId) {
                    await tx.appointment.update({
                        where: { id: payment.appointmentId },
                        data: {
                            paymentStatus: newPaymentStatus === PaymentRecordStatus.REFUNDED ? "REFUNDED" : "PARTIALLY_REFUNDED",
                        },
                    });

                    // Update customer totalSpentCents (converted to organization's native currency)
                    const appt = await tx.appointment.findUnique({
                        where: { id: payment.appointmentId },
                        select: { customerId: true },
                    });
                    if (appt && appt.customerId) {
                        let refundInOrgCurrency = refundAmountCents;
                        if (meta.originalCurrency === orgCurrency && meta.originalAmountCents != null && payment.amountCents > 0) {
                            refundInOrgCurrency = Math.round((refundAmountCents / payment.amountCents) * Number(meta.originalAmountCents));
                        } else if (meta.exchangeRate && payment.currency !== orgCurrency) {
                            refundInOrgCurrency = Math.round(refundAmountCents / Number(meta.exchangeRate));
                        }

                        await tx.customer.update({
                            where: { id: appt.customerId },
                            data: {
                                totalSpentCents: { decrement: refundInOrgCurrency },
                            },
                        });
                    }

                    // Recalculate commission from immutable snapshot basis across all cumulative refunds
                    const commission = await tx.commissionRecord.findFirst({
                        where: { appointmentId: payment.appointmentId },
                    });
                    if (commission && commission.status === "PENDING") {
                        const allPayments = await tx.paymentRecord.findMany({
                            where: { appointmentId: payment.appointmentId },
                            include: { refunds: true },
                        });

                        const totalCapturedPrice = commission.priceSnapshotCents;
                        let totalCumulativeRefunded = 0;
                        for (const p of allPayments) {
                            const pMeta = (p.metadata as any) || {};
                            const pRefunds = (p.refunds || []).filter(
                                (r) => r.status === RefundStatus.SUCCEEDED || r.id === res.id
                            );
                            for (const r of pRefunds) {
                                let rInCommissionCurrency = r.amountCents;
                                if (pMeta.originalCurrency === commission.currency && pMeta.originalAmountCents != null && p.amountCents > 0) {
                                    rInCommissionCurrency = Math.round((r.amountCents / p.amountCents) * Number(pMeta.originalAmountCents));
                                } else if (pMeta.exchangeRate && p.currency !== commission.currency) {
                                    rInCommissionCurrency = Math.round(r.amountCents / Number(pMeta.exchangeRate));
                                }
                                totalCumulativeRefunded += rInCommissionCurrency;
                            }
                        }

                        const netCapturedCents = Math.max(0, totalCapturedPrice - totalCumulativeRefunded);

                        let targetCommissionCents = 0;
                        const rateBps = commission.rateValueSnapshot <= 100
                            ? commission.rateValueSnapshot * 100
                            : commission.rateValueSnapshot;

                        if (
                            commission.calculationBasisSnapshot === 'NET_SERVICE_PRICE' ||
                            commission.calculationBasisSnapshot === 'TOTAL_APPOINTMENT_PRICE'
                        ) {
                            targetCommissionCents = Math.round((netCapturedCents * rateBps) / 10000);
                        } else {
                            targetCommissionCents = totalCapturedPrice > 0
                                ? Math.round((commission.rateValueSnapshot * netCapturedCents) / totalCapturedPrice)
                                : 0;
                        }

                        targetCommissionCents = Math.max(0, targetCommissionCents);

                        if (commission.calculatedAmountCents !== targetCommissionCents) {
                            const clawbackCents = Math.max(0, commission.calculatedAmountCents - targetCommissionCents);

                            await tx.commissionRecord.update({
                                where: { id: commission.id },
                                data: {
                                    calculatedAmountCents: targetCommissionCents,
                                    status: targetCommissionCents === 0 ? "CLAWED_BACK" : commission.status,
                                },
                            });

                            if ((tx as any).financialLedgerEntry && clawbackCents > 0) {
                                await (tx as any).financialLedgerEntry.create({
                                    data: {
                                        organizationId,
                                        appointmentId: payment.appointmentId,
                                        paymentId: payment.id,
                                        refundId: res.id,
                                        entryType: 'COMMISSION_CLAWBACK',
                                        amountCents: -clawbackCents,
                                        currency: commission.currency || payment.currency,
                                        description: `Commission clawback of ${clawbackCents} cents for appointment ${payment.appointmentId}`,
                                    },
                                }).catch(() => null);
                            }
                        }
                    }

                    // Append Financial Ledger Entry for Refund Disbursement
                    if ((tx as any).financialLedgerEntry) {
                        await (tx as any).financialLedgerEntry.create({
                            data: {
                                organizationId,
                                appointmentId: payment.appointmentId,
                                paymentId: payment.id,
                                refundId: res.id,
                                entryType: 'REFUND_DISBURSEMENT',
                                amountCents: -refundAmountCents,
                                currency: payment.currency,
                                description: `Refund disbursement of ${refundAmountCents} cents for payment ${payment.id}`,
                            },
                        }).catch(() => null);
                    }

                    await this.outboxService.emitInTx(tx, {
                        aggregateType: "Payment",
                        aggregateId: payment.id,
                        eventType: "payment.refunded",
                        payload: {
                            paymentRecordId: payment.id,
                            refundRecordId: res.id,
                            amountCents: refundAmountCents,
                            appointmentId: payment.appointmentId,
                        },
                    });
                }

                return res;
            });
        } catch (localError: any) {
            this.logger.error(
                `Critical: Provider refund ${providerResult.providerRefundId} succeeded but local finalization failed for payment ${payment.id}: ${localError.message}`
            );

            if ((this.prisma as any).reconciliationIncident) {
                await (this.prisma as any).reconciliationIncident.create({
                    data: {
                        organizationId,
                        incidentType: IncidentType.AMBIGUOUS_REFUND,
                        providerPaymentId: payment.providerPaymentId,
                        appointmentId: payment.appointmentId || undefined,
                        status: IncidentStatus.OPEN,
                        resolutionNotes: `Provider refund ${providerResult.providerRefundId} succeeded (${refundAmountCents} cents) but local DB finalization failed: ${localError.message}`,
                        payload: {
                            paymentRecordId: payment.id,
                            refundRecordId: refundRecord.id,
                            providerRefundId: providerResult.providerRefundId,
                            amountCents: refundAmountCents,
                            error: localError.message,
                        },
                    },
                }).catch(() => null);

                await this.prisma.paymentRecord.update({
                    where: { id: payment.id },
                    data: { status: PaymentRecordStatus.REQUIRES_RECONCILIATION },
                }).catch(() => null);
            }

            throw localError;
        }

        return {
            refundRecordId: updatedRefund.id,
            paymentRecordId: payment.id,
            providerRefundId: updatedRefund.providerRefundId || undefined,
            amountCents: refundAmountCents,
            currency: payment.currency,
            status: updatedRefund.status,
            reason: updatedRefund.reason || undefined,
            processedAt: updatedRefund.processedAt?.toISOString(),
        };
    });

    return res.data;
}
}
