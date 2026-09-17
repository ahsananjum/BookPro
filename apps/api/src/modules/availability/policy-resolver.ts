import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { Instant, Clock, SystemClock } from "@bookpro/server-core";

export interface ResolvedPolicy {
    minNoticeHours: number;
    maxNoticeDays: number;
    minNoticeInstant: Instant;
    maxNoticeInstant: Instant;
    cancelCutoffHours: number;
    cancelFeeType: string;
    cancelFeeValue: number;
}

@Injectable()
export class PolicyResolver {
    private clock: Clock;

    constructor(private readonly prisma: PrismaService) {
        this.clock = new SystemClock();
    }

    setClock(clock: Clock): void {
        this.clock = clock;
    }

    async resolvePolicy(
        organizationId: string,
        locationId: string,
        serviceId?: string,
    ): Promise<ResolvedPolicy> {
        const policy = await this.prisma.policyConfig.findFirst({
            where: {
                organizationId,
                OR: [{ serviceId }, { locationId }, { locationId: null, serviceId: null }],
            },
            orderBy: { serviceId: "desc" },
        });

        const minNoticeHours = policy?.minNoticeHours !== undefined && policy?.minNoticeHours !== null ? policy.minNoticeHours : 0;
        const maxNoticeDays = policy?.maxNoticeDays ?? 60;
        const cancelCutoffHours = policy?.cancelCutoffHours ?? 24;
        const cancelFeeType = policy?.cancelFeeType ?? "NONE";
        const cancelFeeValue = policy?.cancelFeeValue ?? 0;

        const now = this.clock.now();
        const minNoticeInstant = now.addMinutes(minNoticeHours * 60);
        const maxNoticeInstant = now.addMinutes(maxNoticeDays * 24 * 60);

        return {
            minNoticeHours,
            maxNoticeDays,
            minNoticeInstant,
            maxNoticeInstant,
            cancelCutoffHours,
            cancelFeeType,
            cancelFeeValue,
        };
    }
}

