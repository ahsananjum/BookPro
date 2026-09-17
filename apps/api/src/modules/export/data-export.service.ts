import {
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import {
    CreateExportInput,
    DataExportDto,
    ExportType,
} from "@bookpro/contracts";

@Injectable()
export class DataExportService {
    private readonly logger = new Logger(DataExportService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Creates an asynchronous/streamable CSV export for a tenant.
     */
    async createExport(
        organizationId: string,
        requestedBy: string,
        input: CreateExportInput
    ): Promise<DataExportDto> {
        this.logger.log(`[DataExport] Creating ${input.exportType} export for org ${organizationId}`);

        const now = new Date();
        const exportRecord = await this.prisma.dataExport.create({
            data: {
                organizationId,
                requestedBy,
                exportType: input.exportType as any,
                status: "PROCESSING",
                filters: input as any,
                expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days retention
            },
        });

        // Generate CSV content
        try {
            const { csv, rowCount } = await this.generateCsvContent(organizationId, input);
            const sizeBytes = Buffer.byteLength(csv, "utf8");

            const completed = await this.prisma.dataExport.update({
                where: { id: exportRecord.id },
                data: {
                    status: "COMPLETED",
                    fileUrl: `/api/v1/organizations/${organizationId}/exports/${exportRecord.id}/download`,
                    fileSizeBytes: sizeBytes,
                    rowCount,
                    completedAt: new Date(),
                },
            });

            return this.toDto(completed);
        } catch (err: any) {
            this.logger.error(`[DataExport] Failed generating export: ${err.message}`, err.stack);
            const failed = await this.prisma.dataExport.update({
                where: { id: exportRecord.id },
                data: {
                    status: "FAILED",
                    error: err.message,
                },
            });
            return this.toDto(failed);
        }
    }

    /**
     * Generates CSV string for download.
     */
    async getExportCsv(organizationId: string, exportId: string): Promise<string> {
        const record = await this.prisma.dataExport.findFirst({
            where: { id: exportId, organizationId },
        });

        if (!record) {
            throw new NotFoundException(`Export ${exportId} not found.`);
        }

        const { csv } = await this.generateCsvContent(
            organizationId,
            (record.filters || { exportType: record.exportType }) as any
        );
        return csv;
    }

    /**
     * Lists export jobs for tenant.
     */
    async listExports(organizationId: string): Promise<DataExportDto[]> {
        const records = await this.prisma.dataExport.findMany({
            where: { organizationId },
            orderBy: { createdAt: "desc" },
            take: 50,
        });

        return records.map((r) => this.toDto(r));
    }

    private async generateCsvContent(
        organizationId: string,
        input: CreateExportInput
    ): Promise<{ csv: string; rowCount: number }> {
        const startDate = input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : undefined;
        const endDate = input.endDate ? new Date(`${input.endDate}T23:59:59.999Z`) : undefined;

        switch (input.exportType) {
            case "CUSTOMERS": {
                const customers = await this.prisma.customer.findMany({
                    where: { organizationId },
                    orderBy: { createdAt: "desc" },
                });
                const header = "ID,Full Name,Email,Phone,Total Spent ($),Completed Bookings,Cancelled,No Shows,Created At\n";
                const rows = customers.map((c) =>
                    [
                        c.id,
                        `"${c.fullName.replace(/"/g, '""')}"`,
                        c.email,
                        c.phone || "",
                        (c.totalSpentCents / 100).toFixed(2),
                        c.completedAppointmentsCount,
                        c.cancelledCount,
                        c.noShowCount,
                        c.createdAt.toISOString(),
                    ].join(",")
                );
                return { csv: header + rows.join("\n"), rowCount: customers.length };
            }
            case "APPOINTMENTS": {
                const appts = await this.prisma.appointment.findMany({
                    where: {
                        organizationId,
                        ...(startDate || endDate ? { startAt: { gte: startDate, lte: endDate } } : {}),
                        ...(input.locationId ? { locationId: input.locationId } : {}),
                    },
                    include: { customer: true, service: true, staff: true, location: true },
                    orderBy: { startAt: "desc" },
                });
                const header = "ID,Start Time,End Time,Customer,Email,Service,Staff,Location,Status,Price ($),Currency,Source\n";
                const rows = appts.map((a) =>
                    [
                        a.id,
                        a.startAt.toISOString(),
                        a.endAt.toISOString(),
                        `"${(a.customer?.fullName || "").replace(/"/g, '""')}"`,
                        a.customer?.email || "",
                        `"${(a.service?.name || "").replace(/"/g, '""')}"`,
                        `"${(a.staff?.displayName || "").replace(/"/g, '""')}"`,
                        `"${(a.location?.name || "").replace(/"/g, '""')}"`,
                        a.status,
                        (a.priceCents / 100).toFixed(2),
                        a.currency,
                        a.bookingSource,
                    ].join(",")
                );
                return { csv: header + rows.join("\n"), rowCount: appts.length };
            }
            case "PAYMENTS": {
                const payments = await this.prisma.paymentRecord.findMany({
                    where: {
                        organizationId,
                        ...(startDate || endDate ? { createdAt: { gte: startDate, lte: endDate } } : {}),
                    },
                    include: { appointment: { include: { customer: true } } },
                    orderBy: { createdAt: "desc" },
                });
                const header = "ID,Appointment ID,Customer,Amount ($),Currency,Status,Provider,Provider Payment ID,Created At\n";
                const rows = payments.map((p) =>
                    [
                        p.id,
                        p.appointmentId || "",
                        `"${(p.appointment?.customer?.fullName || "").replace(/"/g, '""')}"`,
                        (p.amountCents / 100).toFixed(2),
                        p.currency,
                        p.status,
                        p.provider,
                        p.providerPaymentId || "",
                        p.createdAt.toISOString(),
                    ].join(",")
                );
                return { csv: header + rows.join("\n"), rowCount: payments.length };
            }
            case "REVENUE_REPORT": {
                const metrics = await this.prisma.orgDailyMetric.findMany({
                    where: {
                        organizationId,
                        ...(startDate || endDate ? { date: { gte: startDate, lte: endDate } } : {}),
                    },
                    orderBy: { date: "desc" },
                });
                const header = "Date,Currency,Booked Revenue ($),Collected ($),Refunded ($),Net ($),Bookings,Completed,Cancelled,No Shows,Utilization (%)\n";
                const rows = metrics.map((m) =>
                    [
                        m.date.toISOString().slice(0, 10),
                        m.currency,
                        (m.bookedRevenueCents / 100).toFixed(2),
                        (m.collectedRevenueCents / 100).toFixed(2),
                        (m.refundedRevenueCents / 100).toFixed(2),
                        (m.netCollectedRevenueCents / 100).toFixed(2),
                        m.bookingCount,
                        m.completedCount,
                        m.cancelledCount,
                        m.noShowCount,
                        m.utilizationRate.toFixed(1),
                    ].join(",")
                );
                return { csv: header + rows.join("\n"), rowCount: metrics.length };
            }
            default:
                throw new Error(`Unsupported export type: ${input.exportType}`);
        }
    }

    private toDto(record: any): DataExportDto {
        return {
            id: record.id,
            organizationId: record.organizationId,
            requestedBy: record.requestedBy,
            exportType: record.exportType,
            status: record.status,
            filters: record.filters as any,
            fileUrl: record.fileUrl,
            fileSizeBytes: record.fileSizeBytes,
            rowCount: record.rowCount,
            expiresAt: record.expiresAt ? record.expiresAt.toISOString() : null,
            error: record.error,
            createdAt: record.createdAt.toISOString(),
            completedAt: record.completedAt ? record.completedAt.toISOString() : null,
        };
    }
}
