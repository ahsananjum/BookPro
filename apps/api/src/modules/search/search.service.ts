import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { SearchResultsDto, PermissionKey } from "@bookpro/contracts";

@Injectable()
export class SearchService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Bounded, tenant-scoped and permission-filtered PostgreSQL multi-entity search.
     */
    async searchAll(
        organizationId: string,
        query: string,
        options: {
            permissions?: PermissionKey[];
            locationId?: string;
        } = {}
    ): Promise<SearchResultsDto> {
        if (!query || query.trim().length === 0) {
            return { customers: [], appointments: [], staff: [], services: [] };
        }

        const searchTerm = query.trim();
        const perms = options.permissions || Object.values(PermissionKey);

        const canReadCustomers = perms.includes(PermissionKey.CUSTOMER_READ);
        const canReadAppointments = perms.includes(PermissionKey.APPOINTMENT_READ);
        const canReadStaff = perms.includes(PermissionKey.STAFF_READ);
        const canReadServices = perms.includes(PermissionKey.SERVICE_READ);

        // 1. Search Customers (tenant-isolated & guarded)
        let customers: any[] = [];
        if (canReadCustomers) {
            const customerRecords = await this.prisma.customer.findMany({
                where: {
                    organizationId,
                    OR: [
                        { fullName: { contains: searchTerm, mode: "insensitive" } },
                        { email: { contains: searchTerm, mode: "insensitive" } },
                        { phone: { contains: searchTerm, mode: "insensitive" } },
                    ],
                },
                select: { id: true, fullName: true, email: true, phone: true },
                take: 10,
            });
            customers = customerRecords.map((c) => ({
                id: c.id,
                fullName: c.fullName,
                email: c.email,
                phone: c.phone || undefined,
            }));
        }

        // 2. Search Appointments (tenant-isolated, location-filtered & guarded)
        let appointments: any[] = [];
        if (canReadAppointments) {
            const appointmentRecords = await this.prisma.appointment.findMany({
                where: {
                    organizationId,
                    ...(options.locationId ? { locationId: options.locationId } : {}),
                    customer: {
                        fullName: { contains: searchTerm, mode: "insensitive" },
                    },
                },
                select: {
                    id: true,
                    status: true,
                    startAt: true,
                    customer: { select: { fullName: true } },
                },
                take: 10,
            });
            appointments = appointmentRecords.map((a) => ({
                id: a.id,
                reference: a.id.slice(0, 8),
                status: a.status,
                customerName: a.customer?.fullName,
                startAt: a.startAt.toISOString(),
            }));
        }

        // 3. Search Staff (tenant-isolated & guarded)
        let staff: any[] = [];
        if (canReadStaff) {
            const staffRecords = await this.prisma.staffProfile.findMany({
                where: {
                    organizationId,
                    displayName: { contains: searchTerm, mode: "insensitive" },
                    isActive: true,
                },
                select: { id: true, displayName: true },
                take: 10,
            });
            staff = staffRecords.map((s) => ({
                id: s.id,
                fullName: s.displayName,
                email: "",
            }));
        }

        // 4. Search Services (tenant-isolated & guarded)
        let services: any[] = [];
        if (canReadServices) {
            const serviceRecords = await this.prisma.service.findMany({
                where: {
                    organizationId,
                    name: { contains: searchTerm, mode: "insensitive" },
                    isActive: true,
                },
                select: { id: true, name: true, priceCents: true },
                take: 10,
            });
            services = serviceRecords.map((s) => ({
                id: s.id,
                name: s.name,
                priceCents: s.priceCents,
            }));
        }

        return {
            customers,
            appointments,
            staff,
            services,
        };
    }
}
