import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    BadRequestException,
} from "@nestjs/common";
import { ReqContext, Public, RequirePermissions } from "@bookpro/server-core";
import { RequestContext, PermissionKey } from "@bookpro/contracts";
import { verifyQrCheckInSchema } from "@bookpro/validation";
import { QrCheckInService } from "./qr-check-in.service";

@Controller("appointments")
export class QrCheckInController {
    constructor(private readonly qrCheckInService: QrCheckInService) {}

    @Get(":id/qr-pass")
    @RequirePermissions(PermissionKey.APPOINTMENT_READ)
    async getQrPass(
        @Param("id") appointmentId: string,
        @ReqContext() ctx: RequestContext
    ) {
        const organizationId = ctx.organizationId;
        if (!organizationId) {
            throw new BadRequestException("Organization context missing.");
        }

        const customerId = ctx.customerId || undefined;
        return this.qrCheckInService.generatePass(appointmentId, organizationId, customerId);
    }

    @Public()
    @Post("check-in/qr")
    async checkInWithQr(@Body() body: unknown) {
        const parsed = verifyQrCheckInSchema.safeParse(body || {});
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.format());
        }

        return this.qrCheckInService.verifyAndCheckIn(parsed.data.token);
    }
}
