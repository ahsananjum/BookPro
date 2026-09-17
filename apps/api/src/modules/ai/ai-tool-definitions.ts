import { AIToolDeclaration } from "./ai-provider.interface";

const uuid = { type: "string", format: "uuid" };
const date = { type: "string", format: "date" };
const instant = { type: "string", format: "date-time" };

// =========================================================================
// CUSTOMER CONCIERGE & RECEPTIONIST TOOLS (Strictly Customer-Facing)
// =========================================================================
export const CUSTOMER_AI_TOOL_DECLARATIONS: AIToolDeclaration[] = [
    {
        name: "getLocations",
        description: "List tenant-approved physical salon/business locations, IDs, addresses, and timezones.",
        parameters: { type: "object", properties: { query: { type: "string" } } },
    },
    {
        name: "getServices",
        description: "List tenant-approved active services and treatments available for booking.",
        parameters: { type: "object", properties: { query: { type: "string" }, locationId: uuid } },
    },
    {
        name: "getServiceDetails",
        description: "Retrieve complete customer-facing details for a specific service, including preparation instructions, duration, pricing, and deposit rules.",
        parameters: {
            type: "object",
            properties: { serviceId: uuid },
            required: ["serviceId"],
        },
    },
    {
        name: "findAvailability",
        description: "Return authoritative available appointment slots computed by BookPro AvailabilityModule. If serviceId is omitted, automatically resolves to matching or primary services.",
        parameters: {
            type: "object",
            properties: {
                serviceId: { type: "string", description: "Optional UUID or name of the service." },
                locationId: uuid,
                staffId: uuid,
                startDate: { type: "string", description: "Target date in YYYY-MM-DD format or 'today' or 'tomorrow'." },
                endDate: { type: "string", description: "End date in YYYY-MM-DD format." },
                timezone: { type: "string" },
                partySize: { type: "integer", minimum: 1 },
            },
        },
    },
    {
        name: "getBooking",
        description: "Get booking details only when the customer owns the appointment.",
        parameters: { type: "object", properties: { bookingId: uuid }, required: ["bookingId"] },
    },
    {
        name: "createBookingHold",
        description: "Prepare an authoritative booking-hold proposal under PostgreSQL concurrency locks. Reserves the slot with a live ticking countdown timer.",
        parameters: {
            type: "object",
            properties: {
                serviceId: { type: "string" },
                locationId: uuid,
                staffId: uuid,
                startAt: instant,
                endAt: instant,
                partySize: { type: "integer", minimum: 1 },
                guestName: { type: "string" },
                guestEmail: { type: "string" },
                guestPhone: { type: "string" },
            },
            required: ["serviceId", "startAt", "endAt"],
        },
    },
    {
        name: "releaseBookingHold",
        description: "Cancel an active temporary booking hold and immediately release the held seat back to the availability pool.",
        parameters: {
            type: "object",
            properties: {
                holdId: uuid,
                reason: { type: "string" },
            },
        },
    },
    {
        name: "confirmBooking",
        description: "Finalize a confirmed booking reservation for an active hold. If no deposit is required, confirms immediately; if deposit is required, yields checkout handoff.",
        parameters: { type: "object", properties: { holdId: uuid }, required: ["holdId"] },
    },
    {
        name: "rescheduleBooking",
        description: "Prepare an authoritative reschedule proposal for an owned customer booking, with option to auto-assign any qualified available specialist.",
        parameters: {
            type: "object",
            properties: {
                bookingId: uuid,
                newStartAt: instant,
                newEndAt: instant,
                newStaffId: uuid,
                autoAssignSpecialist: { type: "boolean", description: "Whether to auto-assign any qualified available specialist if preferred practitioner is booked." },
            },
            required: ["bookingId", "newStartAt"],
        },
    },
    {
        name: "autoRescheduleAppointment",
        description: "Automatically reschedule an existing appointment to the earliest/optimal slot across all qualified staff, respecting priority waitlists if the target date is full.",
        parameters: {
            type: "object",
            properties: {
                bookingId: uuid,
                preferredDate: date,
                timePreference: { type: "string", enum: ["ANY", "MORNING", "AFTERNOON", "EVENING"] },
                allowAnySpecialist: { type: "boolean" },
            },
        },
    },
    {
        name: "cancelBooking",
        description: "Prepare a cancellation proposal computing authoritative policy quote (penalty vs refund) for an owned customer booking.",
        parameters: { type: "object", properties: { bookingId: uuid, reason: { type: "string" } }, required: ["bookingId"] },
    },
    {
        name: "joinWaitlist",
        description: "Prepare a structured waitlist proposal to wait for an opening for a service.",
        parameters: {
            type: "object",
            properties: {
                serviceId: uuid,
                locationId: uuid,
                staffId: uuid,
                allowFallbackStaff: { type: "boolean" },
                startWindowDate: date,
                endWindowDate: date,
                timePreference: { type: "string", enum: ["ANY", "MORNING", "AFTERNOON", "EVENING"] },
                partySize: { type: "integer", minimum: 1 },
                notes: { type: "string" },
                guestName: { type: "string" },
                guestEmail: { type: "string" },
                guestPhone: { type: "string" },
            },
            required: ["serviceId", "startWindowDate", "endWindowDate"],
        },
    },
    {
        name: "leaveWaitlist",
        description: "Prepare a proposal for the customer to withdraw/leave an active waitlist entry.",
        parameters: {
            type: "object",
            properties: { waitlistEntryId: uuid, reason: { type: "string" } },
            required: ["waitlistEntryId"],
        },
    },
    {
        name: "getOrganizationInfo",
        description: "Get authoritative public information about the business: brand name, description, contact details, operating hours, and locations.",
        parameters: { type: "object", properties: {} },
    },
    {
        name: "getMyAccountSummary",
        description: "Get an account overview for the authenticated customer: upcoming appointment count, active holds, and waitlist requests.",
        parameters: { type: "object", properties: {} },
    },
    {
        name: "getMyUpcomingAppointments",
        description: "Retrieve the authenticated customer's own upcoming or past appointments with live authoritative backend details.",
        parameters: {
            type: "object",
            properties: {
                status: { type: "string", enum: ["UPCOMING", "PAST", "ALL"] },
                limit: { type: "integer", minimum: 1, maximum: 20 },
            },
        },
    },
    {
        name: "getMyBookingHolds",
        description: "Retrieve active temporary booking holds currently placed by the authenticated customer.",
        parameters: { type: "object", properties: {} },
    },
    {
        name: "getMyWaitlistStatus",
        description: "Retrieve the authenticated customer's active waitlist entries, requested dates, and active offers.",
        parameters: { type: "object", properties: {} },
    },
    {
        name: "getMyBillingHistory",
        description: "Retrieve the authenticated customer's billing receipts, past payments, and transaction history.",
        parameters: {
            type: "object",
            properties: { limit: { type: "integer", minimum: 1, maximum: 50 } },
        },
    },
    {
        name: "getOrganizationPolicies",
        description: "Retrieve authoritative customer-facing policies for cancellations, rescheduling, deposit requirements, and hold durations.",
        parameters: {
            type: "object",
            properties: { locationId: uuid, serviceId: uuid },
        },
    },
];

// =========================================================================
// OWNER & STAFF OPERATIONS CO-PILOT TOOLS (Strictly Staff/Owner-Facing)
// =========================================================================
export const OWNER_AI_TOOL_DECLARATIONS: AIToolDeclaration[] = [
    {
        name: "getBusinessOverview",
        description: "Get authoritative real-time operational and financial KPIs: today's revenue, booking count, completed/no-show ratio, active staff on duty, and occupancy rate.",
        parameters: {
            type: "object",
            properties: {
                locationId: uuid,
                period: { type: "string", enum: ["today", "week", "month"], description: "Time period window. Default is 'today'." },
            },
        },
    },
    {
        name: "getAppointmentsAgenda",
        description: "Query full appointment schedules and agendas across all staff and locations. If startDate is omitted, defaults to today's schedule. Set startDate to 'all' to inspect entire schedule history.",
        parameters: {
            type: "object",
            properties: {
                startDate: { type: "string", description: "Start date in YYYY-MM-DD format, 'today', 'tomorrow', or 'all'." },
                endDate: { type: "string", description: "End date in YYYY-MM-DD format." },
                locationId: uuid,
                staffId: uuid,
                status: { type: "string", description: "Optional filter (e.g. CONFIRMED, CHECKED_IN, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW)." },
            },
        },
    },
    {
        name: "scheduleStaffAppointment",
        description: "Staff/Owner books an appointment on behalf of a customer or walk-in. Creates an authoritative proposal for owner review with override capability. If locationId is omitted, defaults to primary active location.",
        parameters: {
            type: "object",
            properties: {
                locationId: uuid,
                serviceId: { type: "string", description: "Service UUID or name." },
                staffId: uuid,
                startAt: instant,
                endAt: instant,
                customerName: { type: "string", description: "Customer full name." },
                customerEmail: { type: "string" },
                customerPhone: { type: "string" },
                paymentStatus: { type: "string", enum: ["UNPAID", "PAID", "PARTIALLY_PAID", "DEPOSIT_PAID"] },
                internalNotes: { type: "string", description: "Confidential staff operational notes." },
                overrideReason: { type: "string", description: "Reason if booking outside normal hours or overriding availability." },
            },
            required: ["serviceId", "startAt", "customerName"],
        },
    },
    {
        name: "rescheduleStaffAppointment",
        description: "Staff/Owner reschedules an existing appointment to a new time or practitioner. Creates an authoritative confirmation proposal.",
        parameters: {
            type: "object",
            properties: {
                appointmentId: uuid,
                newStartAt: instant,
                newEndAt: instant,
                newStaffId: uuid,
                reason: { type: "string", description: "Staff reason for rescheduling." },
            },
            required: ["appointmentId", "newStartAt"],
        },
    },
    {
        name: "cancelStaffAppointment",
        description: "Staff/Owner cancels an existing appointment with a documented reason. Automatically triggers the autonomous schedule optimizer to backfill the vacated slot.",
        parameters: {
            type: "object",
            properties: {
                appointmentId: uuid,
                reason: { type: "string", description: "Documented staff reason for cancellation." },
            },
            required: ["appointmentId", "reason"],
        },
    },
    {
        name: "updateAppointmentStatus",
        description: "Update the operational status of an appointment (e.g. mark customer CHECKED_IN, mark appointment IN_PROGRESS, mark COMPLETED to calculate commissions, or mark NO_SHOW).",
        parameters: {
            type: "object",
            properties: {
                appointmentId: uuid,
                status: { type: "string", enum: ["CHECKED_IN", "IN_PROGRESS", "COMPLETED", "NO_SHOW"] },
            },
            required: ["appointmentId", "status"],
        },
    },
    {
        name: "listBusinessServices",
        description: "List all services in the business catalog (active and inactive), with pricing, durations, buffer times, categories, and assigned staff counts.",
        parameters: {
            type: "object",
            properties: {
                category: { type: "string" },
                activeOnly: { type: "boolean" },
            },
        },
    },
    {
        name: "createBusinessService",
        description: "Propose adding a brand new service/treatment to the business catalog. Creates an authoritative proposal for owner confirmation.",
        parameters: {
            type: "object",
            properties: {
                name: { type: "string" },
                category: { type: "string" },
                description: { type: "string" },
                durationMin: { type: "integer", minimum: 5, maximum: 1440 },
                priceCents: { type: "integer", minimum: 0 },
                currency: { type: "string", default: "USD" },
                depositType: { type: "string", enum: ["NONE", "FIXED", "PERCENTAGE"], default: "NONE" },
                depositValue: { type: "integer", minimum: 0, default: 0 },
                preBufferMin: { type: "integer", minimum: 0, default: 0 },
                postBufferMin: { type: "integer", minimum: 0, default: 0 },
            },
            required: ["name", "category", "durationMin", "priceCents"],
        },
    },
    {
        name: "updateBusinessService",
        description: "Propose updating pricing, duration, active status, or settings of an existing service. Creates a confirmation proposal.",
        parameters: {
            type: "object",
            properties: {
                serviceId: uuid,
                name: { type: "string" },
                priceCents: { type: "integer", minimum: 0 },
                durationMin: { type: "integer", minimum: 5 },
                isActive: { type: "boolean" },
                description: { type: "string" },
                depositType: { type: "string", enum: ["NONE", "FIXED", "PERCENTAGE"] },
                depositValue: { type: "integer", minimum: 0 },
            },
            required: ["serviceId"],
        },
    },
    {
        name: "getStaffRoster",
        description: "List team members, their roles, active status, assigned locations, and service qualifications.",
        parameters: {
            type: "object",
            properties: {
                locationId: uuid,
                activeOnly: { type: "boolean" },
            },
        },
    },
    {
        name: "getStaffSchedule",
        description: "Get recurring working hours, daily breaks, approved leaves, and scheduled bookings for a specific staff member.",
        parameters: {
            type: "object",
            properties: {
                staffId: uuid,
                date: { type: "string", description: "Target date in YYYY-MM-DD format." },
            },
            required: ["staffId"],
        },
    },
    {
        name: "updateStaffStatus",
        description: "Propose updating a staff member's active status, booking visibility, or job title. Creates a confirmation proposal.",
        parameters: {
            type: "object",
            properties: {
                staffId: uuid,
                isActive: { type: "boolean" },
                bookingVisible: { type: "boolean" },
                title: { type: "string" },
            },
            required: ["staffId"],
        },
    },
    {
        name: "searchCustomers",
        description: "Search customer directory by name, email, phone, or tags. Returns customer profiles with lifetime spend, visit count, and tags.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string" },
                tag: { type: "string" },
                limit: { type: "integer", minimum: 1, maximum: 50 },
            },
        },
    },
    {
        name: "getCustomerProfile",
        description: "Get a customer's detailed profile: appointment history, lifetime spend, no-show rate, confidential internal staff notes, and tags.",
        parameters: {
            type: "object",
            properties: { customerId: uuid },
            required: ["customerId"],
        },
    },
    {
        name: "addCustomerInternalNote",
        description: "Add a confidential, staff-only operational note to a customer record (e.g. preferences, formulas, VIP handling).",
        parameters: {
            type: "object",
            properties: {
                customerId: uuid,
                note: { type: "string" },
            },
            required: ["customerId", "note"],
        },
    },
    {
        name: "tagCustomer",
        description: "Add or remove a tag on a customer profile (e.g. 'VIP', 'High Spender', 'Frequent Rescheduler').",
        parameters: {
            type: "object",
            properties: {
                customerId: uuid,
                tag: { type: "string" },
                action: { type: "string", enum: ["ADD", "REMOVE"] },
            },
            required: ["customerId", "tag", "action"],
        },
    },
    {
        name: "getWaitlistQueue",
        description: "Inspect the current live waitlist queue across all services and locations, with customer names, requested dates, and entry status.",
        parameters: {
            type: "object",
            properties: {
                serviceId: uuid,
                locationId: uuid,
                status: { type: "string" },
            },
        },
    },
    {
        name: "issueManualWaitlistOffer",
        description: "Staff/Owner manually creates and dispatches an offer for a validated open slot to a customer on the waitlist. Creates an authoritative proposal.",
        parameters: {
            type: "object",
            properties: {
                waitlistEntryId: uuid,
                slotStartAt: instant,
                slotEndAt: instant,
                staffId: uuid,
                expiryMinutes: { type: "integer", minimum: 5, default: 60 },
            },
            required: ["waitlistEntryId", "slotStartAt", "slotEndAt"],
        },
    },
    {
        name: "getScheduleGapsAndRecovery",
        description: "Inspect the built-in schedule optimizer's gap analysis: detected dead-time gaps, schedule fragmentation index, and total recovered revenue from backfilled slots.",
        parameters: {
            type: "object",
            properties: {
                locationId: uuid,
                startDate: { type: "string" },
                endDate: { type: "string" },
            },
        },
    },
    {
        name: "getScheduleInsights",
        description: "Retrieve schedule intelligence insights generated by the autonomous optimizer engine.",
        parameters: {
            type: "object",
            properties: {
                status: { type: "string", enum: ["PENDING", "ACTIONED", "DISMISSED"] },
            },
        },
    },
    {
        name: "getMarketingTelemetry",
        description: "Retrieve marketing telemetry: audience segment counts (All, Active, Inactive, Lapsed, VIP), active discount coupons, and redemption rates.",
        parameters: { type: "object", properties: {} },
    },
    {
        name: "createDiscountCoupon",
        description: "Propose creating a promotional discount code (percentage or fixed discount) with usage limits and expiration date. Creates an authoritative confirmation proposal.",
        parameters: {
            type: "object",
            properties: {
                code: { type: "string", description: "Coupon code (e.g. FLASH20, VIPSPRING)." },
                discountType: { type: "string", enum: ["PERCENTAGE", "FIXED_AMOUNT"] },
                discountValue: { type: "integer", minimum: 1, description: "Percentage discount (e.g. 20) or fixed amount in cents (e.g. 1500 for $15)." },
                validUntil: { type: "string", description: "Expiration date in YYYY-MM-DD format." },
                usageLimit: { type: "integer", minimum: 1 },
                description: { type: "string" },
            },
            required: ["code", "discountType", "discountValue"],
        },
    },
    {
        name: "getCommissionsReport",
        description: "Query staff commission earnings: breakdown by staff member, gross service sales, commission rates, and paid vs unpaid amounts.",
        parameters: {
            type: "object",
            properties: {
                periodStart: { type: "string" },
                periodEnd: { type: "string" },
                staffId: uuid,
            },
        },
    },
    {
        name: "getBusinessPolicies",
        description: "Retrieve the organization's business policies: cancellation cutoff hours, cancellation fees, reschedule cutoff, and seat hold durations.",
        parameters: {
            type: "object",
            properties: { locationId: uuid, serviceId: uuid },
        },
    },
    {
        name: "updateBusinessPolicy",
        description: "Propose updating cancellation notice cutoff, cancellation fee rules, reschedule cutoff, or hold durations. Creates a confirmation proposal.",
        parameters: {
            type: "object",
            properties: {
                minNoticeHours: { type: "integer", minimum: 0 },
                cancelCutoffHours: { type: "integer", minimum: 0 },
                cancelFeeType: { type: "string", enum: ["NONE", "FIXED", "PERCENTAGE"] },
                cancelFeeValue: { type: "integer", minimum: 0 },
                rescheduleCutoffHours: { type: "integer", minimum: 0 },
                holdDurationMinutes: { type: "integer", minimum: 1 },
            },
        },
    },
];

// Combined list for general registration
export const AI_TOOL_DECLARATIONS: AIToolDeclaration[] = [
    ...CUSTOMER_AI_TOOL_DECLARATIONS,
    ...OWNER_AI_TOOL_DECLARATIONS,
];

export function getToolDeclarationsForScope(scope: "CUSTOMER" | "OWNER"): AIToolDeclaration[] {
    return scope === "OWNER" ? OWNER_AI_TOOL_DECLARATIONS : CUSTOMER_AI_TOOL_DECLARATIONS;
}
