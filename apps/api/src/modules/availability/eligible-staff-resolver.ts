import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

export interface EligibleStaff {
    id: string;
    displayName: string;
    availabilities: any[];
    breaks: any[];
    leaves: any[];
}

@Injectable()
export class EligibleStaffResolver {
    constructor(private readonly prisma: PrismaService) { }

    async resolveEligibleStaff(
        organizationId: string,
        locationId: string,
        serviceId: string,
        staffIdFilter?: string,
    ): Promise<EligibleStaff[]> {
        // A slot is only bookable when the staff member is explicitly assigned to
        // both the selected location and service. The reservation validator uses
        // this same rule, so search must never advertise a broader candidate set.
        const staff = await this.prisma.staffProfile.findMany({
            where: {
                organizationId,
                archivedAt: null,
                isActive: true,
                staffLocations: { some: { locationId } },
                staffServices: { some: { serviceId } },
                ...(staffIdFilter ? { id: staffIdFilter } : {}),
            },
            include: {
                availabilities: true,
                breaks: true,
                leaves: { where: { status: "APPROVED" } },
            },
        });

        return staff;
    }
}
