import { Controller, Post, Body, Param, Headers } from "@nestjs/common";
import { RefundsService } from "./refunds.service";
import { ProcessRefundDto, PermissionKey, RequestContext } from "@bookpro/contracts";
import { RequirePermissions, ReqContext } from "@bookpro/server-core";
import { processRefundSchema } from "@bookpro/validation";

@Controller("organizations/:orgId/refunds")
export class RefundsController {
    constructor(private readonly refundsService: RefundsService) { }

    @Post()
    @RequirePermissions(PermissionKey.REFUND_MANAGE)
    async processRefund(
        @Param("orgId") orgId: string,
        @Body() body: unknown,
        @Headers("x-idempotency-key") idempotencyKey?: string,
        @ReqContext() ctx?: RequestContext,
    ) {
        const organizationId = ctx?.organizationId || orgId;
        const dto: ProcessRefundDto = processRefundSchema.parse(body);
        return this.refundsService.processRefund(organizationId, {
            ...dto,
            organizationId,
            idempotencyKey: idempotencyKey || dto.idempotencyKey,
            actorId: dto.actorId || ctx?.subjectId,
            actorType: dto.actorType || (ctx?.actorType as any) || "STAFF",
        });
    }
}
