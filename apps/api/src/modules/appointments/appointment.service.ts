import {
    Injectable,
    Logger,
    NotFoundException,
    ConflictException,
    BadRequestException,
    Optional,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ScheduleGuardService } from '../concurrency/schedule-guard.service';
import { IdempotencyService } from '../common/idempotency.service';
import { OutboxService } from '../outbox/outbox.service';
import { CommissionsService } from '../commissions/commissions.service';
import { PolicyService } from '../policy/policy.service';
import { RefundsService } from '../refunds/refunds.service';
import { AuthoritativeAvailabilityValidatorService } from '../availability/authoritative-availability-validator.service';
import { PaymentsService } from '../payments/payments.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ScheduleInsightService } from '../optimizer/schedule-insight.service';
import { RedisService } from '@bookpro/server-core';
import { Appointment, AppointmentStatus, PaymentRecordStatus, Prisma } from '@prisma/client';
import { PublicBookingStatusResponseDto } from '@bookpro/contracts';
import { organizationBookingDate } from './booking-date.util';

export interface CreateManualAppointmentInput {
    organizationId: string;
    locationId: string;
    serviceId: string;
    staffId?: string | null;
    customerId?: string | null;
    customerName?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    startAt: string;
    endAt?: string;
    partySize?: number;
    paymentStatus?: string;
    internalNotes?: string | null;
    overrideReason?: string | null;
    idempotencyKey?: string | null;
    createdById: string;
    intakeResponses?: Array<{ intakeFormId: string; responses: Record<string, any> }>;
}

export interface ConvertHoldInput {
    organizationId: string;
    bookingHoldId: string;
    customerId?: string | null;
    guestName?: string | null;
    guestEmail?: string | null;
    guestPhone?: string | null;
    paymentStatus?: string;
    idempotencyKey?: string | null;
    intakeResponses?: Array<{ intakeFormId: string; responses: Record<string, any> }>;
    isPublicFinalize?: boolean;
}

export interface RescheduleAppointmentInput {
    appointmentId: string;
    organizationId: string;
    newStartAt: string;
    newEndAt?: string;
    newStaffId?: string | null;
    actorType?: string;
    actorId?: string;
    overrideReason?: string | null;
    idempotencyKey?: string | null;
}

export interface QueryAppointmentsFilter {
    organizationId: string;
    locationId?: string;
    staffId?: string;
    membershipId?: string;
    customerId?: string;
    locationIds?: string[];
    serviceId?: string;
    status?: AppointmentStatus;
    startDate?: string;
    endDate?: string;
}

@Injectable()
export class AppointmentService {
    private readonly logger = new Logger(AppointmentService.name);

    // Allowed State Machine Transitions (Architecture §50 & PRD §21)
    private readonly ALLOWED_TRANSITIONS: Record<string, string[]> = {
        HOLD: ['PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED'],
        PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
        CONFIRMED: ['CHECKED_IN', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
        CHECKED_IN: ['IN_PROGRESS', 'CANCELLED'],
        IN_PROGRESS: ['COMPLETED'],
        CANCELLED: [],
        NO_SHOW: [],
        COMPLETED: [],
    };

    constructor(
        private readonly prisma: PrismaService,
        private readonly scheduleGuardService: ScheduleGuardService,
        private readonly idempotencyService: IdempotencyService,
        private readonly outboxService: OutboxService,
        private readonly authoritativeValidator: AuthoritativeAvailabilityValidatorService,
        @Optional() private readonly commissionsService?: CommissionsService,
        @Optional() private readonly policyService?: PolicyService,
        @Optional() private readonly refundsService?: RefundsService,
        @Optional() private readonly paymentsService?: PaymentsService,
        @Optional() private readonly realtimeService?: RealtimeService,
        @Optional() private readonly redisService?: RedisService,
        @Optional() private readonly scheduleInsightService?: ScheduleInsightService,
    ) { }

    /**
     * Creates a manual appointment from the business dashboard (PRD §22)
     * using the single authoritative availability validator pipeline.
     */
    async createManualAppointment(
        input: CreateManualAppointmentInput,
    ): Promise<Appointment> {
        const res = await this.idempotencyService.executeIdempotent<Appointment>(
            {
                organizationId: input.organizationId,
                operation: "APPOINTMENT_CREATE_MANUAL",
                idempotencyKey: input.idempotencyKey,
                payload: input,
            },
            async () => {
                // Ensure customer exists or create guest customer
                let customerId = input.customerId;
                if (!customerId) {
                    if (!input.customerEmail) {
                        throw new BadRequestException('Customer ID or email/name is required for appointment.');
                    }
                    const existingCustomer = await this.prisma.customer.findFirst({
                        where: {
                            organizationId: input.organizationId,
                            email: input.customerEmail.toLowerCase(),
                        },
                    });
                    if (existingCustomer) {
                        customerId = existingCustomer.id;
                    } else {
                        const newCustomer = await this.prisma.customer.create({
                            data: {
                                organizationId: input.organizationId,
                                fullName: input.customerName || 'Guest Customer',
                                email: input.customerEmail.toLowerCase(),
                                phone: input.customerPhone || null,
                            },
                        });
                        customerId = newCustomer.id;
                    }
                }

                // Staff Manual Override Protocol: Gracefully release waitlist hold if staff overrides slot
                if (input.overrideReason) {
                    const startDt = new Date(input.startAt);
                    const endDt = input.endAt ? new Date(input.endAt) : new Date(startDt.getTime() + 60 * 60 * 1000);
                    const overlappingOffers = await this.prisma.waitlistOffer.findMany({
                        where: {
                            organizationId: input.organizationId,
                            locationId: input.locationId,
                            status: "PENDING",
                            bookingHoldId: { not: null },
                            startAt: { lt: endDt },
                            endAt: { gt: startDt },
                        },
                        include: { waitlistEntry: { include: { customer: true } } },
                    });

                    for (const off of overlappingOffers) {
                        await this.prisma.$transaction(async (tx) => {
                            await tx.waitlistOffer.update({
                                where: { id: off.id },
                                data: { status: "REVOKED", revokedAt: new Date() },
                            });
                            if (off.bookingHoldId) {
                                await tx.bookingHold.updateMany({
                                    where: { id: off.bookingHoldId, status: "ACTIVE" },
                                    data: { status: "RELEASED" },
                                });
                            }
                            await tx.waitlistEntry.update({
                                where: { id: off.waitlistEntryId },
                                data: { status: "ACTIVE" },
                            });
                            await tx.outboxEvent.create({
                                data: {
                                    organizationId: input.organizationId,
                                    aggregateType: "WaitlistOffer",
                                    aggregateId: off.id,
                                    eventType: "waitlist.offer_revoked_by_staff_override",
                                    payload: {
                                        offerId: off.id,
                                        waitlistEntryId: off.waitlistEntryId,
                                        customerId: off.waitlistEntry.customerId,
                                        customerName: off.waitlistEntry.customer?.fullName,
                                        customerEmail: off.waitlistEntry.customer?.email,
                                        overrideReason: input.overrideReason,
                                    },
                                    status: "PENDING",
                                },
                            });
                        });

                        if (this.realtimeService) {
                            await this.realtimeService.broadcastEvent({
                                organizationId: input.organizationId,
                                type: "waitlist.offer_revoked",
                                timestamp: new Date().toISOString(),
                                metadata: { offerId: off.id, reason: "Staff manual calendar override" },
                            }).catch(() => null);
                        }
                    }
                }

                // Authoritative Reservation & Creation
                const result = await this.authoritativeValidator.validateAndReserveSlot({
                    organizationId: input.organizationId,
                    locationId: input.locationId,
                    serviceId: input.serviceId,
                    staffId: input.staffId,
                    customerId,
                    startAt: input.startAt,
                    partySize: input.partySize ?? 1,
                    targetType: 'APPOINTMENT',
                    appointmentDetails: {
                        bookingSource: 'STAFF_MANUAL',
                        paymentStatus: input.paymentStatus || 'UNPAID',
                        internalNotes: input.internalNotes || null,
                        overrideReason: input.overrideReason || null,
                        createdById: input.createdById,
                        intakeResponses: input.intakeResponses,
                    },
                    override: input.overrideReason ? {
                        reason: input.overrideReason,
                        actorId: input.createdById,
                        actorType: 'STAFF',
                    } : undefined,
                });

                return result.appointment!;
            },
        );

        return res.data;
    }

    /**
     * Converts an active BookingHold to a confirmed Appointment (PRD §20 & §27)
     * using atomic conditional status transition and unique hold constraint protection.
     */
    async convertHoldToAppointment(input: ConvertHoldInput): Promise<Appointment> {
        const res = await this.idempotencyService.executeIdempotent<Appointment>(
            {
                organizationId: input.organizationId,
                operation: "APPOINTMENT_CONVERT_HOLD",
                idempotencyKey: input.idempotencyKey,
                payload: input,
            },
            async () => {
                const hold = await this.prisma.bookingHold.findFirst({
                    where: { id: input.bookingHoldId, organizationId: input.organizationId },
                    include: { location: true, organization: true },
                });

                if (!hold) {
                    throw new NotFoundException(`Booking hold ${input.bookingHoldId} not found.`);
                }

                if (hold.status === 'CONVERTED') {
                    const existing = await this.prisma.appointment.findFirst({
                        where: { bookingHoldId: hold.id, organizationId: input.organizationId },
                    });
                    if (existing) return existing;
                }

                if (hold.status !== 'ACTIVE' || hold.expiresAt <= new Date()) {
                    throw new BadRequestException(`Booking hold ${hold.id} is no longer active (Status: ${hold.status}).`);
                }

                // Resolve Customer ID
                let customerId = input.customerId || hold.customerId;
                const email = input.guestEmail || hold.guestEmail;
                const name = input.guestName || hold.guestName;
                const phone = input.guestPhone || hold.guestPhone;

                if (!customerId) {
                    if (!email) {
                        throw new BadRequestException('Guest email or Customer ID is required to finalize booking.');
                    }
                    const existingCustomer = await this.prisma.customer.findFirst({
                        where: { organizationId: input.organizationId, email: email.toLowerCase() },
                    });
                    if (existingCustomer) {
                        customerId = existingCustomer.id;
                    } else {
                        const newCustomer = await this.prisma.customer.create({
                            data: {
                                organizationId: input.organizationId,
                                fullName: name || 'Guest Customer',
                                email: email.toLowerCase(),
                                phone: phone || null,
                            },
                        });
                        customerId = newCustomer.id;
                    }
                }

                const bookingDate = organizationBookingDate(hold.startAt, hold.location?.timezone || hold.organization?.timezone || 'UTC');
                const existingDailyBooking = await this.prisma.appointment.findFirst({
                    where: { organizationId: input.organizationId, customerId, bookingDate, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
                    select: { id: true },
                });
                if (existingDailyBooking) throw new ConflictException({ code: 'CUSTOMER_DAILY_LIMIT', message: 'A customer can book only one appointment per day.' });

                const quote = hold.quoteSnapshot as any;
                const payableNowCents = Number(quote?.payableNowCents ?? quote?.depositAmountCents ?? 0);
                const totalCents = Number(quote?.totalCents ?? quote?.priceCents ?? 0);

                // Look up any successful payment record for this hold
                const successfulPayment = await this.prisma.paymentRecord.findFirst({
                    where: {
                        bookingHoldId: hold.id,
                        organizationId: input.organizationId,
                        status: PaymentRecordStatus.SUCCEEDED,
                    },
                });

                if (input.isPublicFinalize && payableNowCents > 0 && !successfulPayment) {
                    throw new BadRequestException({
                        code: 'DEPOSIT_PAYMENT_REQUIRED',
                        message: `Payment required to confirm this booking (Amount due: ${(payableNowCents / 100).toFixed(2)}). Please complete payment through Stripe.`,
                    });
                }

                let derivedPaymentStatus = 'UNPAID';
                if (successfulPayment) {
                    derivedPaymentStatus = successfulPayment.amountCents >= totalCents ? 'PAID' : 'PARTIALLY_PAID';
                } else if (payableNowCents === 0) {
                    derivedPaymentStatus = 'NOT_REQUIRED';
                } else if (input.paymentStatus) {
                    derivedPaymentStatus = input.paymentStatus;
                }

                try {
                    const appt = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                        // Atomic conditional update on hold
                        const updatedHold = await tx.bookingHold.updateMany({
                            where: {
                                id: hold.id,
                                organizationId: input.organizationId,
                                status: 'ACTIVE',
                                expiresAt: { gt: new Date() },
                            },
                            data: { status: 'CONVERTED' },
                        });

                        if (updatedHold.count === 0) {
                            const existing = await tx.appointment.findFirst({
                                where: { bookingHoldId: hold.id, organizationId: input.organizationId },
                            });
                            if (existing) return existing;
                            throw new BadRequestException(`Booking hold ${hold.id} has expired or is no longer active.`);
                        }

                        // Create Appointment (guaranteed unique by bookingHoldId constraint)
                        const newAppt = await tx.appointment.create({
                            data: {
                                organizationId: hold.organizationId,
                                locationId: hold.locationId,
                                serviceId: hold.serviceId,
                                staffId: hold.staffId,
                                customerId: customerId!,
                                bookingHoldId: hold.id,
                                startAt: hold.startAt,
                                endAt: hold.endAt,
                                bookingDate,
                                partySize: hold.partySize,
                                status: 'CONFIRMED',
                                paymentStatus: derivedPaymentStatus,
                                bookingSource: 'CUSTOMER_WEB',
                                priceCents: quote?.priceCents ?? 0,
                                currency: quote?.currency ?? 'USD',
                                version: 1,
                            },
                        });

                        // Persist Intake Form Responses if provided
                        if (input.intakeResponses && Array.isArray(input.intakeResponses)) {
                            for (const resp of input.intakeResponses) {
                                if (resp.intakeFormId && resp.responses) {
                                    await tx.intakeResponse.create({
                                        data: {
                                            appointmentId: newAppt.id,
                                            intakeFormId: resp.intakeFormId,
                                            responses: resp.responses,
                                        },
                                    });
                                }
                            }
                        }

                        await tx.appointmentHistory.create({
                            data: {
                                appointmentId: newAppt.id,
                                actorType: 'CUSTOMER',
                                actorId: customerId!,
                                action: 'CREATED',
                                fromStatus: null,
                                toStatus: 'CONFIRMED',
                                changes: { bookingHoldId: hold.id },
                            },
                        });

                        await this.outboxService.emitInTx(tx, {
                            aggregateType: 'Appointment',
                            aggregateId: newAppt.id,
                            eventType: 'appointment.created',
                            payload: {
                                appointmentId: newAppt.id,
                                organizationId: newAppt.organizationId,
                                bookingHoldId: hold.id,
                            },
                        });

                        return newAppt;
                    });

                    return appt;
                } catch (txErr: any) {
                    if (txErr.code === "P2002" || txErr.message?.includes("appointments_booking_hold_id_key")) {
                        // Unique constraint caught on concurrent hold conversion: return existing
                        const existing = await this.prisma.appointment.findFirst({
                            where: { bookingHoldId: hold.id, organizationId: input.organizationId },
                        });
                        if (existing) return existing;
                    }
                    throw txErr;
                }
            },
        );

        return res.data;
    }

    /**
     * Retrieves canonical booking status for public checkout refetch
     */
    async getPublicBookingStatus(
        holdId: string,
        organizationId: string,
        guestToken?: string,
    ): Promise<PublicBookingStatusResponseDto> {
        const hold = await this.prisma.bookingHold.findFirst({
            where: { id: holdId, organizationId },
            include: {
                service: true,
                staff: true,
            },
        });

        if (!hold) {
            throw new NotFoundException(`Booking hold ${holdId} not found.`);
        }

        // Case 1: Hold is already converted -> find and return confirmed appointment
        if (hold.status === 'CONVERTED') {
            const appointment = await this.prisma.appointment.findFirst({
                where: { bookingHoldId: hold.id, organizationId },
                include: {
                    service: true,
                    staff: true,
                    location: true,
                },
            });

            if (appointment) {
                const notification = await this.prisma.notification.findFirst({
                    where: { appointmentId: appointment.id, templateName: 'booking_confirmation' },
                    select: { status: true },
                    orderBy: { createdAt: 'desc' },
                });

                const extCalendar = await this.prisma.externalCalendarEvent.findFirst({
                    where: { appointmentId: appointment.id },
                    select: { status: true },
                });

                const emailDeliveryStatus = notification
                    ? (notification.status === 'SENT' ? 'SENT' : notification.status === 'FAILED' ? 'FAILED' : 'QUEUED')
                    : 'QUEUED';

                const calendarSyncStatus = extCalendar
                    ? (extCalendar.status === 'CONFIRMED' ? 'SYNCED' : 'PENDING')
                    : 'PENDING';

                return {
                    status: 'CONFIRMED',
                    paymentStatus: appointment.paymentStatus,
                    payableNowCents: 0,
                    appointment: {
                        id: appointment.id,
                        referenceCode: `BP-${appointment.id.slice(0, 8).toUpperCase()}`,
                        startAt: appointment.startAt.toISOString(),
                        endAt: appointment.endAt.toISOString(),
                        status: appointment.status,
                        paymentStatus: appointment.paymentStatus,
                        priceCents: appointment.priceCents,
                        currency: appointment.currency,
                        serviceName: appointment.service?.name,
                        staffName: appointment.staff?.displayName,
                        locationName: appointment.location?.name,
                        locationAddress: appointment.location?.address || undefined,
                        emailDeliveryStatus,
                        calendarSyncStatus,
                        icsDownloadUrl: `/api/v1/appointments/public/${appointment.id}/calendar.ics${guestToken ? `?guestToken=${guestToken}` : ''}`,
                    },
                };
            }
        }

        // Check if hold is expired
        const now = new Date();
        if (hold.status === 'EXPIRED' || (hold.status === 'ACTIVE' && hold.expiresAt <= now)) {
            return {
                status: 'EXPIRED',
                expiresAt: hold.expiresAt.toISOString(),
                message: 'Your reservation hold has expired. Please select a time slot again.',
            };
        }

        if (hold.status === 'CANCELLED') {
            return {
                status: 'CANCELLED',
                message: 'This booking hold was cancelled.',
            };
        }

        // Case 2: Hold is ACTIVE -> Check payment records
        const paymentRecord = await this.prisma.paymentRecord.findFirst({
            where: { bookingHoldId: hold.id, organizationId },
            orderBy: { createdAt: 'desc' },
        });

        const quote = hold.quoteSnapshot as any;
        const payableNowCents = Number(quote?.payableNowCents ?? quote?.depositAmountCents ?? 0);

        if (paymentRecord) {
            if (paymentRecord.status === PaymentRecordStatus.PENDING && this.paymentsService) {
                const reconciled = await this.paymentsService.reconcilePaymentForHold(hold.id, organizationId);
                if (reconciled) {
                    return this.getPublicBookingStatus(holdId, organizationId, guestToken);
                }
            }

            if (paymentRecord.status === PaymentRecordStatus.SUCCEEDED) {
                return {
                    status: 'CONFIRMED',
                    paymentStatus: 'PAID',
                    payableNowCents: 0,
                };
            }
            if (paymentRecord.status === PaymentRecordStatus.FAILED) {
                return {
                    status: 'PAYMENT_FAILED',
                    paymentStatus: 'FAILED',
                    payableNowCents,
                    expiresAt: hold.expiresAt.toISOString(),
                    message: paymentRecord.failureReason || 'Payment failed. Please retry.',
                };
            }
            return {
                status: 'PENDING_PAYMENT',
                paymentStatus: 'UNPAID',
                payableNowCents: paymentRecord.amountCents,
                expiresAt: hold.expiresAt.toISOString(),
            };
        }

        return {
            status: 'HOLD_ACTIVE',
            paymentStatus: payableNowCents > 0 ? 'UNPAID' : 'NOT_REQUIRED',
            payableNowCents,
            expiresAt: hold.expiresAt.toISOString(),
        };
    }

    /**
     * Generates standard iCalendar (.ics) RFC 5545 formatted payload for customer calendar download
     */
    async generateIcsCalendar(
        appointmentId: string,
        organizationId: string,
        guestToken?: string,
        customerId?: string,
    ): Promise<string> {
        const appointment = await this.prisma.appointment.findFirst({
            where: { id: appointmentId, organizationId },
            include: {
                service: true,
                staff: true,
                location: true,
                organization: true,
                customer: true,
                bookingHold: true,
            },
        });

        if (!appointment) {
            throw new NotFoundException(`Appointment ${appointmentId} not found.`);
        }

        const formatIcsDate = (date: Date) => {
            return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
        };

        const now = new Date();
        const start = new Date(appointment.startAt);
        const end = new Date(appointment.endAt);
        const summary = `${appointment.service?.name || "Appointment"} - ${appointment.organization?.name || "BookPro"}`;
        const location = appointment.location
            ? `${appointment.location.name}${appointment.location.address ? `, ${appointment.location.address}` : ""}`
            : "";
        const description = `Confirmed appointment with ${appointment.staff?.displayName || "Our Team"} at ${appointment.organization?.name || "BookPro"}. Reference: BP-${appointment.id.slice(0, 8).toUpperCase()}`;

        return [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//BookPro//Appointment Booking//EN",
            "CALSCALE:GREGORIAN",
            `METHOD:${appointment.status === "CANCELLED" ? "CANCEL" : "PUBLISH"}`,
            "BEGIN:VEVENT",
            `UID:bp-${appointment.id}@bookpro.com`,
            `DTSTAMP:${formatIcsDate(now)}`,
            `DTSTART:${formatIcsDate(start)}`,
            `DTEND:${formatIcsDate(end)}`,
            `SUMMARY:${appointment.status === "CANCELLED" ? "CANCELLED: " : ""}${summary}`,
            `DESCRIPTION:${description}`,
            location ? `LOCATION:${location}` : "",
            `STATUS:${appointment.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED"}`,
            `SEQUENCE:${appointment.version}`,
            "END:VEVENT",
            "END:VCALENDAR",
        ].filter(Boolean).join("\r\n");
    }

    /**
     * Enforces State Machine status transition with strict temporal and authority guardrails (Architecture §50 & PRD §21)
     */
    async transitionStatus(
        appointmentId: string,
        organizationId: string,
        targetStatus: AppointmentStatus,
        actorType: string = 'STAFF',
        actorId: string = 'SYSTEM',
        notes?: string,
    ): Promise<Appointment> {
        const appt = await this.prisma.appointment.findFirst({
            where: { id: appointmentId, organizationId },
        });

        if (!appt) {
            throw new NotFoundException(`Appointment ${appointmentId} not found.`);
        }

        if (appt.status === targetStatus) return appt;

        // Terminal state immutability rule: Once terminal, appointments cannot be transitioned
        if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appt.status)) {
            throw new BadRequestException(
                `Cannot transition appointment from terminal state '${appt.status}' to '${targetStatus}'.`,
            );
        }

        const allowed = this.ALLOWED_TRANSITIONS[appt.status] || [];
        if (!allowed.includes(targetStatus)) {
            throw new BadRequestException(
                `Invalid status transition from '${appt.status}' to '${targetStatus}'.`,
            );
        }

        const now = new Date();

        // 1. Guardrails for COMPLETED transition
        if (targetStatus === 'COMPLETED') {
            if (appt.status !== 'IN_PROGRESS') {
                throw new BadRequestException(
                    `Cannot transition appointment directly to 'COMPLETED'. Must be in 'IN_PROGRESS' state first.`,
                );
            }
            if (now < appt.endAt && !notes) {
                throw new BadRequestException(
                    `Cannot complete appointment before scheduled end time (${appt.endAt.toISOString()}).`,
                );
            }
        }

        // 2. Guardrails for NO_SHOW transition
        if (targetStatus === 'NO_SHOW') {
            if (now < appt.startAt) {
                throw new BadRequestException(
                    `Cannot mark appointment as no-show before scheduled start time (${appt.startAt.toISOString()}).`,
                );
            }
            const graceCutoff = new Date(appt.startAt.getTime() + 5 * 60 * 1000);
            if (now < graceCutoff && !notes) {
                throw new BadRequestException(
                    `Cannot mark no-show during 5-minute arrival grace window. Permitted after ${graceCutoff.toISOString()}.`,
                );
            }
            if (appt.status === 'CHECKED_IN' || appt.status === 'IN_PROGRESS') {
                throw new BadRequestException(
                    `Cannot mark as no-show: client has already checked in or service has started.`,
                );
            }
        }

        // 3. Guardrails for CHECKED_IN transition
        if (targetStatus === 'CHECKED_IN') {
            const windowStart = new Date(appt.startAt.getTime() - 60 * 60 * 1000);
            const windowEnd = new Date(appt.startAt.getTime() + 5 * 60 * 1000);
            if (now < windowStart && !notes) {
                throw new BadRequestException(
                    `Check-in is too early. Opens 60 minutes before scheduled start time.`,
                );
            }
            if (now > windowEnd && !notes) {
                throw new BadRequestException(`Check-in window has closed for this appointment (5-minute grace elapsed).`);
            }
        }

        // 4. Guardrails for IN_PROGRESS transition
        if (targetStatus === 'IN_PROGRESS') {
            if (appt.status !== 'CHECKED_IN' && appt.status !== 'CONFIRMED') {
                throw new BadRequestException(
                    `Cannot start appointment from '${appt.status}'. Must be 'CHECKED_IN' or 'CONFIRMED'.`,
                );
            }
        }

        const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const res = await tx.appointment.update({
                where: { id: appointmentId },
                data: {
                    status: targetStatus,
                    version: { increment: 1 },
                    ...(targetStatus === 'CHECKED_IN' ? { checkInAt: new Date() } : {}),
                },
            });

            await tx.appointmentHistory.create({
                data: {
                    appointmentId,
                    actorType,
                    actorId,
                    action: 'STATUS_CHANGE',
                    fromStatus: appt.status,
                    toStatus: targetStatus,
                    changes: notes ? { notes } : undefined,
                },
            });

            await this.outboxService.emitInTx(tx, {
                aggregateType: 'Appointment',
                aggregateId: appointmentId,
                eventType: `appointment.${targetStatus.toLowerCase()}`,
                payload: { appointmentId, fromStatus: appt.status, toStatus: targetStatus },
            });

            return res;
        });

        if (targetStatus === 'COMPLETED' && this.commissionsService) {
            try {
                await this.commissionsService.calculateCommissionForAppointment(appointmentId);
                this.logger.log(`Auto-calculated commission snapshot for completed appointment ${appointmentId}`);
            } catch (err: any) {
                this.logger.warn(`Failed to auto-calculate commission for appointment ${appointmentId}: ${err.message}`);
            }
        }

        return updated;
    }

    /**
     * Reschedules an appointment (Architecture §53 & PRD §24)
     * using the single authoritative availability validator pipeline.
     * Enforces customer notice cutoff policies and records audit history.
     */
    async reschedule(input: RescheduleAppointmentInput): Promise<Appointment> {
        const res = await this.idempotencyService.executeIdempotent<Appointment>(
            {
                organizationId: input.organizationId,
                operation: "APPOINTMENT_RESCHEDULE",
                idempotencyKey: input.idempotencyKey,
                payload: input,
            },
            async () => {
                const appt = await this.prisma.appointment.findFirst({
                    where: { id: input.appointmentId, organizationId: input.organizationId },
                });

                if (!appt) {
                    throw new NotFoundException(`Appointment ${input.appointmentId} not found.`);
                }

                if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appt.status)) {
                    throw new BadRequestException(`Cannot reschedule appointment in '${appt.status}' status.`);
                }

                // Customer policy notice cutoff window enforcement
                if (input.actorType === 'CUSTOMER') {
                    const now = new Date();
                    const policy = this.policyService
                        ? await this.policyService.resolvePolicy(input.organizationId, appt.locationId, appt.serviceId)
                        : { rescheduleCutoffHours: 24 };
                    const cutoffHours = policy.rescheduleCutoffHours ?? 24;
                    const hoursUntilStart = (appt.startAt.getTime() - now.getTime()) / (1000 * 60 * 60);

                    if (hoursUntilStart < cutoffHours) {
                        throw new BadRequestException(
                            `Rescheduling is not permitted within ${cutoffHours} hours of your scheduled appointment. Please contact the business directly.`,
                        );
                    }
                }

                const staffId = input.newStaffId !== undefined ? input.newStaffId : appt.staffId;

                const reservation = await this.authoritativeValidator.validateAndReserveSlot({
                    organizationId: input.organizationId,
                    locationId: appt.locationId,
                    serviceId: appt.serviceId,
                    staffId,
                    customerId: appt.customerId,
                    startAt: input.newStartAt,
                    partySize: appt.partySize,
                    targetType: 'APPOINTMENT',
                    rescheduleAppointmentId: input.appointmentId,
                    override: input.overrideReason ? {
                        reason: input.overrideReason,
                        actorId: input.actorId || 'SYSTEM',
                        actorType: input.actorType || 'STAFF',
                    } : undefined,
                });

                // If appointment was previously checked in, reset to CONFIRMED for the new future date
                if (appt.status === 'CHECKED_IN') {
                    await this.prisma.appointment.update({
                        where: { id: appt.id },
                        data: { status: 'CONFIRMED', checkInAt: null },
                    });
                }

                // Record audit log for rescheduling
                await this.prisma.appointmentHistory.create({
                    data: {
                        appointmentId: appt.id,
                        actorType: input.actorType || 'STAFF',
                        actorId: input.actorId || 'SYSTEM',
                        action: 'RESCHEDULE',
                        fromStatus: appt.status,
                        toStatus: appt.status === 'CHECKED_IN' ? 'CONFIRMED' : appt.status,
                        changes: {
                            oldStartAt: appt.startAt.toISOString(),
                            newStartAt: input.newStartAt,
                            oldStaffId: appt.staffId,
                            newStaffId: staffId,
                            overrideReason: input.overrideReason || null,
                        },
                    },
                });

                return reservation.appointment!;
            },
        );

        // Autonomous Optimizer Trigger: Backfill the old vacated slot from Priority Waitlist
        if (this.scheduleInsightService && res.data) {
            this.prisma.appointmentHistory.findFirst({
                where: { appointmentId: input.appointmentId, action: 'RESCHEDULE' },
                orderBy: { createdAt: 'desc' },
            }).then(async (hist) => {
                const changes = hist?.changes as any;
                if (changes?.oldStartAt) {
                    const oldStart = new Date(changes.oldStartAt);
                    const oldEnd = new Date(oldStart.getTime() + 60 * 60 * 1000);
                    await this.scheduleInsightService!.processSlotOpening(
                        input.organizationId,
                        res.data.locationId,
                        changes.oldStaffId,
                        oldStart,
                        oldEnd,
                        res.data.serviceId,
                    );
                }
            }).catch((err) => {
                this.logger.warn(`Failed to process slot opening on reschedule: ${err.message}`);
            });
        }

        return res.data;
    }

    /**
     * Batch-settles ended sessions for the organization (endAt <= now) into COMPLETED.
     */
    async autoSettleEndedAppointments(organizationId: string): Promise<{ settledCount: number; appointmentIds: string[] }> {
        const now = new Date();
        const candidateAppts = await this.prisma.appointment.findMany({
            where: {
                organizationId,
                status: 'IN_PROGRESS',
                endAt: { lte: now },
            },
            select: { id: true },
        });

        const settledIds: string[] = [];
        for (const candidate of candidateAppts) {
            try {
                await this.transitionStatus(
                    candidate.id,
                    organizationId,
                    'COMPLETED',
                    'SYSTEM',
                    'SYSTEM_AUTO_SETTLE',
                    'Batch auto-settle of ended sessions',
                );
                settledIds.push(candidate.id);
            } catch (err: any) {
                this.logger.warn(`Auto-settle failed for appointment ${candidate.id}: ${err.message}`);
            }
        }

        return { settledCount: settledIds.length, appointmentIds: settledIds };
    }

    /**
     * Sweeps and executes automatic operational lifecycle transitions:
     * 1. Auto-Start: Advances CHECKED_IN appointments where startAt <= now to IN_PROGRESS.
     * 2. Auto-Complete: Advances IN_PROGRESS appointments where endAt <= now to COMPLETED.
     * 3. Auto-No-Show: Advances CONFIRMED appointments where startAt <= now - 5m to NO_SHOW.
     */
    async autoProgressLifecycleStates(): Promise<{ autoStarted: number; autoCompleted: number; autoNoShow: number }> {
        const now = new Date();
        let autoStarted = 0;
        let autoCompleted = 0;
        let autoNoShow = 0;

        // 1. Auto-Start: CHECKED_IN -> IN_PROGRESS when startAt <= now
        const startCandidates = await this.prisma.appointment.findMany({
            where: {
                status: 'CHECKED_IN',
                startAt: { lte: now },
            },
            select: { id: true, organizationId: true },
            take: 50,
        });
        for (const c of startCandidates) {
            try {
                await this.transitionStatus(c.id, c.organizationId, 'IN_PROGRESS', 'SYSTEM', 'AUTO_START_JANITOR', 'Auto-started scheduled session');
                autoStarted++;
            } catch (e: any) {
                this.logger.debug(`Auto-start skip ${c.id}: ${e.message}`);
            }
        }

        // 2. Auto-Complete: IN_PROGRESS -> COMPLETED when endAt <= now
        const completeCandidates = await this.prisma.appointment.findMany({
            where: {
                status: 'IN_PROGRESS',
                endAt: { lte: now },
            },
            select: { id: true, organizationId: true },
            take: 50,
        });
        for (const c of completeCandidates) {
            try {
                await this.transitionStatus(c.id, c.organizationId, 'COMPLETED', 'SYSTEM', 'AUTO_COMPLETE_JANITOR', 'Auto-completed ended session');
                autoCompleted++;
            } catch (e: any) {
                this.logger.debug(`Auto-complete skip ${c.id}: ${e.message}`);
            }
        }

        // 3. Auto-No-Show: CONFIRMED -> NO_SHOW when startAt <= now - 5m (never checked in)
        const noShowThreshold = new Date(now.getTime() - 5 * 60 * 1000);
        const noShowCandidates = await this.prisma.appointment.findMany({
            where: {
                status: 'CONFIRMED',
                startAt: { lte: noShowThreshold },
            },
            select: { id: true, organizationId: true },
            take: 50,
        });
        for (const c of noShowCandidates) {
            try {
                const noShowAppt = await this.transitionStatus(c.id, c.organizationId, 'NO_SHOW', 'SYSTEM', 'AUTO_NO_SHOW_JANITOR', 'Auto-marked overdue arrival as no-show');
                autoNoShow++;
                if (this.scheduleInsightService) {
                    this.scheduleInsightService.processSlotOpening(
                        c.organizationId,
                        noShowAppt.locationId,
                        noShowAppt.staffId,
                        noShowAppt.startAt,
                        noShowAppt.endAt,
                        noShowAppt.serviceId,
                    ).catch(() => null);
                }
            } catch (e: any) {
                this.logger.debug(`Auto-no-show skip ${c.id}: ${e.message}`);
            }
        }

        return { autoStarted, autoCompleted, autoNoShow };
    }

    /**
     * Cancels an appointment under Policy constraints & executes multi-payment refunds atomically.
     * Enforces:
     * 1. Validates submitted quoteVersion against DB / HMAC signature, asserting non-expired and matching state.
     * 2. Multi-payment refund allocation: decrements remainingRefund across captured payments without duplicate application.
     * 3. Execution order: executes payment provider refund calls BEFORE finalizing appointment cancellation.
     * 4. Aborts cancellation if provider refund fails.
     * 5. Finalizes appointment status to CANCELLED, records ledger entries, updates payment records, and applies quote in DB transaction.
     * 6. Catches local finalization errors after provider success and records a ReconciliationIncident (AMBIGUOUS_REFUND) flagging REQUIRES_RECONCILIATION.
     */
    async cancel(
        appointmentId: string,
        organizationId: string,
        reason?: string,
        actorType: string = 'STAFF',
        actorId: string = 'SYSTEM',
        quoteVersion?: string,
    ): Promise<Appointment> {
        const appt = await this.prisma.appointment.findFirst({
            where: { id: appointmentId, organizationId },
            include: {
                paymentRecords: {
                    include: { refunds: true },
                },
                commissionRecords: true,
            },
        });

        if (!appt) {
            throw new NotFoundException(`Appointment ${appointmentId} not found.`);
        }

        if (appt.status === 'CANCELLED') return appt;
        if (['COMPLETED'].includes(appt.status)) {
            throw new BadRequestException(`Cannot cancel appointment with status '${appt.status}'.`);
        }

        // 3-hour cutoff for owner/staff cancellation
        const now = new Date();
        const hoursUntilStart = (appt.startAt.getTime() - now.getTime()) / (1000 * 60 * 60);

        if (actorType === 'STAFF' && hoursUntilStart < 3) {
            throw new BadRequestException({
                code: 'STAFF_CANCELLATION_WINDOW_EXPIRED',
                message: 'Owner cancellation is only permitted at least 3 hours prior to scheduled appointment time. With less than 3 hours remaining, staff cancellation is prohibited.',
            });
        }

        // 1. Validate Cancellation Quote
        let quoteValidation: { isValid: boolean; quote: any; quoteRecord?: any };
        if (this.policyService) {
            quoteValidation = await this.policyService.validateCancellationQuote(organizationId, appointmentId, quoteVersion);
        } else {
            quoteValidation = {
                isValid: true,
                quote: {
                    appointmentId,
                    isAllowed: true,
                    feeCents: 0,
                    refundableCents: 0,
                    reason: 'Direct cancellation',
                    policyProvenance: 'DEFAULT_SYSTEM_FALLBACK',
                    quoteVersion: quoteVersion || 'default',
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
                },
            };
        }

        const { quote, quoteRecord } = quoteValidation;

        // 100% full refund guarantee when cancelled by owner/staff
        if (actorType === 'STAFF') {
            const totalPaidCents = (appt.paymentRecords || [])
                .filter((p: any) => p.status === 'SUCCEEDED' || p.status === 'PARTIALLY_REFUNDED')
                .reduce((sum: number, p: any) => {
                    const activeRefunded = (p.refunds || [])
                        .filter((r: any) => r.status === 'SUCCEEDED' || r.status === 'PENDING')
                        .reduce((rsum: number, r: any) => rsum + r.amountCents, 0);
                    return sum + Math.max(0, p.amountCents - activeRefunded);
                }, 0);

            quote.feeCents = 0;
            quote.refundableAmountCents = totalPaidCents;
            quote.refundableCents = totalPaidCents;
            quote.reason = reason || 'Cancelled by studio owner (100% full refund guarantee)';
        }

        const targetRefundCents = quote.refundableAmountCents ?? quote.refundableCents ?? 0;

        // 2. Multi-Payment Allocation (Decrementing Remaining Amount)
        const refundAllocations: Array<{
            payment: any;
            amountCents: number;
            idempotencyKey: string;
        }> = [];

        if (targetRefundCents > 0 && this.refundsService && appt.paymentRecords && appt.paymentRecords.length > 0) {
            const eligiblePayments = appt.paymentRecords
                .filter((p: any) => p.status === 'SUCCEEDED' || p.status === 'PARTIALLY_REFUNDED')
                .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

            const quoteCurrency = quote.currency || appt.currency || 'USD';
            const hasForeignCurrencyPayment = eligiblePayments.some((p: any) => p.currency !== quoteCurrency);

            if (hasForeignCurrencyPayment) {
                // Multi-currency allocation: compute total captured balance in quote currency
                let totalCapturedInQuoteCurrency = 0;
                for (const p of eligiblePayments) {
                    let paidInQuoteCurrency = p.amountCents;
                    if (p.currency !== quoteCurrency) {
                        if (p.metadata && (p.metadata as any).originalAmountCents) {
                            paidInQuoteCurrency = Number((p.metadata as any).originalAmountCents);
                        } else if ((appt.metadata as any)?.depositPaidCents) {
                            paidInQuoteCurrency = Number((appt.metadata as any).depositPaidCents);
                        } else if ((p.metadata as any)?.exchangeRate && Number((p.metadata as any).exchangeRate) > 0) {
                            paidInQuoteCurrency = Math.round(p.amountCents / Number((p.metadata as any).exchangeRate));
                        }
                    }
                    const activeRefundedCents = (p.refunds || [])
                        .filter((r: any) => r.status === 'SUCCEEDED' || r.status === 'PENDING')
                        .reduce((sum: number, r: any) => sum + r.amountCents, 0);
                    const refundRatio = p.amountCents > 0 ? activeRefundedCents / p.amountCents : 0;
                    totalCapturedInQuoteCurrency += Math.max(0, Math.round(paidInQuoteCurrency * (1 - refundRatio)));
                }

                const refundRatio = totalCapturedInQuoteCurrency > 0
                    ? Math.min(1.0, targetRefundCents / totalCapturedInQuoteCurrency)
                    : 0;

                for (const p of eligiblePayments) {
                    const activeRefundedCents = (p.refunds || [])
                        .filter((r: any) => r.status === 'SUCCEEDED' || r.status === 'PENDING')
                        .reduce((sum: number, r: any) => sum + r.amountCents, 0);
                    const availableOnPayment = Math.max(0, p.amountCents - activeRefundedCents);
                    if (availableOnPayment <= 0) continue;

                    let refundOnPaymentCents = 0;
                    if (p.currency === quoteCurrency) {
                        refundOnPaymentCents = Math.min(availableOnPayment, targetRefundCents);
                    } else {
                        refundOnPaymentCents = Math.min(availableOnPayment, Math.round(p.amountCents * refundRatio));
                    }

                    if (refundOnPaymentCents > 0) {
                        refundAllocations.push({
                            payment: p,
                            amountCents: refundOnPaymentCents,
                            idempotencyKey: `ik_cancel_${quoteRecord?.id || quote.quoteVersion}_${p.id}_${refundOnPaymentCents}`,
                        });
                    }
                }
            } else {
                // Same-currency allocation (direct 1-to-1 decrement)
                let remainingRefund = targetRefundCents;

                for (const p of eligiblePayments) {
                    if (remainingRefund <= 0) break;

                    const activeRefundedCents = (p.refunds || [])
                        .filter((r: any) => r.status === 'SUCCEEDED' || r.status === 'PENDING')
                        .reduce((sum: number, r: any) => sum + r.amountCents, 0);

                    const availableOnPayment = Math.max(0, p.amountCents - activeRefundedCents);
                    if (availableOnPayment <= 0) continue;

                    const allocateAmount = Math.min(availableOnPayment, remainingRefund);
                    if (allocateAmount > 0) {
                        refundAllocations.push({
                            payment: p,
                            amountCents: allocateAmount,
                            idempotencyKey: `ik_cancel_${quoteRecord?.id || quote.quoteVersion}_${p.id}_${allocateAmount}`,
                        });
                        remainingRefund -= allocateAmount; // Strictly decrement remaining amount
                    }
                }

                if (remainingRefund > 0) {
                    throw new BadRequestException(
                        `Available captured balance is insufficient to disburse calculated refund of ${targetRefundCents} cents.`
                    );
                }
            }
        }

        // 3. Execute Provider Refunds (Executed BEFORE Local Cancellation Finalization)
        const executedRefunds: Array<{
            payment: any;
            refundRecordId: string;
            providerRefundId?: string;
            amountCents: number;
        }> = [];

        for (const allocation of refundAllocations) {
            if (!this.refundsService) {
                throw new BadRequestException('RefundsService is not available to process cancellation refund.');
            }
            try {
                const refundRes = await this.refundsService.processRefund(organizationId, {
                    organizationId,
                    paymentRecordId: allocation.payment.id,
                    amountCents: allocation.amountCents,
                    reason: reason || 'Automated policy cancellation refund',
                    actorType: actorType === 'STAFF' ? 'STAFF' : 'CUSTOMER',
                    actorId,
                    idempotencyKey: allocation.idempotencyKey,
                });
                executedRefunds.push({
                    payment: allocation.payment,
                    refundRecordId: refundRes.refundRecordId,
                    providerRefundId: refundRes.providerRefundId,
                    amountCents: allocation.amountCents,
                });
            } catch (err: any) {
                this.logger.error(`Refund failed for payment ${allocation.payment.id} during cancellation: ${err.message}`);
                // Abort cancellation so appointment remains active and failure is tracked!
                throw new BadRequestException(`Cancellation refund failed with payment provider: ${err.message}. Appointment was not cancelled.`);
            }
        }

        // 4. Local Finalization Transaction
        try {
            const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                let finalPaymentStatus = appt.paymentStatus;
                if (targetRefundCents > 0) {
                    const allPayments = await tx.paymentRecord.findMany({
                        where: { appointmentId, organizationId },
                        include: { refunds: true },
                    });
                    const totalAmount = allPayments.reduce((sum, p) => sum + p.amountCents, 0);
                    const totalRefunded = allPayments.reduce((sum, p) => {
                        return sum + (p.refunds || [])
                            .filter((r) => r.status === 'SUCCEEDED')
                            .reduce((s, r) => s + r.amountCents, 0);
                    }, 0);

                    if (totalAmount > 0 && totalRefunded >= totalAmount) {
                        finalPaymentStatus = 'REFUNDED';
                    } else if (totalRefunded > 0) {
                        finalPaymentStatus = 'PARTIALLY_REFUNDED';
                    }
                }

                const res = await tx.appointment.update({
                    where: { id: appointmentId },
                    data: {
                        status: 'CANCELLED',
                        cancelReason: reason || null,
                        cancelledAt: new Date(),
                        cancelledById: actorId !== 'SYSTEM' ? actorId : null,
                        paymentStatus: finalPaymentStatus,
                        version: { increment: 1 },
                    },
                });

                if (quoteRecord?.id && (tx as any).cancellationQuote) {
                    await (tx as any).cancellationQuote.update({
                        where: { id: quoteRecord.id },
                        data: {
                            status: 'APPLIED',
                            appliedAt: new Date(),
                        },
                    }).catch(() => null);
                }

                await tx.appointmentHistory.create({
                    data: {
                        appointmentId,
                        actorType,
                        actorId,
                        action: 'CANCELLED',
                        fromStatus: appt.status,
                        toStatus: 'CANCELLED',
                        changes: {
                            reason,
                            quoteVersion: quote.quoteVersion,
                            cancellationFeeCents: quote.feeCents,
                            refundedCents: targetRefundCents,
                        },
                    },
                });

                if (quote.feeCents > 0 && (tx as any).financialLedgerEntry) {
                    await (tx as any).financialLedgerEntry.create({
                        data: {
                            organizationId,
                            appointmentId,
                            entryType: 'CANCELLATION_FEE',
                            amountCents: quote.feeCents,
                            currency: appt.currency || 'USD',
                            description: `Retained cancellation fee for appointment ${appointmentId}`,
                        },
                    }).catch(() => null);
                }

                await this.outboxService.emitInTx(tx, {
                    aggregateType: 'Appointment',
                    aggregateId: appointmentId,
                    eventType: 'appointment.cancelled',
                    payload: {
                        appointmentId,
                        organizationId,
                        cancelReason: reason,
                        cancelledAt: res.cancelledAt,
                        quoteVersion: quote.quoteVersion,
                        feeCents: quote.feeCents,
                        refundedCents: targetRefundCents,
                    },
                });

                return res;
            });

            // 5. Invalidate Tenant-Scoped Availability Cache so slots are instantly freed
            if (this.redisService) {
                await this.redisService.delPrefix(RedisService.buildKey(organizationId, 'availability')).catch((err) => {
                    this.logger.warn(`Failed to invalidate availability cache for org ${organizationId}: ${err.message}`);
                });
            }

            // 6. Broadcast Real-Time SSE Event to Owner Portal (Calendar, CRM, Dashboard)
            if (this.realtimeService) {
                await this.realtimeService.broadcastEvent({
                    organizationId,
                    type: 'appointment.cancelled',
                    entityId: appointmentId,
                    timestamp: new Date().toISOString(),
                    metadata: {
                        appointmentId,
                        status: 'CANCELLED',
                        quoteVersion: quote.quoteVersion,
                        feeCents: quote.feeCents,
                        refundedCents: targetRefundCents,
                    },
                }).catch((err) => {
                    this.logger.warn(`Failed to broadcast appointment.cancelled SSE event: ${err.message}`);
                });
            }

            // 7. Autonomous Optimizer Slot Backfill Trigger (0-latency waitlist match)
            if (this.scheduleInsightService) {
                this.scheduleInsightService.processSlotOpening(
                    organizationId,
                    appt.locationId,
                    appt.staffId,
                    appt.startAt,
                    appt.endAt,
                    appt.serviceId,
                ).catch((err) => {
                    this.logger.warn(`Failed to process slot opening for cancelled appointment ${appointmentId}: ${err.message}`);
                });
            }

            return updated;
        } catch (txError: any) {
            this.logger.error(
                `Critical: Provider refund completed but local cancellation finalization failed for appointment ${appointmentId}: ${txError.message}`
            );

            // Record Reconciliation Incident for Provider-Success / Local-Failure
            if ((this.prisma as any).reconciliationIncident && executedRefunds.length > 0) {
                for (const ref of executedRefunds) {
                    await (this.prisma as any).reconciliationIncident.create({
                        data: {
                            organizationId,
                            incidentType: 'AMBIGUOUS_REFUND',
                            providerPaymentId: ref.payment.providerPaymentId,
                            appointmentId,
                            status: 'OPEN',
                            resolutionNotes: `Provider refund ${ref.providerRefundId} succeeded (${ref.amountCents} cents) but local cancellation transaction failed: ${txError.message}`,
                            payload: {
                                appointmentId,
                                paymentRecordId: ref.payment.id,
                                refundRecordId: ref.refundRecordId,
                                providerRefundId: ref.providerRefundId,
                                amountCents: ref.amountCents,
                                error: txError.message,
                            },
                        },
                    }).catch(() => null);

                    await this.prisma.paymentRecord.update({
                        where: { id: ref.payment.id },
                        data: { status: 'REQUIRES_RECONCILIATION' as any },
                    }).catch(() => null);
                }
            }

            throw txError;
        }
    }

    /**
     * Queries appointments for calendar & lists (PRD §23)
     */
    async getAppointments(filter: QueryAppointmentsFilter): Promise<Appointment[]> {
        const {
            organizationId,
            locationId,
            staffId,
            customerId,
            serviceId,
            status,
            startDate,
            endDate,
        } = filter;

        return this.prisma.appointment.findMany({
            where: {
                organizationId,
                ...(locationId ? { locationId } : filter.locationIds?.length ? { locationId: { in: filter.locationIds } } : {}),
                ...(staffId ? { staffId } : {}),
                ...(filter.membershipId ? { staff: { membershipId: filter.membershipId } } : {}),
                ...(customerId ? { customerId } : {}),
                ...(serviceId ? { serviceId } : {}),
                ...(status ? { status } : {}),
                ...(startDate || endDate
                    ? {
                        startAt: {
                            ...(startDate ? { gte: new Date(startDate) } : {}),
                            ...(endDate ? { lte: new Date(endDate) } : {}),
                        },
                    }
                    : {}),
            },
            include: {
                service: true,
                staff: true,
                customer: true,
                location: true,
                history: true,
                paymentRecords: {
                    include: { refunds: true },
                },
            },
            orderBy: { startAt: 'asc' },
        });
    }

    /**
     * Single appointment detail view
     */
    async getAppointmentDetail(id: string, organizationId: string): Promise<Appointment> {
        const appt = await this.prisma.appointment.findFirst({
            where: { id, organizationId },
            include: {
                service: true,
                staff: true,
                customer: true,
                location: true,
                history: true,
                resources: true,
                intakeResponses: true,
                paymentRecords: {
                    include: { refunds: true },
                },
            },
        });
        if (!appt) {
            throw new NotFoundException(`Appointment ${id} not found.`);
        }
        return appt;
    }

    /**
     * Proposes a reschedule to the customer without immediately modifying the booking startAt/endAt.
     */
    async proposeReschedule(input: {
        appointmentId: string;
        organizationId: string;
        newStartAt: string;
        newEndAt?: string;
        newStaffId?: string | null;
        reason?: string | null;
        proposedById: string;
    }): Promise<Appointment> {
        const appt = await this.prisma.appointment.findFirst({
            where: { id: input.appointmentId, organizationId: input.organizationId },
            include: { service: true, staff: true, customer: true },
        });
        if (!appt) throw new NotFoundException(`Appointment ${input.appointmentId} not found.`);
        if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appt.status)) {
            throw new BadRequestException(`Cannot reschedule appointment in '${appt.status}' status.`);
        }

        const proposedStart = new Date(input.newStartAt);
        const durationMin = appt.service?.durationMin || 60;
        const proposedEnd = input.newEndAt ? new Date(input.newEndAt) : new Date(proposedStart.getTime() + durationMin * 60 * 1000);
        const targetStaffId = input.newStaffId !== undefined ? input.newStaffId : appt.staffId;

        // Check for conflicting appointments for the selected specialist
        if (targetStaffId) {
            const conflict = await this.prisma.appointment.findFirst({
                where: {
                    organizationId: input.organizationId,
                    staffId: targetStaffId,
                    id: { not: input.appointmentId },
                    status: { notIn: ['CANCELLED', 'NO_SHOW'] },
                    startAt: { lt: proposedEnd },
                    endAt: { gt: proposedStart },
                },
            });
            if (conflict) {
                throw new ConflictException('The requested time slot conflicts with another appointment for this specialist.');
            }
        }

        let staffDisplayName = appt.staff?.displayName;
        if (input.newStaffId && input.newStaffId !== appt.staffId) {
            const newStaff = await this.prisma.staffProfile.findUnique({ where: { id: input.newStaffId } });
            if (newStaff) staffDisplayName = newStaff.displayName;
        }

        const currentMeta = (appt.metadata as Record<string, any>) || {};
        const rescheduleProposal = {
            proposedStartAt: proposedStart.toISOString(),
            proposedEndAt: proposedEnd.toISOString(),
            proposedStaffId: targetStaffId,
            proposedStaffName: staffDisplayName || 'Specialist',
            reason: input.reason || 'Specialist schedule adjustment',
            status: 'PENDING_CUSTOMER_CONFIRMATION',
            proposedAt: new Date().toISOString(),
            proposedBy: 'STAFF',
            proposedById: input.proposedById,
        };

        const updated = await this.prisma.appointment.update({
            where: { id: input.appointmentId },
            data: {
                metadata: {
                    ...currentMeta,
                    rescheduleProposal,
                },
                version: { increment: 1 },
            },
            include: { service: true, staff: true, customer: true, location: true },
        });

        await this.prisma.appointmentHistory.create({
            data: {
                appointmentId: input.appointmentId,
                actorType: 'STAFF',
                actorId: input.proposedById,
                action: 'RESCHEDULE_PROPOSED',
                fromStatus: appt.status,
                toStatus: appt.status,
                changes: rescheduleProposal,
            },
        });

        await this.outboxService.emit({
            aggregateType: 'Appointment',
            aggregateId: input.appointmentId,
            eventType: 'appointment.reschedule_proposed',
            payload: {
                appointmentId: input.appointmentId,
                organizationId: input.organizationId,
                proposal: rescheduleProposal,
                customerEmail: appt.customer?.email,
                customerName: appt.customer?.fullName,
                serviceName: appt.service?.name,
            },
        });

        if (this.realtimeService) {
            await this.realtimeService.broadcastEvent({
                organizationId: input.organizationId,
                type: 'appointment.updated',
                entityId: input.appointmentId,
                version: updated.version,
                timestamp: new Date().toISOString(),
                correlationId: `reschedule_prop_${Date.now()}`,
            }).catch(() => null);
        }

        return updated;
    }

    /**
     * Customer confirms a studio-proposed reschedule, atomically committing the updated slot.
     */
    async confirmRescheduleProposal(
        appointmentId: string,
        organizationId: string,
        actorId: string = 'CUSTOMER',
    ): Promise<Appointment> {
        const appt = await this.prisma.appointment.findFirst({
            where: { id: appointmentId, organizationId },
            include: { service: true, staff: true, customer: true, location: true },
        });
        if (!appt) throw new NotFoundException(`Appointment ${appointmentId} not found.`);
        const meta = (appt.metadata as Record<string, any>) || {};
        const proposal = meta.rescheduleProposal;
        if (!proposal || proposal.status !== 'PENDING_CUSTOMER_CONFIRMATION') {
            throw new BadRequestException('No pending reschedule proposal found for this appointment.');
        }

        const newStartAt = new Date(proposal.proposedStartAt);
        const newEndAt = new Date(proposal.proposedEndAt);
        const newStaffId = proposal.proposedStaffId || appt.staffId;

        // Atomically commit rescheduling via authoritative engine
        const updated = await this.reschedule({
            appointmentId,
            organizationId,
            newStartAt: newStartAt.toISOString(),
            newEndAt: newEndAt.toISOString(),
            newStaffId,
            actorType: 'CUSTOMER',
            actorId,
            overrideReason: `Customer accepted proposal: ${proposal.reason}`,
        });

        // Update proposal status in metadata
        await this.prisma.appointment.update({
            where: { id: appointmentId },
            data: {
                metadata: {
                    ...((updated.metadata as Record<string, any>) || {}),
                    rescheduleProposal: {
                        ...proposal,
                        status: 'ACCEPTED',
                        acceptedAt: new Date().toISOString(),
                    },
                },
            },
        });

        return updated;
    }

    /**
     * Customer declines a studio-proposed reschedule, preserving original booking slot.
     */
    async declineRescheduleProposal(
        appointmentId: string,
        organizationId: string,
        actorId: string = 'CUSTOMER',
    ): Promise<Appointment> {
        const appt = await this.prisma.appointment.findFirst({
            where: { id: appointmentId, organizationId },
        });
        if (!appt) throw new NotFoundException(`Appointment ${appointmentId} not found.`);
        const meta = (appt.metadata as Record<string, any>) || {};
        const proposal = meta.rescheduleProposal;
        if (!proposal || proposal.status !== 'PENDING_CUSTOMER_CONFIRMATION') {
            throw new BadRequestException('No pending reschedule proposal found for this appointment.');
        }

        const updated = await this.prisma.appointment.update({
            where: { id: appointmentId },
            data: {
                metadata: {
                    ...meta,
                    rescheduleProposal: {
                        ...proposal,
                        status: 'DECLINED',
                        declinedAt: new Date().toISOString(),
                    },
                },
                version: { increment: 1 },
            },
        });

        await this.prisma.appointmentHistory.create({
            data: {
                appointmentId,
                actorType: 'CUSTOMER',
                actorId,
                action: 'RESCHEDULE_DECLINED',
                fromStatus: appt.status,
                toStatus: appt.status,
                changes: { reason: 'Customer declined proposed reschedule time' },
            },
        });

        if (this.realtimeService) {
            await this.realtimeService.broadcastEvent({
                organizationId,
                type: 'appointment.updated',
                entityId: appointmentId,
                version: updated.version,
                timestamp: new Date().toISOString(),
                correlationId: `reschedule_decl_${Date.now()}`,
            }).catch(() => null);
        }

        return updated;
    }
}
