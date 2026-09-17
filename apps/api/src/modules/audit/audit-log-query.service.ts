import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { AuditLogDto, AuditLogQueryInput } from "@bookpro/contracts";

@Injectable()
export class AuditLogQueryService {
    private readonly logger = new Logger(AuditLogQueryService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Paginated and filterable tenant audit-log query.
     */
    async listAuditLogs(
        organizationId: string,
        query: AuditLogQueryInput = {}
    ): Promise<{ logs: AuditLogDto[]; total: number }> {
        const where: any = { organizationId };

        if (query.actorType) {
            where.actorType = query.actorType;
        }
        if (query.action) {
            where.action = { contains: query.action, mode: "insensitive" };
        }
        if (query.resourceType) {
            where.resourceType = query.resourceType;
        }
        if (query.startDate || query.endDate) {
            where.createdAt = {};
            if (query.startDate) {
                where.createdAt.gte = new Date(`${query.startDate}T00:00:00.000Z`);
            }
            if (query.endDate) {
                where.createdAt.lte = new Date(`${query.endDate}T23:59:59.999Z`);
            }
        }

        const [records, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: query.limit || 50,
                skip: query.offset || 0,
            }),
            this.prisma.auditLog.count({ where }),
        ]);

        return {
            logs: records.map((r) => this.toDto(r)),
            total,
        };
    }

    private toDto(record: any): AuditLogDto {
        return {
            id: record.id,
            organizationId: record.organizationId,
            actorType: record.actorType,
            actorId: record.actorId,
            action: record.action,
            resourceType: record.resourceType,
            resourceId: record.resourceId,
            payload: this.redactSecrets(record.payload),
            ipAddress: record.ipAddress,
            userAgent: record.userAgent,
            createdAt: record.createdAt.toISOString(),
        };
    }

    private redactSecrets(payload: any): any {
        if (!payload || typeof payload !== "object") return payload;
        const redacted = { ...payload };
        const secretKeys = ["password", "token", "secret", "cvv", "creditCard", "apiKey", "refreshToken"];

        for (const key of Object.keys(redacted)) {
            if (secretKeys.some((sk) => key.toLowerCase().includes(sk))) {
                redacted[key] = "[REDACTED]";
            } else if (typeof redacted[key] === "object") {
                redacted[key] = this.redactSecrets(redacted[key]);
            }
        }
        return redacted;
    }
}
