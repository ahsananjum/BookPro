import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { CalculatePricingQuoteDto, PricingQuoteResponseDto } from "@bookpro/contracts";
import * as crypto from "crypto";

@Injectable()
export class PricingService {
    private readonly logger = new Logger(PricingService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Authoritative commercial calculation engine.
     * Guaranteed integer minor units (cents) with zero floating-point drift.
     */
    async calculateQuote(
        organizationId: string,
        dto: CalculatePricingQuoteDto
    ): Promise<PricingQuoteResponseDto> {
        if (!dto.serviceId) {
            throw new BadRequestException("serviceId is required for pricing calculation");
        }

        const service = await this.prisma.service.findFirst({
            where: {
                id: dto.serviceId,
                organizationId,
                isActive: true,
                archivedAt: null,
            },
        });

        if (!service) {
            throw new NotFoundException(`Service with ID ${dto.serviceId} not found`);
        }

        const basePriceCents = service.priceCents;
        let staffOverrideCents = 0;
        let locationOverrideCents = 0;
        let addOnsCents = 0;

        // 1. Staff Override Calculation
        if (dto.staffId) {
            const staffService = await this.prisma.staffService.findFirst({
                where: {
                    staffId: dto.staffId,
                    serviceId: dto.serviceId,
                },
            });

            if (staffService && staffService.customPriceCents !== null && staffService.customPriceCents !== undefined) {
                staffOverrideCents = staffService.customPriceCents - basePriceCents;
            }
        }

        // 2. Add-ons Calculation
        if (dto.addOnIds && dto.addOnIds.length > 0) {
            const addOnServices = await this.prisma.service.findMany({
                where: {
                    id: { in: dto.addOnIds },
                    organizationId,
                    isActive: true,
                },
            });
            addOnsCents = addOnServices.reduce((sum: number, s: { priceCents: number }) => sum + s.priceCents, 0);
        }

        const netSubtotalCents = Math.max(0, basePriceCents + staffOverrideCents + locationOverrideCents + addOnsCents);

        // 3. Tax Calculation (Location-scoped + Service taxBehavior authoritative)
        let taxRatePct = 0;
        if (dto.locationId) {
            const location = await this.prisma.location.findFirst({
                where: { id: dto.locationId, organizationId },
            });
            if (location && location.taxRatePct !== null && location.taxRatePct !== undefined) {
                taxRatePct = Number(location.taxRatePct);
            }
        }

        const taxBehavior = (service.taxBehavior as "EXCLUSIVE" | "INCLUSIVE" | "NONE") || "EXCLUSIVE";
        let taxCents = 0;

        if (taxBehavior === "NONE" || taxRatePct <= 0) {
            taxCents = 0;
        } else if (taxBehavior === "INCLUSIVE") {
            // Tax is embedded in the price: tax = price - (price / (1 + rate%))
            taxCents = Math.round(netSubtotalCents - (netSubtotalCents / (1 + taxRatePct / 100)));
        } else {
            // EXCLUSIVE: Tax is added on top
            taxCents = Math.round((netSubtotalCents * taxRatePct) / 100);
        }

        // 4. Coupon Discount Calculation
        let discountCents = 0;
        let appliedCouponCode: string | undefined = undefined;

        if (dto.couponCode) {
            const coupon = await this.prisma.coupon.findFirst({
                where: {
                    organizationId,
                    code: dto.couponCode.trim().toUpperCase(),
                    isActive: true,
                },
            });

            if (coupon) {
                const now = new Date();
                const isValidDate =
                    (!coupon.validFrom || coupon.validFrom <= now) &&
                    (!coupon.validTo || coupon.validTo >= now);
                const isValidMinSpend =
                    !coupon.minSpendCents || netSubtotalCents >= coupon.minSpendCents;
                const isValidUsage =
                    !coupon.usageLimit || coupon.usageCount < coupon.usageLimit;

                if (isValidDate && isValidMinSpend && isValidUsage) {
                    appliedCouponCode = coupon.code;
                    if (coupon.discountType === "PERCENTAGE") {
                        // Support percentage either as direct percent (e.g. 20) or basis points (e.g. 2000)
                        const rateBps = coupon.discountValue <= 100 ? coupon.discountValue * 100 : coupon.discountValue;
                        discountCents = Math.round((netSubtotalCents * rateBps) / 10000);
                    } else {
                        discountCents = coupon.discountValue;
                    }

                    if (coupon.maxDiscountCents && discountCents > coupon.maxDiscountCents) {
                        discountCents = coupon.maxDiscountCents;
                    }

                    discountCents = Math.min(netSubtotalCents, discountCents);
                }
            }
        }

        const totalCents = taxBehavior === "EXCLUSIVE"
            ? Math.max(0, netSubtotalCents + taxCents - discountCents)
            : Math.max(0, netSubtotalCents - discountCents);

        // 5. Deposit Calculation
        let depositCents = 0;
        if (service.depositType === "PERCENTAGE" && service.depositValue) {
            const pct = service.depositValue <= 100 ? service.depositValue : service.depositValue / 100;
            depositCents = Math.round((totalCents * pct) / 100);
        } else if ((service.depositType === "FIXED" || service.depositType === "FIXED_AMOUNT") && service.depositValue) {
            depositCents = Math.min(totalCents, service.depositValue);
        } else if (service.depositType === "NONE") {
            depositCents = 0;
        }

        const isZeroDeposit = service.depositType === "NONE" || depositCents === 0;
        const payableNowCents = isZeroDeposit ? 0 : depositCents;
        const remainingBalanceCents = isZeroDeposit ? totalCents : Math.max(0, totalCents - payableNowCents);

        // 6. Deterministic Quote Version Tag
        const quoteVersion = crypto
            .createHash("sha256")
            .update(`${service.id}_${totalCents}_${payableNowCents}_${appliedCouponCode || ""}_${service.version}`)
            .digest("hex")
            .substring(0, 12);

        return {
            serviceId: service.id,
            basePriceCents,
            addOnsCents,
            staffOverrideCents,
            locationOverrideCents,
            taxCents,
            taxBehavior,
            taxRatePct,
            discountCents,
            totalCents,
            depositCents,
            payableNowCents,
            remainingBalanceCents,
            currency: service.currency || "USD",
            quoteVersion,
            appliedCouponCode,
        };
    }
}
