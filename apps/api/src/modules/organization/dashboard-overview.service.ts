import { Injectable, NotFoundException, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { OrganizationService } from "./organization.service";
import { ExchangeRateService } from "../payments/exchange-rate.service";
import {
    DashboardOverviewResponseDto,
    DashboardHealthIssueDto,
    DashboardUpcomingAppointmentDto,
} from "@bookpro/contracts";
import { AppointmentStatus, PaymentRecordStatus, WaitlistEntryStatus } from "@prisma/client";

/**
 * Calculates start and end of day in UTC for a specific IANA timezone.
 */
export function getTimezoneDayBounds(
    timezone: string,
    referenceDate: Date = new Date()
): { startOfDay: Date; endOfDay: Date; dateStr: string } {
    try {
        const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone || "UTC",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
        const dateStr = formatter.format(referenceDate);
        const [year, month, day] = dateStr.split("-").map(Number);

        const approxUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone || "UTC",
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            hour12: false,
        }).formatToParts(approxUtc);

        const getPart = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
        const tzHour = getPart("hour") % 24;
        const tzMinute = getPart("minute");
        const tzDay = getPart("day");

        let diffMinutes = tzHour * 60 + tzMinute;
        if (tzDay > day) {
            diffMinutes += 24 * 60;
        } else if (tzDay < day) {
            diffMinutes -= 24 * 60;
        }

        const startOfDay = new Date(approxUtc.getTime() - diffMinutes * 60 * 1000);
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

        return { startOfDay, endOfDay, dateStr };
    } catch {
        const now = new Date(referenceDate);
        now.setUTCHours(0, 0, 0, 0);
        const end = new Date(now.getTime() + 24 * 60 * 60 * 1000 - 1);
        return {
            startOfDay: now,
            endOfDay: end,
            dateStr: now.toISOString().slice(0, 10),
        };
    }
}

@Injectable()
export class DashboardOverviewService {
    private readonly logger = new Logger(DashboardOverviewService.name);
    private readonly exchangeRateInstance: ExchangeRateService;

    constructor(
        private readonly prisma: PrismaService,
        private readonly organizationService: OrganizationService,
        @Optional() exchangeRateService?: ExchangeRateService,
    ) {
        this.exchangeRateInstance = exchangeRateService || new ExchangeRateService();
    }

    /**
     * Authoritative conversion of cents from source currency to target currency at live rates.
     */
    private convertCents(
        amountCents: number,
        fromCurrency: string,
        targetCurrency: string,
        rates: Record<string, number>
    ): number {
        const from = (fromCurrency || "USD").toUpperCase();
        const target = (targetCurrency || "USD").toUpperCase();
        if (from === target || !amountCents) return amountCents;

        const fromRateAgainstUsd = from === "USD" ? 1.0 : (rates[from] || 1.0);
        const targetRateAgainstUsd = target === "USD" ? 1.0 : (rates[target] || 1.0);
        const crossRate = targetRateAgainstUsd / fromRateAgainstUsd;
        return Math.round(amountCents * crossRate);
    }

    /**
     * Converts a payment record into the target currency, prioritizing original metadata if present.
     */
    private convertPaymentToTarget(
        payment: { amountCents: number; currency?: string | null; metadata?: any },
        targetCurrency: string,
        orgDefaultCurrency: string,
        rates: Record<string, number>
    ): number {
        const meta = (payment.metadata as any) || {};
        if (meta.originalCurrency === targetCurrency && meta.originalAmountCents != null) {
            return Number(meta.originalAmountCents);
        }
        if (meta.exchangeRate && payment.currency && payment.currency !== targetCurrency) {
            return Math.round(payment.amountCents / meta.exchangeRate);
        }
        const sourceCurrency = (payment.currency || meta.originalCurrency || orgDefaultCurrency || "USD").toUpperCase();
        return this.convertCents(payment.amountCents, sourceCurrency, targetCurrency, rates);
    }

    /**
     * Aggregates authoritative Owner Dashboard Overview state in a single bounded query.
     */
    async getDashboardOverview(
        organizationId: string,
        locationIdFilter?: string,
        currencyOverride?: string
    ): Promise<DashboardOverviewResponseDto> {
        // 1. Fetch organization details
        const org = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                name: true,
                slug: true,
                brandName: true,
                logoUrl: true,
                primaryColor: true,
                timezone: true,
                currency: true,
                bookingEnabled: true,
                onboardingCompleted: true,
                paymentIntent: true,
                stripeAccountId: true,
            },
        });

        if (!org) {
            throw new NotFoundException("Organization not found");
        }

        const tz = org.timezone || "UTC";
        const currency = (currencyOverride || org.currency || "USD").toUpperCase();
        const now = new Date();
        const { startOfDay, endOfDay } = getTimezoneDayBounds(tz, now);
        const rates = await this.exchangeRateInstance.getRates();

        // 2. Query today's appointments and payments concurrently
        const [
            todayAppointments,
            todayPayments,
            upcomingAppointmentsRaw,
            onboardingStatus,
            googleConnections,
            pendingWaitlistCount,
            last7DaysMetrics,
            prev7DaysMetrics,
        ] = await Promise.all([
            // Today's appointments
            this.prisma.appointment.findMany({
                where: {
                    organizationId,
                    startAt: { gte: startOfDay, lte: endOfDay },
                    ...(locationIdFilter ? { locationId: locationIdFilter } : {}),
                },
                select: {
                    id: true,
                    status: true,
                    priceCents: true,
                    currency: true,
                },
            }),

            // Today's collected payments
            this.prisma.paymentRecord.findMany({
                where: {
                    organizationId,
                    status: PaymentRecordStatus.SUCCEEDED,
                    createdAt: { gte: startOfDay, lte: endOfDay },
                },
                select: {
                    amountCents: true,
                    currency: true,
                    metadata: true,
                },
            }),

            // Upcoming appointments (up to 8 starting from beginning of today or now)
            this.prisma.appointment.findMany({
                where: {
                    organizationId,
                    startAt: { gte: now < startOfDay ? startOfDay : new Date(now.getTime() - 30 * 60 * 1000) },
                    status: { not: AppointmentStatus.CANCELLED },
                    ...(locationIdFilter ? { locationId: locationIdFilter } : {}),
                },
                include: {
                    customer: { select: { id: true, fullName: true, email: true, phone: true } },
                    service: { select: { id: true, name: true, durationMin: true } },
                    staff: { select: { id: true, displayName: true } },
                    location: { select: { id: true, name: true } },
                    paymentRecords: {
                        where: { status: PaymentRecordStatus.SUCCEEDED },
                        select: { amountCents: true, currency: true, metadata: true },
                    },
                },
                orderBy: { startAt: "asc" },
                take: 8,
            }),

            // Onboarding & readiness checks
            this.organizationService.getOnboardingStatus(organizationId).catch(() => null),

            // Degraded calendar connections
            this.prisma.googleCalendarConnection.findMany({
                where: {
                    organizationId,
                    status: { in: ["DEGRADED", "DISCONNECTED", "ACTION_REQUIRED"] },
                },
                select: { id: true },
            }).catch(() => []),

            // Pending/Active waitlist entries
            this.prisma.waitlistEntry.count({
                where: {
                    organizationId,
                    status: WaitlistEntryStatus.ACTIVE,
                    ...(locationIdFilter ? { locationId: locationIdFilter } : {}),
                },
            }).catch(() => 0),

            // 7-day performance metrics (from orgDailyMetric)
            this.prisma.orgDailyMetric.findMany({
                where: {
                    organizationId,
                    date: {
                        gte: new Date(startOfDay.getTime() - 7 * 24 * 60 * 60 * 1000),
                        lte: endOfDay,
                    },
                },
            }).catch(() => []),

            // Previous 7-day metrics for comparison
            this.prisma.orgDailyMetric.findMany({
                where: {
                    organizationId,
                    date: {
                        gte: new Date(startOfDay.getTime() - 14 * 24 * 60 * 60 * 1000),
                        lt: new Date(startOfDay.getTime() - 7 * 24 * 60 * 60 * 1000),
                    },
                },
            }).catch(() => []),
        ]);

        // 3. Compute today's counts & revenue in native organization currency
        const totalAppointmentsCount = todayAppointments.length;
        const completedAppointmentsCount = todayAppointments.filter(
            (a) => a.status === AppointmentStatus.COMPLETED
        ).length;
        const upcomingAppointmentsCount = todayAppointments.filter(
            (a) =>
                a.status !== AppointmentStatus.COMPLETED &&
                a.status !== AppointmentStatus.CANCELLED &&
                a.status !== AppointmentStatus.NO_SHOW
        ).length;

        const orgCurrency = org.currency || "USD";

        const collectedRevenueCents = todayPayments.reduce((acc, curr) => {
            return acc + this.convertPaymentToTarget(curr, currency, orgCurrency, rates);
        }, 0);

        const expectedRevenueCents = todayAppointments
            .filter((a) => a.status !== AppointmentStatus.CANCELLED)
            .reduce((acc, curr) => {
                return acc + this.convertCents(curr.priceCents || 0, (curr as any).currency || orgCurrency, currency, rates);
            }, 0);

        // 4. Transform upcoming appointments list
        const upcomingAppointments: DashboardUpcomingAppointmentDto[] = upcomingAppointmentsRaw.map((appt) => {
            const originalPriceCents = appt.priceCents;
            const originalCurrency = (appt.currency || orgCurrency).toUpperCase();
            const convertedPriceCents = this.convertCents(originalPriceCents, originalCurrency, currency, rates);

            const totalPaidCents = (appt.paymentRecords || []).reduce((sum, p) => {
                return sum + this.convertPaymentToTarget(p, currency, orgCurrency, rates);
            }, 0);

            let paymentStatus: "PAID" | "DEPOSIT_PAID" | "UNPAID" = "UNPAID";
            if (totalPaidCents >= convertedPriceCents && convertedPriceCents > 0) {
                paymentStatus = "PAID";
            } else if (totalPaidCents > 0) {
                paymentStatus = "DEPOSIT_PAID";
            }

            return {
                id: appt.id,
                startAt: appt.startAt.toISOString(),
                endAt: appt.endAt.toISOString(),
                status: appt.status,
                priceCents: convertedPriceCents,
                currency,
                originalPriceCents,
                originalCurrency,
                customer: appt.customer
                    ? {
                        id: appt.customer.id,
                        fullName: appt.customer.fullName,
                        email: appt.customer.email,
                        phone: appt.customer.phone,
                    }
                    : null,
                service: appt.service
                    ? {
                        id: appt.service.id,
                        name: appt.service.name,
                        durationMin: appt.service.durationMin,
                    }
                    : null,
                staff: appt.staff
                    ? {
                        id: appt.staff.id,
                        displayName: appt.staff.displayName,
                    }
                    : null,
                location: appt.location
                    ? {
                        id: appt.location.id,
                        name: appt.location.name,
                    }
                    : null,
                paymentStatus,
            };
        });

        // 5. Compute authoritative business health issues
        const issues: DashboardHealthIssueDto[] = [];

        if (!org.bookingEnabled) {
            issues.push({
                code: "BOOKING_UNPUBLISHED",
                message: "Your public booking page is currently unpublished.",
                severity: "critical",
                actionLabel: "Finish setup & publish",
                actionHref: "/onboarding",
            });
        }

        if (onboardingStatus) {
            if (!onboardingStatus.firstService) {
                issues.push({
                    code: "NO_ACTIVE_SERVICES",
                    message: "No active bookable services configured.",
                    severity: "critical",
                    actionLabel: "Add service",
                    actionHref: "/app/services",
                });
            }
            if (!onboardingStatus.firstStaff) {
                issues.push({
                    code: "NO_ACTIVE_STAFF",
                    message: "No active staff members assigned to accept bookings.",
                    severity: "critical",
                    actionLabel: "Add staff",
                    actionHref: "/app/staff",
                });
            }
            if (!onboardingStatus.completedSteps.includes("AVAILABILITY")) {
                issues.push({
                    code: "NO_AVAILABILITY",
                    message: "Staff availability schedule is not set.",
                    severity: "critical",
                    actionLabel: "Set availability",
                    actionHref: "/app/staff",
                });
            }
            if (org.paymentIntent === "ONLINE" && !org.stripeAccountId) {
                issues.push({
                    code: "STRIPE_NOT_CONNECTED",
                    message: "Online payments are enabled but Stripe Connect is not connected.",
                    severity: "attention",
                    actionLabel: "Connect Stripe",
                    actionHref: "/app/commissions",
                });
            }
        }

        if (googleConnections.length > 0) {
            issues.push({
                code: "GOOGLE_CALENDAR_DEGRADED",
                message: `${googleConnections.length} Google Calendar connection(s) require attention.`,
                severity: "attention",
                actionLabel: "Review integrations",
                actionHref: "/app/integrations/google",
            });
        }

        const hasCriticalIssue = issues.some((i) => i.severity === "critical");
        const bookingReady = !hasCriticalIssue && org.bookingEnabled;

        // 6. Compute 7-day business performance
        let perfBookings = 0;
        let perfCollectedCents = 0;
        let perfCancelled = 0;
        let perfAvailMin = 0;
        let perfBookedMin = 0;

        if (last7DaysMetrics.length > 0) {
            for (const m of last7DaysMetrics) {
                perfBookings += m.bookingCount || 0;
                perfCollectedCents += this.convertCents(m.collectedRevenueCents || 0, org.currency || "USD", currency, rates);
                perfCancelled += m.cancelledCount || 0;
                perfAvailMin += m.totalAvailableMinutes || 0;
                perfBookedMin += m.totalBookedMinutes || 0;
            }
        } else {
            // Live fallback query for last 7 days
            const recentAppts = await this.prisma.appointment.findMany({
                where: {
                    organizationId,
                    startAt: {
                        gte: new Date(startOfDay.getTime() - 7 * 24 * 60 * 60 * 1000),
                        lte: endOfDay,
                    },
                },
                select: { status: true },
            });
            perfBookings = (recentAppts || []).length;
            perfCancelled = (recentAppts || []).filter((a) => a.status === AppointmentStatus.CANCELLED).length;

            const recentPayments = await this.prisma.paymentRecord.findMany({
                where: {
                    organizationId,
                    status: PaymentRecordStatus.SUCCEEDED,
                    createdAt: {
                        gte: new Date(startOfDay.getTime() - 7 * 24 * 60 * 60 * 1000),
                        lte: endOfDay,
                    },
                },
                select: { amountCents: true, currency: true, metadata: true },
            });
            perfCollectedCents = (recentPayments || []).reduce((s, p) => s + this.convertPaymentToTarget(p, currency, orgCurrency, rates), 0);
        }

        // Previous 7 days comparison for trends
        let prevBookings = 0;
        let prevCollectedCents = 0;
        if (prev7DaysMetrics.length > 0) {
            for (const m of prev7DaysMetrics) {
                prevBookings += m.bookingCount || 0;
                prevCollectedCents += this.convertCents(m.collectedRevenueCents || 0, org.currency || "USD", currency, rates);
            }
        }

        const bookingsVsPrev =
            prevBookings > 0
                ? Math.round(((perfBookings - prevBookings) / prevBookings) * 100)
                : null;

        const revenueVsPrev =
            prevCollectedCents > 0
                ? Math.round(((perfCollectedCents - prevCollectedCents) / prevCollectedCents) * 100)
                : null;

        const utilizationRate =
            perfAvailMin > 0 ? Math.round((perfBookedMin / perfAvailMin) * 100) : null;

        // 7. Waitlist opportunity
        const waitlistOpportunity =
            pendingWaitlistCount > 0
                ? {
                    pendingCount: pendingWaitlistCount,
                    earliestRequestedAt: null,
                }
                : null;

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const publicUrl = org.bookingEnabled ? `${baseUrl}/${org.slug}/book` : null;

        const availableCurrencies = ["USD", "PKR", "EUR", "GBP", "AED", "SAR", "INR", "CAD", "AUD"];
        const forex = {
            chosenCurrency: currency,
            baseCurrency: "USD",
            exchangeRate: rates[currency] || 1.0,
            availableCurrencies,
            updatedAt: Date.now(),
        };

        return {
            organization: {
                id: org.id,
                name: org.name,
                slug: org.slug,
                timezone: tz,
                currency,
                logoUrl: org.logoUrl,
                brandName: org.brandName,
                primaryColor: org.primaryColor,
                bookingPage: {
                    status: org.bookingEnabled ? "PUBLISHED" : "UNPUBLISHED",
                    url: publicUrl,
                },
            },
            today: {
                appointments: {
                    total: totalAppointmentsCount,
                    completed: completedAppointmentsCount,
                    upcoming: upcomingAppointmentsCount,
                },
                collectedRevenueCents,
                expectedRevenueCents,
                currency,
            },
            upcomingAppointments,
            health: {
                bookingReady,
                issues,
            },
            performance: {
                period: "7d",
                bookingsCount: perfBookings,
                bookingsVsPrev,
                collectedRevenueCents: perfCollectedCents,
                revenueVsPrev,
                cancellationCount: perfCancelled,
                utilizationRate,
                currency,
            },
            waitlistOpportunity,
            forex,
        };
    }
}
