import { PrismaClient, IncidentType } from "@prisma/client";

const prisma = new PrismaClient();

export async function runBookingReconciliation(organizationId: string) {
    console.log(`[Reconciliation] Running Booking Payment Reconciliation for Org: ${organizationId}`);

    // Fetch all CONFIRMED or CHECKED_IN appointments
    const activeAppointments = await prisma.appointment.findMany({
        where: {
            organizationId,
            status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED"] },
        },
        include: {
            paymentRecords: true,
        },
    });

    let discrepanciesCount = 0;

    for (const appointment of activeAppointments) {
        const hasSuccessfulPayment = appointment.paymentRecords.some(
            (p) => p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED"
        );

        if (!hasSuccessfulPayment && appointment.paymentStatus === "PAID") {
            console.warn(`[Discrepancy Detected] Appointment ${appointment.id} marked PAID but has no SUCCEEDED PaymentRecord`);
            discrepanciesCount++;

            await prisma.reconciliationIncident.create({
                data: {
                    organizationId,
                    incidentType: IncidentType.UNFINALIZED_PAYMENT,
                    appointmentId: appointment.id,
                    payload: {
                        appointmentId: appointment.id,
                        paymentStatus: appointment.paymentStatus,
                        issue: "Appointment status is PAID but no SUCCEEDED payment records exist in ledger",
                    },
                },
            });
        }
    }

    console.log(`[Reconciliation] Completed. Total Discrepancies Flagged: ${discrepanciesCount}`);
    return discrepanciesCount;
}

if (require.main === module) {
    const orgId = process.argv[2] || "00000000-0000-0000-0000-000000000000";
    runBookingReconciliation(orgId)
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}
