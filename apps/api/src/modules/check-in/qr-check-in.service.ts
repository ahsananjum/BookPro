import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    UnauthorizedException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../database/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { QrCheckInPassDto, QrCheckInResultDto } from "@bookpro/contracts";

@Injectable()
export class QrCheckInService {
    private readonly logger = new Logger(QrCheckInService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly realtimeService: RealtimeService
    ) {}

    private getSigningSecret(): string {
        const secret = process.env.QR_SIGNING_SECRET;
        if (!secret || secret.length < 32) throw new Error("QR_SIGNING_SECRET must be configured independently with at least 32 characters");
        return secret;
    }

    /**
     * Generates a signed cryptographic QR pass for an appointment.
     */
    async generatePass(
        appointmentId: string,
        organizationId: string,
        customerId?: string
    ): Promise<QrCheckInPassDto> {
        const appointment = await this.prisma.appointment.findFirst({
            where: {
                id: appointmentId,
                organizationId,
                ...(customerId ? { customerId } : {}),
            },
            include: { location: true, service: true, staff: true },
        });

        if (!appointment) {
            throw new NotFoundException(`Appointment ${appointmentId} not found.`);
        }

        const now = new Date();
        const startAt = appointment.startAt;
        const endAt = appointment.endAt;

        // Valid check-in window: 60 minutes before startAt until 5 minutes after startAt
        const eligibleStart = new Date(startAt.getTime() - 60 * 60 * 1000);
        const eligibleEnd = new Date(startAt.getTime() + 5 * 60 * 1000);
        const isEligibleNow = now >= eligibleStart && now <= eligibleEnd;
        const isExpired = now > eligibleEnd;
        const isVoid = appointment.status === "CANCELLED";

        // Generate signed token: appointmentId.orgId.locId.timestamp.signature
        const timestamp = startAt.getTime().toString();
        const payload = `${appointment.id}:${appointment.organizationId}:${appointment.locationId}:${timestamp}`;
        const signature = crypto
            .createHmac("sha256", this.getSigningSecret())
            .update(payload)
            .digest("hex")
            .slice(0, 32);

        const qrToken = `${payload}:${signature}`;

        return {
            appointmentId: appointment.id,
            organizationId: appointment.organizationId,
            locationId: appointment.locationId,
            locationName: appointment.location?.name || "Salon",
            serviceName: appointment.service?.name || "Service",
            staffName: appointment.staff?.displayName || null,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            qrToken,
            expiresAt: eligibleEnd.toISOString(),
            isEligibleNow,
            status: appointment.status,
            isExpired,
            isVoid,
        };
    }

    /**
     * Verifies signed QR pass token and performs instant appointment check-in.
     */
    async verifyAndCheckIn(token: string): Promise<QrCheckInResultDto> {
        if (!token || typeof token !== "string") {
            throw new BadRequestException("Check-in token is required.");
        }

        let cleanToken = decodeURIComponent(token.trim());
        if (cleanToken.includes("token=")) {
            cleanToken = cleanToken.split("token=")[1].split("&")[0];
        } else if (cleanToken.includes("pass=")) {
            cleanToken = cleanToken.split("pass=")[1].split("&")[0];
        }

        const parts = cleanToken.split(":");
        let appointmentId: string;
        let organizationId: string | undefined;

        if (parts.length === 5) {
            // Standard 5-part cryptographic HMAC token: apptId:orgId:locId:timestamp:signature
            const [apptId, orgId, locationId, timestampStr, providedSignature] = parts;
            appointmentId = apptId;
            organizationId = orgId;

            // 1. Verify HMAC signature
            const payload = `${apptId}:${orgId}:${locationId}:${timestampStr}`;
            const expectedSignature = crypto
                .createHmac("sha256", this.getSigningSecret())
                .update(payload)
                .digest("hex")
                .slice(0, 32);

            const supplied = Buffer.from(providedSignature, "hex");
            const expected = Buffer.from(expectedSignature, "hex");
            if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
                throw new UnauthorizedException("Invalid QR check-in signature or tampered token.");
            }
        } else if (parts.length === 2) {
            // Legacy 2-part format: apptId:orgId
            appointmentId = parts[0];
            organizationId = parts[1];
        } else if (parts.length === 1 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parts[0])) {
            // Raw appointment UUID (legacy test passes)
            appointmentId = parts[0];
        } else {
            throw new BadRequestException("Invalid QR check-in pass format. Please scan a valid appointment pass.");
        }

        // 2. Fetch authoritative appointment from database
        const appointment = await this.prisma.appointment.findFirst({
            where: {
                id: appointmentId,
                ...(organizationId ? { organizationId } : {}),
            },
            include: { customer: true, service: true, staff: true },
        });

        if (!appointment) {
            throw new NotFoundException(`Appointment ${appointmentId} not found in database.`);
        }

        const effectiveOrgId = appointment.organizationId;
        const locationId = appointment.locationId;

        // 3. Verify status
        if (appointment.status === "CHECKED_IN" || appointment.status === "IN_PROGRESS" || appointment.status === "COMPLETED") {
            return {
                success: true,
                appointmentId: appointment.id,
                checkedInAt: appointment.checkInAt?.toISOString() || new Date().toISOString(),
                customerName: appointment.customer?.fullName || "Customer",
                serviceName: appointment.service?.name || "Service",
                staffName: appointment.staff?.displayName || null,
                message: `Customer already checked in at ${appointment.checkInAt?.toLocaleTimeString() || "earlier"}.`,
            };
        }

        if (appointment.status === "CANCELLED") {
            throw new BadRequestException("Cannot check in. This appointment has been cancelled.");
        }

        if (appointment.status === "NO_SHOW") {
            throw new BadRequestException("Cannot check in. This appointment has been marked as No-Show.");
        }

        // 4. Verify check-in time window (-60m to +5m)
        const now = new Date();
        const startAt = appointment.startAt;
        const windowStart = new Date(startAt.getTime() - 60 * 60 * 1000);
        const windowEnd = new Date(startAt.getTime() + 5 * 60 * 1000);

        if (now < windowStart) {
            throw new BadRequestException(
                `Check-in is too early. Opens 60 minutes before scheduled start time (${startAt.toLocaleTimeString()}).`
            );
        }
        if (now > windowEnd) {
            // Check-in window closed: auto-mark as NO_SHOW if confirmed
            if (appointment.status === "CONFIRMED") {
                await this.prisma.appointment.update({
                    where: { id: appointment.id },
                    data: {
                        status: "NO_SHOW",
                        version: { increment: 1 },
                    },
                });

                await this.prisma.appointmentHistory.create({
                    data: {
                        appointmentId: appointment.id,
                        actorType: "SYSTEM",
                        actorId: "QR_SCANNER",
                        action: "STATUS_CHANGE",
                        fromStatus: "CONFIRMED",
                        toStatus: "NO_SHOW",
                        changes: {
                            reason: "Check-in window expired: scanned after 5-minute grace period elapsed. Auto-marked as No-Show.",
                            scannedAt: now.toISOString(),
                            startAt: startAt.toISOString(),
                        },
                    },
                });

                await this.prisma.outboxEvent.create({
                    data: {
                        organizationId: effectiveOrgId,
                        aggregateType: "Appointment",
                        aggregateId: appointment.id,
                        eventType: "appointment.no_show",
                        payload: {
                            appointmentId: appointment.id,
                            fromStatus: "CONFIRMED",
                            toStatus: "NO_SHOW",
                            reason: "Check-in window expired",
                        },
                        status: "PENDING",
                    },
                });

                try {
                    await this.realtimeService.broadcastEvent({
                        organizationId: effectiveOrgId,
                        type: "appointment.updated",
                        entityId: appointment.id,
                        version: appointment.version + 1,
                        timestamp: now.toISOString(),
                        correlationId: `noshow_qr_${now.getTime()}`,
                    });
                } catch (e: any) {
                    this.logger.warn(`[QrCheckIn] Realtime emit error: ${e.message}`);
                }
            }

            throw new BadRequestException(
                `Check-in window closed. 5 minutes grace period elapsed. Appointment has been automatically marked as No-Show.`
            );
        }

        // 5. Update appointment status to CHECKED_IN
        const updated = await this.prisma.appointment.update({
            where: { id: appointment.id },
            data: {
                status: "CHECKED_IN",
                checkInAt: now,
                version: { increment: 1 },
            },
            include: { customer: true, service: true, staff: true },
        });

        // 6. Record Appointment History & Audit Log
        await this.prisma.appointmentHistory.create({
            data: {
                appointmentId: appointment.id,
                actorType: "STAFF",
                actorId: "QR_SCANNER",
                action: "STATUS_CHANGE",
                fromStatus: appointment.status,
                toStatus: "CHECKED_IN",
                changes: {
                    reason: "Verified cryptographic QR pass scan on-site",
                    checkInAt: now.toISOString(),
                },
            },
        });

        await this.prisma.outboxEvent.create({
            data: {
                organizationId: effectiveOrgId,
                aggregateType: "Appointment",
                aggregateId: appointment.id,
                eventType: "appointment.checked_in",
                payload: {
                    appointmentId: appointment.id,
                    fromStatus: appointment.status,
                    toStatus: "CHECKED_IN",
                    checkInAt: now.toISOString(),
                },
                status: "PENDING",
            },
        });

        await this.prisma.auditLog.create({
            data: {
                organizationId: effectiveOrgId,
                actorType: "CUSTOMER",
                actorId: appointment.customerId,
                action: "appointment.qr_checked_in",
                resourceType: "appointment",
                resourceId: appointment.id,
                payload: {
                    checkInAt: now.toISOString(),
                    locationId,
                },
            },
        });

        // 7. Emit Realtime SSE Event
        try {
            await this.realtimeService.broadcastEvent({
                organizationId: effectiveOrgId,
                type: "appointment.updated",
                entityId: appointment.id,
                version: updated.version,
                timestamp: now.toISOString(),
                correlationId: `qr_${now.getTime()}`,
            });
        } catch (e: any) {
            this.logger.warn(`[QrCheckIn] Realtime emit error: ${e.message}`);
        }

        this.logger.log(`[QrCheckIn] Customer ${updated.customer?.fullName} checked in for appointment ${appointment.id}`);

        return {
            success: true,
            appointmentId: updated.id,
            checkedInAt: now.toISOString(),
            customerName: updated.customer?.fullName || "Customer",
            serviceName: updated.service?.name || "Service",
            staffName: updated.staff?.displayName || null,
            message: "Check-in successful! Welcome.",
        };
    }
}
