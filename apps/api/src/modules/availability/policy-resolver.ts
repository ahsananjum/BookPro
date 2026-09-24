import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { Instant, Clock, SystemClock } from "@bookpro/server-core";

export interface ResolvedPolicy {
    id?: string;
    minNoticeHours: number;
    maxNoticeDays: number;
    minNoticeInstant: Instant;
    maxNoticeInstant: Instant;
    cancelCutoffHours: number;
    cancelFeeType: string;
    cancelFeeValue: number;
    rescheduleCutoffHours: number;
    holdDurationMinutes: number;
    waitlistOfferExpiryMinutes: number;
    resolvedFrom?: "SERVICE" | "LOCATION" | "ORGANIZATION" | "DEFAULT_SYSTEM_FALLBACK";
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

    /**
     * Resolves policy rules using strict 3-tier precedence: Service > Location > Organization level.
     * Guarantees that specific service rules cannot be overridden by location or org fallbacks.
     */
    async resolvePolicy(
        organizationId: string,
        locationId?: string | null,
        serviceId?: string | null,
    ): Promise<ResolvedPolicy> {
        const [servicePolicy, locationPolicy, orgPolicy] = await Promise.all([
            serviceId
                ? this.prisma.policyConfig.findFirst({ where: { organizationId, serviceId } })
                : null,
            locationId
                ? this.prisma.policyConfig.findFirst({ where: { organizationId, locationId, serviceId: null } })
                : null,
            this.prisma.policyConfig.findFirst({ where: { organizationId, locationId: null, serviceId: null } }),
        ]);

        const policy = servicePolicy || locationPolicy || orgPolicy;
        const resolvedFrom = servicePolicy ? "SERVICE" : locationPolicy ? "LOCATION" : orgPolicy ? "ORGANIZATION" : "DEFAULT_SYSTEM_FALLBACK";

        const minNoticeHours = policy?.minNoticeHours !== undefined && policy?.minNoticeHours !== null ? policy.minNoticeHours : 0;
        const maxNoticeDays = policy?.maxNoticeDays ?? 60;
        const cancelCutoffHours = policy?.cancelCutoffHours ?? 24;
        const cancelFeeType = policy?.cancelFeeType ?? "NONE";
        const cancelFeeValue = policy?.cancelFeeValue ?? 0;
        const rescheduleCutoffHours = policy?.rescheduleCutoffHours ?? 24;
        const holdDurationMinutes = policy?.holdDurationMinutes ?? 10;
        const waitlistOfferExpiryMinutes = policy?.waitlistOfferExpiryMinutes ?? 15;

        const now = this.clock.now();
        const minNoticeInstant = now.addMinutes(minNoticeHours * 60);
        const maxNoticeInstant = now.addMinutes(maxNoticeDays * 24 * 60);

        return {
            id: policy?.id,
            minNoticeHours,
            maxNoticeDays,
            minNoticeInstant,
            maxNoticeInstant,
            cancelCutoffHours,
            cancelFeeType,
            cancelFeeValue,
            rescheduleCutoffHours,
            holdDurationMinutes,
            waitlistOfferExpiryMinutes,
            resolvedFrom,
        };
    }
}

