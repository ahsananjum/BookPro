import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../database/prisma.service";
import { InviteUserDto, ChangeRoleDto } from "@bookpro/validation";
import { RequestContext, ActorType } from "@bookpro/contracts";
import { EncryptionService } from "@bookpro/server-core";

@Injectable()
export class MembershipService {
    constructor(private readonly prisma: PrismaService) { }

    async inviteUser(dto: InviteUserDto, ctx: RequestContext) {
        if (!ctx.organizationId) {
            throw new BadRequestException({
                code: "ORGANIZATION_REQUIRED",
                message: "Organization context is required to invite staff",
            });
        }

        const existingInvitation = await this.prisma.invitation.findFirst({
            where: {
                organizationId: ctx.organizationId,
                email: dto.email.toLowerCase(),
                status: "PENDING",
            },
        });

        if (existingInvitation) {
            throw new BadRequestException({
                code: "INVITATION_ALREADY_EXISTS",
                message: "A pending invitation already exists for this email",
            });
        }

        const token = crypto.randomBytes(32).toString("base64url");
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const encryptedInvitationToken = EncryptionService.encrypt(token);
        const invitation = await this.prisma.$transaction(async (tx) => {
            const created = await tx.invitation.create({ data: { organizationId: ctx.organizationId!, email: dto.email.toLowerCase(), roleCode: dto.roleCode as any, locationIds: (dto.locationIds ?? []) as any, tokenHash, expiresAt, createdBy: ctx.subjectId } });
            await tx.auditLog.create({ data: { organizationId: ctx.organizationId!, actorType: ctx.actorType, actorId: ctx.subjectId, action: "membership.invite", resourceType: "Invitation", resourceId: created.id, payload: { email: dto.email, roleCode: dto.roleCode }, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent } });
            await tx.outboxEvent.create({ data: { organizationId: ctx.organizationId!, aggregateType: "Invitation", aggregateId: created.id, eventType: "identity.staff_invitation_requested", payload: { invitationId: created.id, recipientEmail: created.email, encryptedInvitationToken, expiresAt: expiresAt.toISOString() } } });
            return created;
        });

        const { tokenHash: _tokenHash, ...safeInvitation } = invitation;
        return safeInvitation;
    }

    async changeRole(dto: ChangeRoleDto, ctx: RequestContext) {
        if (!ctx.organizationId) {
            throw new BadRequestException({
                code: "ORGANIZATION_REQUIRED",
                message: "Organization context is required",
            });
        }

        const membership = await this.prisma.membership.findFirst({
            where: {
                id: dto.membershipId,
                organizationId: ctx.organizationId,
            },
        });

        if (!membership) {
            throw new NotFoundException({
                code: "MEMBERSHIP_NOT_FOUND",
                message: "Membership not found in this organization",
            });
        }

        const updated = await this.prisma.membership.update({
            where: { id: membership.id },
            data: {
                roleCode: dto.roleCode as any,
                locationIds: (dto.locationIds ?? []) as any,
            },
        });

        await this.prisma.auditLog.create({
            data: {
                organizationId: ctx.organizationId,
                actorType: ctx.actorType,
                actorId: ctx.subjectId,
                action: "membership.change_role",
                resourceType: "Membership",
                resourceId: membership.id,
                payload: {
                    oldRoleCode: membership.roleCode,
                    newRoleCode: dto.roleCode,
                },
            },
        });

        return updated;
    }

    async deactivateMembership(membershipId: string, ctx: RequestContext) {
        if (!ctx.organizationId) {
            throw new BadRequestException({
                code: "ORGANIZATION_REQUIRED",
                message: "Organization context is required",
            });
        }

        const membership = await this.prisma.membership.findFirst({
            where: {
                id: membershipId,
                organizationId: ctx.organizationId,
            },
        });

        if (!membership) {
            throw new NotFoundException({
                code: "MEMBERSHIP_NOT_FOUND",
                message: "Membership not found in this organization",
            });
        }

        const deactivated = await this.prisma.membership.update({
            where: { id: membership.id },
            data: { status: "INACTIVE" },
        });

        await this.prisma.auditLog.create({
            data: {
                organizationId: ctx.organizationId,
                actorType: ctx.actorType,
                actorId: ctx.subjectId,
                action: "membership.deactivate",
                resourceType: "Membership",
                resourceId: membership.id,
            },
        });

        return deactivated;
    }

    async listMembers(ctx: RequestContext) {
        if (!ctx.organizationId) {
            throw new BadRequestException({
                code: "ORGANIZATION_REQUIRED",
                message: "Organization context is required",
            });
        }

        return this.prisma.membership.findMany({
            where: { organizationId: ctx.organizationId },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        fullName: true,
                        phone: true,
                    },
                },
            },
        });
    }
}
