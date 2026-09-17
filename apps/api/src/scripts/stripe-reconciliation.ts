import { PrismaClient, IncidentType, IncidentStatus, PaymentRecordStatus, RefundStatus } from "@prisma/client";
import Stripe from "stripe";

const prisma = new PrismaClient();

function getStripeClient(): Stripe | null {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
        return null;
    }
    return new Stripe(apiKey, {
        apiVersion: "2024-06-20" as any,
    });
}

export async function runStripeReconciliation(organizationId: string) {
    console.log(`[Reconciliation] Running Comprehensive Stripe Reconciliation for Org: ${organizationId}`);
    const stripe = getStripeClient();

    let discrepanciesCount = 0;
    let autoResolvedCount = 0;

    // 1. Reconcile Payments (stale PENDING or REQUIRES_RECONCILIATION)
    const ambiguousPayments = await prisma.paymentRecord.findMany({
        where: {
            organizationId,
            provider: "STRIPE",
            OR: [
                { status: PaymentRecordStatus.REQUIRES_RECONCILIATION },
                {
                    status: PaymentRecordStatus.PENDING,
                    updatedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
                },
            ],
        },
    });

    for (const payment of ambiguousPayments) {
        console.warn(`[Reconciliation] Inspecting payment ${payment.id} (providerPaymentId: ${payment.providerPaymentId}, status: ${payment.status})`);
        discrepanciesCount++;

        if (stripe && payment.providerPaymentId) {
            try {
                const intent = await stripe.paymentIntents.retrieve(payment.providerPaymentId);
                if (intent.status === "succeeded") {
                    await prisma.$transaction(async (tx) => {
                        await tx.paymentRecord.update({
                            where: { id: payment.id },
                            data: {
                                status: PaymentRecordStatus.SUCCEEDED,
                                amountCents: intent.amount_received || payment.amountCents,
                            },
                        });

                        if ((tx as any).reconciliationIncident) {
                            await (tx as any).reconciliationIncident.updateMany({
                                where: {
                                    organizationId,
                                    providerPaymentId: payment.providerPaymentId,
                                    status: IncidentStatus.OPEN,
                                },
                                data: {
                                    status: IncidentStatus.RESOLVED,
                                    resolutionNotes: `Auto-reconciled: Stripe PaymentIntent confirmed SUCCEEDED.`,
                                },
                            });
                        }
                    });
                    console.log(`[Reconciliation] Auto-resolved payment ${payment.id} -> SUCCEEDED`);
                    autoResolvedCount++;
                    continue;
                } else if (intent.status === "canceled") {
                    await prisma.$transaction(async (tx) => {
                        await tx.paymentRecord.update({
                            where: { id: payment.id },
                            data: { status: PaymentRecordStatus.FAILED },
                        });

                        if ((tx as any).reconciliationIncident) {
                            await (tx as any).reconciliationIncident.updateMany({
                                where: {
                                    organizationId,
                                    providerPaymentId: payment.providerPaymentId,
                                    status: IncidentStatus.OPEN,
                                },
                                data: {
                                    status: IncidentStatus.RESOLVED,
                                    resolutionNotes: `Auto-reconciled: Stripe PaymentIntent confirmed CANCELED.`,
                                },
                            });
                        }
                    });
                    console.log(`[Reconciliation] Auto-resolved payment ${payment.id} -> FAILED`);
                    autoResolvedCount++;
                    continue;
                }
            } catch (err: any) {
                console.error(`[Reconciliation] Stripe query error for payment ${payment.id}: ${err.message}`);
            }
        }

        // Flag open Incident if not auto-resolved
        const existingIncident = await prisma.reconciliationIncident.findFirst({
            where: {
                organizationId,
                providerPaymentId: payment.providerPaymentId,
                status: IncidentStatus.OPEN,
            },
        });

        if (!existingIncident) {
            await prisma.reconciliationIncident.create({
                data: {
                    organizationId,
                    incidentType: IncidentType.UNFINALIZED_PAYMENT,
                    providerPaymentId: payment.providerPaymentId,
                    appointmentId: payment.appointmentId || undefined,
                    bookingHoldId: payment.bookingHoldId || undefined,
                    status: IncidentStatus.OPEN,
                    resolutionNotes: `Payment status ${payment.status} requires reconciliation.`,
                    payload: {
                        paymentRecordId: payment.id,
                        status: payment.status,
                    },
                },
            });
        }
    }

    // 2. Reconcile Ambiguous / Stale Refunds
    const ambiguousRefunds = await prisma.refundRecord.findMany({
        where: {
            organizationId,
            status: RefundStatus.PENDING,
            updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
        },
        include: {
            payment: true,
        },
    });

    for (const refund of ambiguousRefunds) {
        console.warn(`[Reconciliation] Inspecting ambiguous refund ${refund.id} (paymentId: ${refund.paymentId})`);
        discrepanciesCount++;

        if (stripe && refund.payment.providerPaymentId) {
            try {
                // List refunds for this payment intent from Stripe
                const stripeRefunds = await stripe.refunds.list({
                    payment_intent: refund.payment.providerPaymentId,
                    limit: 10,
                });

                const matchedStripeRefund = stripeRefunds.data.find(
                    (sr) => sr.amount === refund.amountCents && (sr.status === "succeeded" || sr.status === "pending")
                );

                if (matchedStripeRefund && matchedStripeRefund.status === "succeeded") {
                    await prisma.$transaction(async (tx) => {
                        await tx.refundRecord.update({
                            where: { id: refund.id },
                            data: {
                                status: RefundStatus.SUCCEEDED,
                                providerRefundId: matchedStripeRefund.id,
                                processedAt: new Date(),
                            },
                        });

                        if ((tx as any).reconciliationIncident) {
                            await (tx as any).reconciliationIncident.updateMany({
                                where: {
                                    organizationId,
                                    providerPaymentId: refund.payment.providerPaymentId,
                                    status: IncidentStatus.OPEN,
                                },
                                data: {
                                    status: IncidentStatus.RESOLVED,
                                    resolutionNotes: `Auto-reconciled: Stripe Refund ${matchedStripeRefund.id} confirmed SUCCEEDED.`,
                                },
                            });
                        }
                    });
                    console.log(`[Reconciliation] Auto-resolved refund ${refund.id} -> SUCCEEDED`);
                    autoResolvedCount++;
                    continue;
                }
            } catch (err: any) {
                console.error(`[Reconciliation] Stripe query error for refund ${refund.id}: ${err.message}`);
            }
        }

        if ((prisma as any).reconciliationIncident) {
            const existingIncident = await (prisma as any).reconciliationIncident.findFirst({
                where: {
                    organizationId,
                    providerPaymentId: refund.payment.providerPaymentId,
                    status: IncidentStatus.OPEN,
                },
            });

            if (!existingIncident) {
                await (prisma as any).reconciliationIncident.create({
                    data: {
                        organizationId,
                        incidentType: IncidentType.AMBIGUOUS_REFUND,
                        providerPaymentId: refund.payment.providerPaymentId,
                        appointmentId: refund.payment.appointmentId || undefined,
                        status: IncidentStatus.OPEN,
                        resolutionNotes: `Refund ${refund.id} pending verification with payment provider.`,
                        payload: {
                            refundRecordId: refund.id,
                            paymentRecordId: refund.paymentId,
                            amountCents: refund.amountCents,
                        },
                    },
                });
            }
        }
    }

    console.log(`[Reconciliation] Finished. Discrepancies flagged: ${discrepanciesCount}, Auto-resolved: ${autoResolvedCount}`);
    return { discrepanciesCount, autoResolvedCount };
}

if (require.main === module) {
    const orgId = process.argv[2] || "00000000-0000-0000-0000-000000000000";
    runStripeReconciliation(orgId)
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}
