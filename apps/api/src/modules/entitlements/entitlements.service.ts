import { Injectable, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

export type EntitlementLimitKey = "maxStaff" | "maxLocations" | "maxMonthlyBookings";

@Injectable()
export class EntitlementsService {
    constructor(private readonly prisma: PrismaService) { }

    async checkLimit(
        organizationId: string,
        limitKey: EntitlementLimitKey,
        currentCount: number
    ): Promise<boolean> {
        // Check feature override first
        const override = await this.prisma.featureOverride.findUnique({
            where: {
                organizationId_featureKey: {
                    organizationId,
                    featureKey: limitKey,
                },
            },
        });

        let allowedLimit = override?.limitOverride;

        if (allowedLimit === undefined || allowedLimit === null) {
            // Fallback to active plan
            const entitlement = await this.prisma.entitlement.findFirst({
                where: {
                    organizationId,
                    status: "ACTIVE",
                },
                include: {
                    plan: true,
                },
            });

            // Default Starter baseline limits if no plan attached
            const defaultPlanLimits: Record<EntitlementLimitKey, number> = {
                maxStaff: 5,
                maxLocations: 1,
                maxMonthlyBookings: 500,
            };

            allowedLimit = entitlement?.plan
                ? entitlement.plan[limitKey]
                : defaultPlanLimits[limitKey];
        }

        if (currentCount >= allowedLimit) {
            throw new ForbiddenException({
                code: "ENTITLEMENT_LIMIT_EXCEEDED",
                message: `Organization has reached the plan limit for ${limitKey} (${allowedLimit}). Please upgrade your plan.`,
                details: {
                    limitKey,
                    allowedLimit,
                    currentCount,
                },
            });
        }

        return true;
    }

    async hasFeature(organizationId: string, featureKey: string): Promise<boolean> {
        const override = await this.prisma.featureOverride.findUnique({
            where: {
                organizationId_featureKey: {
                    organizationId,
                    featureKey,
                },
            },
        });

        if (override !== null) {
            return override.enabled;
        }

        const entitlement = await this.prisma.entitlement.findFirst({
            where: {
                organizationId,
                status: "ACTIVE",
            },
            include: {
                plan: true,
            },
        });

        if (!entitlement || !entitlement.plan || !entitlement.plan.features) {
            return true; // Default feature availability in baseline tier
        }

        const features = entitlement.plan.features as Record<string, boolean>;
        return features[featureKey] !== false;
    }
}
