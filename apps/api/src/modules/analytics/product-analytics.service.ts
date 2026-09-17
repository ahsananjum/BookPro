import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { CreateProductAnalyticsEventInput, ProductAnalyticsEventDto } from "@bookpro/contracts";

@Injectable()
export class ProductAnalyticsService {
    private readonly logger = new Logger(ProductAnalyticsService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Ingests a safe product analytics event (zero raw customer free text).
     */
    async trackEvent(
        input: CreateProductAnalyticsEventInput,
        context?: {
            organizationId?: string;
            actorType?: string;
            actorId?: string;
        }
    ): Promise<ProductAnalyticsEventDto> {
        // Sanitize metadata: strip any common PII or sensitive keys
        const sanitizedMetadata = this.sanitizeMetadata(input.metadata || {});

        const record = await this.prisma.productAnalyticsEvent.create({
            data: {
                organizationId: context?.organizationId || null,
                eventType: input.eventType,
                actorType: context?.actorType || "ANONYMOUS",
                actorId: context?.actorId || null,
                sessionId: input.sessionId || null,
                metadata: sanitizedMetadata,
            },
        });

        return {
            id: record.id,
            organizationId: record.organizationId,
            eventType: record.eventType,
            actorType: record.actorType,
            actorId: record.actorId,
            sessionId: record.sessionId,
            metadata: record.metadata as any,
            createdAt: record.createdAt.toISOString(),
        };
    }

    private sanitizeMetadata(meta: Record<string, any>): Record<string, any> {
        const forbiddenKeys = ["password", "token", "secret", "note", "comment", "message", "email", "phone", "name"];
        const cleaned: Record<string, any> = {};

        for (const [key, value] of Object.entries(meta)) {
            const isForbidden = forbiddenKeys.some((fk) => key.toLowerCase().includes(fk));
            if (!isForbidden) {
                cleaned[key] = value;
            }
        }

        return cleaned;
    }
}
