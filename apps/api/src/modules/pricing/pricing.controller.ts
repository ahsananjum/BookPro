import { Controller, Post, Body, Param } from "@nestjs/common";
import { PricingService } from "./pricing.service";
import { CalculatePricingQuoteDto, PricingQuoteResponseDto, RequestContext } from "@bookpro/contracts";
import { ReqContext, Public } from "@bookpro/server-core";
import { calculatePricingQuoteSchema } from "@bookpro/validation";

@Controller("organizations/:orgId/pricing")
export class PricingController {
    constructor(private readonly pricingService: PricingService) { }

    @Public()
    @Post("calculate")
    async calculateQuote(
        @Param("orgId") orgId: string,
        @Body() body: unknown,
        @ReqContext() ctx: RequestContext,
    ): Promise<PricingQuoteResponseDto> {
        const organizationId = ctx?.organizationId || orgId;
        const dto: CalculatePricingQuoteDto = calculatePricingQuoteSchema.parse(body);
        return this.pricingService.calculateQuote(organizationId, {
            ...dto,
            organizationId,
        });
    }
}
