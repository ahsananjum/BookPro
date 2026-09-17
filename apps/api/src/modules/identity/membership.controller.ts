import { Controller, Post, Delete, Get, Body, Param, HttpCode, HttpStatus } from "@nestjs/common";
import { RequirePermissions, ReqContext } from "@bookpro/server-core";
import { PermissionKey, RequestContext } from "@bookpro/contracts";
import { MembershipService } from "./membership.service";
import { InviteUserDto, ChangeRoleDto, inviteUserSchema, changeRoleSchema } from "@bookpro/validation";

@Controller("identity")
export class MembershipController {
    constructor(private readonly membershipService: MembershipService) { }

    @RequirePermissions(PermissionKey.STAFF_INVITE)
    @Post("invite")
    @HttpCode(HttpStatus.CREATED)
    async inviteUser(@Body() body: InviteUserDto, @ReqContext() ctx: RequestContext) {
        const validated = inviteUserSchema.parse(body);
        return this.membershipService.inviteUser(validated, ctx);
    }

    @RequirePermissions(PermissionKey.STAFF_MANAGE)
    @Post("role")
    @HttpCode(HttpStatus.OK)
    async changeRole(@Body() body: ChangeRoleDto, @ReqContext() ctx: RequestContext) {
        const validated = changeRoleSchema.parse(body);
        return this.membershipService.changeRole(validated, ctx);
    }

    @RequirePermissions(PermissionKey.STAFF_MANAGE)
    @Delete("memberships/:id")
    @HttpCode(HttpStatus.OK)
    async deactivateMembership(@Param("id") id: string, @ReqContext() ctx: RequestContext) {
        return this.membershipService.deactivateMembership(id, ctx);
    }

    @RequirePermissions(PermissionKey.STAFF_READ)
    @Get("members")
    async listMembers(@ReqContext() ctx: RequestContext) {
        return this.membershipService.listMembers(ctx);
    }
}
