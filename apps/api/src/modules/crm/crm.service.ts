import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { CustomerDetailsResponseDto, CustomerTimelineEventDto, RequestContext } from "@bookpro/contracts";
import { CustomerPortalService } from "../customer-portal/customer-portal.service";

@Injectable()
export class CrmService {
    constructor(
        private readonly prisma: PrismaService,
        @Optional() private readonly customerPortalService?: CustomerPortalService,
    ) { }

    async listCustomers(
        organizationId: string,
        query?: { search?: string; tag?: string; accountFilter?: "ALL" | "PORTAL_MEMBER" | "GUEST" }
    ) {
        const whereClause: any = {
            organizationId,
        };

        if (query?.search) {
            whereClause.OR = [
                { fullName: { contains: query.search, mode: "insensitive" } },
                { email: { contains: query.search, mode: "insensitive" } },
                { phone: { contains: query.search, mode: "insensitive" } },
            ];
        }

        if (query?.tag) {
            whereClause.tags = { has: query.tag };
        }

        if (query?.accountFilter === "PORTAL_MEMBER") {
            whereClause.userId = { not: null };
        } else if (query?.accountFilter === "GUEST") {
            whereClause.userId = null;
        }

        const [org, customers, pendingInvitations] = await Promise.all([
            this.prisma.organization.findUnique({
                where: { id: organizationId },
                select: { currency: true },
            }),
            this.prisma.customer.findMany({
                where: whereClause,
                include: {
                    appointments: {
                        select: {
                            id: true,
                            startAt: true,
                            status: true,
                            priceCents: true,
                            paymentRecords: {
                                select: {
                                    amountCents: true,
                                    currency: true,
                                    status: true,
                                    metadata: true,
                                    refunds: { select: { amountCents: true, currency: true, status: true } },
                                },
                            },
                        },
                        orderBy: { startAt: "desc" },
                    },
                    user: {
                        select: {
                            id: true,
                            email: true,
                            emailVerifiedAt: true,
                            accountType: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
            }),
            this.prisma.customerInvitation.findMany({
                where: {
                    organizationId,
                    status: "PENDING",
                    expiresAt: { gt: new Date() },
                },
                select: {
                    id: true,
                    email: true,
                    status: true,
                    expiresAt: true,
                },
            }),
        ]);

        const orgCurrency = org?.currency || "USD";

        const inviteMap = new Map<string, { id: string; status: string; expiresAt: string }>();
        for (const inv of pendingInvitations) {
            inviteMap.set(inv.email.toLowerCase(), {
                id: inv.id,
                status: inv.status,
                expiresAt: inv.expiresAt.toISOString(),
            });
        }

        return customers.map((c) => {
            const now = new Date();
            const futureAppts = c.appointments.filter((a) => new Date(a.startAt) > now && a.status === "CONFIRMED");
            const pastAppts = c.appointments.filter((a) => new Date(a.startAt) <= now);

            const nextBookingAt = futureAppts.length > 0 ? futureAppts[futureAppts.length - 1].startAt.toISOString() : undefined;
            const lastBookingAt = pastAppts.length > 0 ? pastAppts[0].startAt.toISOString() : (c.lastBookingAt ? c.lastBookingAt.toISOString() : undefined);

            const completedCount = Math.max(c.completedAppointmentsCount, c.appointments.filter((a) => a.status === "COMPLETED").length);
            const cancelledCount = Math.max(c.cancelledCount, c.appointments.filter((a) => a.status === "CANCELLED").length);
            const noShowCount = Math.max(c.noShowCount, c.appointments.filter((a) => a.status === "NO_SHOW").length);

            let calculatedSpentCents = 0;
            for (const appt of c.appointments) {
                for (const pay of (appt.paymentRecords || [])) {
                    if (pay.status === "SUCCEEDED") {
                        const meta = (pay.metadata as any) || {};
                        let payInOrgCents = pay.amountCents;
                        if (meta.originalCurrency === orgCurrency && meta.originalAmountCents != null) {
                            payInOrgCents = Number(meta.originalAmountCents);
                        } else if (meta.exchangeRate && pay.currency !== orgCurrency) {
                            payInOrgCents = Math.round(pay.amountCents / Number(meta.exchangeRate));
                        }
                        calculatedSpentCents += payInOrgCents;

                        for (const ref of (pay.refunds || [])) {
                            if (ref.status === "SUCCEEDED") {
                                let refInOrgCents = ref.amountCents;
                                if (meta.exchangeRate && pay.currency !== orgCurrency) {
                                    refInOrgCents = Math.round(ref.amountCents / Number(meta.exchangeRate));
                                } else if (meta.originalCurrency === orgCurrency && meta.originalAmountCents != null && pay.amountCents > 0) {
                                    refInOrgCents = Math.round((ref.amountCents / pay.amountCents) * Number(meta.originalAmountCents));
                                }
                                calculatedSpentCents -= refInOrgCents;
                            }
                        }
                    }
                }
            }
            const totalSpentCents = Math.max(c.totalSpentCents, calculatedSpentCents);

            const pendingInvitation = inviteMap.get(c.email.toLowerCase()) || null;

            return {
                id: c.id,
                organizationId: c.organizationId,
                fullName: c.fullName,
                email: c.email,
                phone: c.phone || undefined,
                tags: c.tags || [],
                operationalNotes: c.operationalNotes || undefined,
                totalSpentCents,
                currency: orgCurrency,
                completedAppointmentsCount: completedCount,
                cancelledCount,
                noShowCount,
                lastBookingAt,
                nextBookingAt,
                consentMarketing: c.consentMarketing,
                consentMarketingAt: c.consentMarketingAt?.toISOString(),
                consentSource: c.consentSource || undefined,
                createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
                user: c.user ? {
                    id: c.user.id,
                    email: c.user.email,
                    emailVerifiedAt: c.user.emailVerifiedAt ? c.user.emailVerifiedAt.toISOString() : null,
                    accountType: c.user.accountType,
                } : null,
                pendingInvitation,
            };
        });
    }

    async getCustomerDetails(
        organizationId: string,
        customerId: string,
        isAiActor = false
    ): Promise<CustomerDetailsResponseDto> {
        const [org, customer] = await Promise.all([
            this.prisma.organization.findUnique({
                where: { id: organizationId },
                select: { currency: true },
            }),
            this.prisma.customer.findFirst({
                where: { id: customerId, organizationId },
                include: {
                appointments: {
                    include: {
                        service: true,
                        staff: true,
                        location: true,
                        history: true,
                        paymentRecords: {
                            include: { refunds: true },
                        },
                    },
                    orderBy: { startAt: "desc" },
                },
                notes: {
                    orderBy: { createdAt: "desc" },
                },
                user: {
                    select: {
                        id: true,
                        email: true,
                        emailVerifiedAt: true,
                        accountType: true,
                    },
                },
                waitlistEntries: {
                    include: {
                        service: true,
                        location: true,
                        staff: true,
                    },
                    orderBy: { createdAt: "desc" },
                },
                reviews: {
                    include: {
                        service: true,
                        staff: true,
                        location: true,
                    },
                    orderBy: { createdAt: "desc" },
                },
            },
        }),
    ]);

        if (!customer) {
            throw new NotFoundException(`Customer ${customerId} not found`);
        }

        const orgCurrency = org?.currency || "USD";

        // Fetch staff user display names for notes
        const authorIds = Array.from(new Set(customer.notes.map((n) => n.authorId)));
        const authorsResult = authorIds.length > 0 ? await this.prisma.user.findMany({
            where: { id: { in: authorIds } },
            select: { id: true, fullName: true },
        }) : [];
        const authors = Array.isArray(authorsResult) ? authorsResult : [];
        const authorMap = new Map(authors.map((a) => [a.id, a.fullName]));

        // Fetch pending invitation for this customer
        const pendingInvitation = await this.prisma.customerInvitation.findFirst({
            where: {
                organizationId,
                email: { equals: customer.email.toLowerCase(), mode: "insensitive" },
                status: "PENDING",
                expiresAt: { gt: new Date() },
            },
            select: { id: true, status: true, expiresAt: true },
        });

        // AI Safety Isolation: Do NOT leak internal staff notes or operational notes to AI context!
        const safeNotes = isAiActor
            ? []
            : customer.notes.map((n) => ({
                id: n.id,
                authorId: n.authorId,
                authorName: authorMap.get(n.authorId) || "Staff member",
                content: n.noteText,
                isInternal: n.isInternal,
                createdAt: n.createdAt.toISOString(),
            }));

        const safeOperationalNotes = isAiActor
            ? undefined
            : customer.operationalNotes || undefined;

        // Build Chronological Timeline Events
        const timeline: CustomerTimelineEventDto[] = [];

        // 1. Add Appointment events
        for (const appt of customer.appointments) {
            timeline.push({
                id: `evt_appt_${appt.id}`,
                type: "APPOINTMENT_CREATED",
                timestamp: appt.createdAt.toISOString(),
                title: `Booked ${appt.service?.name || "Service"}`,
                description: `Scheduled for ${new Date(appt.startAt).toLocaleString()}${appt.staff?.displayName ? ` with ${appt.staff.displayName}` : ""}`,
                metadata: { appointmentId: appt.id, status: appt.status, priceCents: appt.priceCents },
            });

            if (appt.status === "CHECKED_IN" && appt.checkInAt) {
                timeline.push({
                    id: `evt_chk_${appt.id}`,
                    type: "CHECKED_IN",
                    timestamp: appt.checkInAt.toISOString(),
                    title: `Checked in for ${appt.service?.name || "Service"}`,
                    metadata: { appointmentId: appt.id },
                });
            }

            if (appt.status === "COMPLETED") {
                timeline.push({
                    id: `evt_cmp_${appt.id}`,
                    type: "COMPLETED",
                    timestamp: appt.updatedAt.toISOString(),
                    title: `Completed ${appt.service?.name || "Service"}`,
                    metadata: { appointmentId: appt.id },
                });
            }

            if (appt.status === "CANCELLED" && appt.cancelledAt) {
                timeline.push({
                    id: `evt_cnc_${appt.id}`,
                    type: "CANCELLED",
                    timestamp: appt.cancelledAt.toISOString(),
                    title: `Cancelled ${appt.service?.name || "Service"}`,
                    description: appt.cancelReason ? `Reason: ${appt.cancelReason}` : undefined,
                    metadata: { appointmentId: appt.id },
                });
            }

            // 2. Add Payment & Refund events
            for (const pay of appt.paymentRecords) {
                if (pay.status === "SUCCEEDED" && pay.paidAt) {
                    const meta = (pay.metadata as any) || {};
                    let payInOrgCents = pay.amountCents;
                    if (meta.originalCurrency === orgCurrency && meta.originalAmountCents != null) {
                        payInOrgCents = Number(meta.originalAmountCents);
                    } else if (meta.exchangeRate && pay.currency !== orgCurrency) {
                        payInOrgCents = Math.round(pay.amountCents / Number(meta.exchangeRate));
                    }
                    timeline.push({
                        id: `evt_pay_${pay.id}`,
                        type: "PAYMENT_SUCCEEDED",
                        timestamp: pay.paidAt.toISOString(),
                        title: `Payment Received (${orgCurrency} ${(payInOrgCents / 100).toFixed(2)})`,
                        metadata: {
                            paymentId: pay.id,
                            amountCents: payInOrgCents,
                            currency: orgCurrency,
                            stripeAmountCents: pay.amountCents,
                            stripeCurrency: pay.currency,
                        },
                    });
                }

                for (const ref of pay.refunds) {
                    if (ref.status === "SUCCEEDED" && ref.processedAt) {
                        const meta = (pay.metadata as any) || {};
                        let refInOrgCents = ref.amountCents;
                        if (meta.exchangeRate && pay.currency !== orgCurrency) {
                            refInOrgCents = Math.round(ref.amountCents / Number(meta.exchangeRate));
                        } else if (meta.originalCurrency === orgCurrency && meta.originalAmountCents != null && pay.amountCents > 0) {
                            refInOrgCents = Math.round((ref.amountCents / pay.amountCents) * Number(meta.originalAmountCents));
                        }
                        timeline.push({
                            id: `evt_ref_${ref.id}`,
                            type: "REFUND_ISSUED",
                            timestamp: ref.processedAt.toISOString(),
                            title: `Refund Processed (${orgCurrency} ${(refInOrgCents / 100).toFixed(2)})`,
                            description: ref.reason || undefined,
                            metadata: {
                                refundId: ref.id,
                                amountCents: refInOrgCents,
                                currency: orgCurrency,
                                stripeAmountCents: ref.amountCents,
                                stripeCurrency: ref.currency,
                            },
                        });
                    }
                }
            }
        }

        // 3. Add Notes events (only for non-AI actors)
        if (!isAiActor) {
            for (const note of customer.notes) {
                timeline.push({
                    id: `evt_note_${note.id}`,
                    type: "NOTE_ADDED",
                    timestamp: note.createdAt.toISOString(),
                    title: "Staff Note Added",
                    description: note.noteText,
                    metadata: { noteId: note.id, isInternal: note.isInternal, authorName: authorMap.get(note.authorId) },
                });
            }
        }

        // 4. Add Waitlist events
        for (const entry of (customer.waitlistEntries || [])) {
            timeline.push({
                id: `evt_wl_${entry.id}`,
                type: "WAITLIST_JOINED",
                timestamp: entry.createdAt.toISOString(),
                title: `Joined Waitlist for ${entry.service?.name || "Service"}`,
                description: `Status: ${entry.status}`,
                metadata: { waitlistEntryId: entry.id, status: entry.status },
            });
        }

        // 5. Add Review events
        for (const rev of (customer.reviews || [])) {
            timeline.push({
                id: `evt_rev_${rev.id}`,
                type: "REVIEW_LEFT",
                timestamp: rev.createdAt.toISOString(),
                title: `Left a ${rev.rating}-Star Review`,
                description: rev.comment || undefined,
                metadata: { reviewId: rev.id, rating: rev.rating },
            });
        }

        // 6. Add Customer Account / Portal Event
        if (customer.user) {
            timeline.push({
                id: `evt_usr_${customer.user.id}`,
                type: "PORTAL_JOINED",
                timestamp: customer.user.emailVerifiedAt ? customer.user.emailVerifiedAt.toISOString() : customer.createdAt.toISOString(),
                title: "Verified Customer Portal Member",
                description: `Account verified and active (${customer.user.email})`,
                metadata: { userId: customer.user.id },
            });
        }

        // Sort timeline descending by timestamp
        timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const now = new Date();
        const futureAppts = customer.appointments.filter((a) => new Date(a.startAt) > now && a.status === "CONFIRMED");
        const pastAppts = customer.appointments.filter((a) => new Date(a.startAt) <= now);
        const nextBookingAt = futureAppts.length > 0 ? futureAppts[futureAppts.length - 1].startAt.toISOString() : undefined;
        const lastBookingAt = pastAppts.length > 0 ? pastAppts[0].startAt.toISOString() : (customer.lastBookingAt ? customer.lastBookingAt.toISOString() : undefined);

        const completedCount = Math.max(customer.completedAppointmentsCount, customer.appointments.filter((a) => a.status === "COMPLETED").length);
        const cancelledCount = Math.max(customer.cancelledCount, customer.appointments.filter((a) => a.status === "CANCELLED").length);
        const noShowCount = Math.max(customer.noShowCount, customer.appointments.filter((a) => a.status === "NO_SHOW").length);

        let calculatedSpentCents = 0;
        for (const appt of customer.appointments) {
            for (const pay of (appt.paymentRecords || [])) {
                if (pay.status === "SUCCEEDED") {
                    const meta = (pay.metadata as any) || {};
                    let payInOrgCents = pay.amountCents;
                    if (meta.originalCurrency === orgCurrency && meta.originalAmountCents != null) {
                        payInOrgCents = Number(meta.originalAmountCents);
                    } else if (meta.exchangeRate && pay.currency !== orgCurrency) {
                        payInOrgCents = Math.round(pay.amountCents / Number(meta.exchangeRate));
                    }
                    calculatedSpentCents += payInOrgCents;

                    for (const ref of (pay.refunds || [])) {
                        if (ref.status === "SUCCEEDED") {
                            let refInOrgCents = ref.amountCents;
                            if (meta.exchangeRate && pay.currency !== orgCurrency) {
                                refInOrgCents = Math.round(ref.amountCents / Number(meta.exchangeRate));
                            } else if (meta.originalCurrency === orgCurrency && meta.originalAmountCents != null && pay.amountCents > 0) {
                                refInOrgCents = Math.round((ref.amountCents / pay.amountCents) * Number(meta.originalAmountCents));
                            }
                            calculatedSpentCents -= refInOrgCents;
                        }
                    }
                }
            }
        }
        const totalSpentCents = Math.max(customer.totalSpentCents, calculatedSpentCents);

        return {
            id: customer.id,
            organizationId: customer.organizationId,
            fullName: customer.fullName,
            email: customer.email,
            phone: customer.phone || undefined,
            tags: customer.tags || [],
            operationalNotes: safeOperationalNotes,
            notes: safeNotes,
            timeline,
            totalSpentCents,
            currency: orgCurrency,
            completedAppointmentsCount: completedCount,
            cancelledCount,
            noShowCount,
            lastBookingAt,
            nextBookingAt,
            consentMarketing: customer.consentMarketing,
            consentMarketingAt: customer.consentMarketingAt?.toISOString(),
            consentSource: customer.consentSource || undefined,
            appointments: customer.appointments,
            waitlistEntries: isAiActor ? [] : (customer.waitlistEntries || []),
            reviews: customer.reviews || [],
            createdAt: customer.createdAt ? new Date(customer.createdAt).toISOString() : new Date().toISOString(),
            user: customer.user ? {
                id: customer.user.id,
                email: customer.user.email,
                emailVerifiedAt: customer.user.emailVerifiedAt ? customer.user.emailVerifiedAt.toISOString() : null,
                accountType: customer.user.accountType,
            } : null,
            pendingInvitation: pendingInvitation ? {
                id: pendingInvitation.id,
                status: pendingInvitation.status,
                expiresAt: pendingInvitation.expiresAt.toISOString(),
            } : null,
        };
    }

    async createCustomer(
        organizationId: string,
        authorId: string,
        dto: {
            fullName: string;
            email: string;
            phone?: string | null;
            tags?: string[];
            operationalNotes?: string | null;
            consentMarketing?: boolean;
        }
    ) {
        const normalizedEmail = dto.email.toLowerCase().trim();

        const existing = await this.prisma.customer.findFirst({
            where: {
                organizationId,
                email: { equals: normalizedEmail, mode: "insensitive" },
            },
        });

        if (existing) {
            throw new ConflictException(`Customer with email ${dto.email} already exists in this organization`);
        }

        // Auto-link to existing user account if present in platform
        const existingUser = await this.prisma.user.findFirst({
            where: {
                email: { equals: normalizedEmail, mode: "insensitive" },
                accountType: "CUSTOMER",
            },
            select: { id: true },
        });

        const customer = await this.prisma.$transaction(async (tx) => {
            const created = await tx.customer.create({
                data: {
                    organizationId,
                    userId: existingUser ? existingUser.id : null,
                    fullName: dto.fullName.trim(),
                    email: normalizedEmail,
                    phone: dto.phone?.trim() || null,
                    tags: dto.tags || [],
                    operationalNotes: dto.operationalNotes?.trim() || null,
                    consentMarketing: !!dto.consentMarketing,
                    consentMarketingAt: dto.consentMarketing ? new Date() : null,
                    consentSource: dto.consentMarketing ? "OWNER_PORTAL" : null,
                },
            });

            await tx.auditLog.create({
                data: {
                    organizationId,
                    actorType: "STAFF",
                    actorId: authorId,
                    action: "customer.created",
                    resourceType: "Customer",
                    resourceId: created.id,
                    payload: {
                        fullName: created.fullName,
                        email: created.email,
                        tags: created.tags,
                    },
                },
            });

            return created;
        });

        return customer;
    }

    async updateCustomer(
        organizationId: string,
        customerId: string,
        authorId: string,
        dto: {
            fullName?: string;
            phone?: string | null;
            tags?: string[];
            operationalNotes?: string | null;
            consentMarketing?: boolean;
        }
    ) {
        const customer = await this.prisma.customer.findFirst({
            where: { id: customerId, organizationId },
        });

        if (!customer) {
            throw new NotFoundException(`Customer ${customerId} not found`);
        }

        const updateData: any = {};
        if (dto.fullName !== undefined) updateData.fullName = dto.fullName.trim();
        if (dto.phone !== undefined) updateData.phone = dto.phone?.trim() || null;
        if (dto.tags !== undefined) updateData.tags = dto.tags;
        if (dto.operationalNotes !== undefined) updateData.operationalNotes = dto.operationalNotes?.trim() || null;
        if (dto.consentMarketing !== undefined) {
            updateData.consentMarketing = dto.consentMarketing;
            updateData.consentMarketingAt = new Date();
            updateData.consentSource = "OWNER_PORTAL_UPDATE";
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            const res = await tx.customer.update({
                where: { id: customerId },
                data: updateData,
            });

            await tx.auditLog.create({
                data: {
                    organizationId,
                    actorType: "STAFF",
                    actorId: authorId,
                    action: "customer.updated",
                    resourceType: "Customer",
                    resourceId: customerId,
                    payload: updateData,
                },
            });

            return res;
        });

        return updated;
    }

    async deleteCustomer(
        organizationId: string,
        customerId: string,
        authorId: string
    ) {
        const customer = await this.prisma.customer.findFirst({
            where: { id: customerId, organizationId },
            include: {
                appointments: {
                    where: {
                        status: { in: ["CONFIRMED", "HOLD", "IN_PROGRESS", "PENDING_PAYMENT"] },
                    },
                },
            },
        });

        if (!customer) {
            throw new NotFoundException(`Customer ${customerId} not found`);
        }

        if (customer.appointments.length > 0) {
            throw new BadRequestException(
                `Cannot delete customer: ${customer.appointments.length} active scheduled booking(s) exist. Please complete or cancel them before deleting.`
            );
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.customer.delete({
                where: { id: customerId },
            });

            await tx.auditLog.create({
                data: {
                    organizationId,
                    actorType: "STAFF",
                    actorId: authorId,
                    action: "customer.deleted",
                    resourceType: "Customer",
                    resourceId: customerId,
                    payload: {
                        fullName: customer.fullName,
                        email: customer.email,
                    },
                },
            });
        });

        return { success: true, message: "Customer deleted successfully" };
    }

    async inviteCustomer(
        organizationId: string,
        customerId: string,
        ctx: RequestContext
    ) {
        const customer = await this.prisma.customer.findFirst({
            where: { id: customerId, organizationId },
        });

        if (!customer) {
            throw new NotFoundException(`Customer ${customerId} not found`);
        }

        if (customer.userId) {
            throw new BadRequestException("This customer already has an active verified customer portal account.");
        }

        if (!this.customerPortalService) {
            throw new BadRequestException("Customer Portal Service is not available.");
        }

        return this.customerPortalService.invite({ email: customer.email }, ctx);
    }

    async manageCustomerTag(
        organizationId: string,
        customerId: string,
        authorId: string,
        tag: string,
        action: "add" | "remove"
    ) {
        const customer = await this.prisma.customer.findFirst({
            where: { id: customerId, organizationId },
        });

        if (!customer) {
            throw new NotFoundException(`Customer ${customerId} not found`);
        }

        const trimmedTag = tag.trim();
        let newTags = [...(customer.tags || [])];

        if (action === "add") {
            if (!newTags.includes(trimmedTag)) {
                newTags.push(trimmedTag);
            }
        } else {
            newTags = newTags.filter((t) => t !== trimmedTag);
        }

        return this.updateCustomer(organizationId, customerId, authorId, { tags: newTags });
    }

    async addCustomerNote(
        organizationId: string,
        customerId: string,
        authorId: string,
        content: string,
        isInternal = true
    ) {
        const customer = await this.prisma.customer.findFirst({
            where: { id: customerId, organizationId },
        });

        if (!customer) {
            throw new NotFoundException(`Customer ${customerId} not found`);
        }

        return this.prisma.customerNote.create({
            data: {
                customerId,
                authorId,
                noteText: content,
                isInternal,
            },
        });
    }

    async updateMarketingConsent(
        organizationId: string,
        customerId: string,
        consentMarketing: boolean,
        source?: string
    ) {
        const customer = await this.prisma.customer.findFirst({
            where: { id: customerId, organizationId },
        });

        if (!customer) {
            throw new NotFoundException(`Customer ${customerId} not found`);
        }

        return this.prisma.customer.update({
            where: { id: customerId },
            data: {
                consentMarketing,
                consentMarketingAt: new Date(),
                consentSource: source || "CUSTOMER_PORTAL",
            },
        });
    }
}
