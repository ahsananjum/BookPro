import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpdateOrganizationDto, OnboardingStepDto, PublishReadinessIssueDto } from '@bookpro/contracts';

@Injectable()
export class OrganizationService {
    constructor(private readonly prisma: PrismaService) { }

    async resolvePublishedOrganizationId(slug: string): Promise<string> {
        const normalizedSlug = slug.trim().toLowerCase();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
            throw new NotFoundException('Booking page not found');
        }
        const organization = await this.prisma.organization.findFirst({
            where: { slug: normalizedSlug, isActive: true, bookingEnabled: true, archivedAt: null },
            select: { id: true },
        });
        if (organization) return organization.id;

        const unconstrainedOrg = await this.prisma.organization.findFirst({
            where: { slug: normalizedSlug, archivedAt: null },
            select: { id: true },
        });
        if (unconstrainedOrg) return unconstrainedOrg.id;

        const location = await this.prisma.location.findFirst({
            where: {
                slug: normalizedSlug,
                archivedAt: null,
            },
            select: { organizationId: true },
        });
        if (!location) throw new NotFoundException('Booking page not found');
        return location.organizationId;
    }

    async getPublicOrganizationBySlug(slug: string) {
        return this.getOrganizationBySlug(slug);
    }

    async getOrganization(organizationId: string) {
        const org = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            include: {
                _count: {
                    select: {
                        locations: { where: { archivedAt: null } },
                        staffProfiles: { where: { archivedAt: null } },
                        services: { where: { archivedAt: null } },
                        resources: { where: { archivedAt: null } },
                    },
                },
            },
        });

        if (!org) {
            throw new NotFoundException('Organization not found');
        }

        return org;
    }

    async updateOrganization(organizationId: string, dto: UpdateOrganizationDto) {
        return this.prisma.organization.update({
            where: { id: organizationId },
            data: {
                ...(dto.name && { name: dto.name }),
                ...(dto.industry !== undefined && { industry: dto.industry }),
                ...(dto.timezone && { timezone: dto.timezone }),
                ...(dto.currency && { currency: dto.currency }),
                ...(dto.defaultLocale && { defaultLocale: dto.defaultLocale }),
                ...(dto.supportedLocales && { supportedLocales: dto.supportedLocales }),
                ...(dto.country && { country: dto.country }),
                ...(dto.phone !== undefined && { phone: dto.phone }),
                ...(dto.email !== undefined && { email: dto.email }),
                ...(dto.website !== undefined && { website: dto.website }),
                ...(dto.brandName !== undefined && { brandName: dto.brandName }),
                ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
                ...(dto.faviconUrl !== undefined && { faviconUrl: dto.faviconUrl }),
                ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
                ...(dto.accentColor !== undefined && { accentColor: dto.accentColor }),
                ...(dto.paymentIntent !== undefined && { paymentIntent: dto.paymentIntent }),
                ...(dto.bookingEnabled !== undefined && { bookingEnabled: dto.bookingEnabled }),
            },
        });
    }

    async saveOnboardingProgress(organizationId: string, dto: OnboardingStepDto) {
        const stepNum = Math.max(Math.min(dto.step || 1, 11), 1);

        return this.prisma.organization.update({
            where: { id: organizationId },
            data: {
                onboardingStep: stepNum,
                ...(dto.completed && { onboardingCompleted: true }),
            },
        });
    }

    async getOnboardingStatus(organizationId: string) {
        const [org, firstLocation, firstService, firstStaff, availabilitiesCount, policy] = await Promise.all([
            this.prisma.organization.findUnique({
                where: { id: organizationId },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    timezone: true,
                    currency: true,
                    country: true,
                    phone: true,
                    email: true,
                    website: true,
                    brandName: true,
                    logoUrl: true,
                    primaryColor: true,
                    accentColor: true,
                    industry: true,
                    onboardingStep: true,
                    onboardingCompleted: true,
                    bookingEnabled: true,
                    paymentIntent: true,
                    stripeAccountId: true,
                    stripeConnectedAt: true,
                    stripeChargesEnabled: true,
                    stripePayoutsEnabled: true,
                    stripeDetailsSubmitted: true,
                },
            }),
            this.prisma.location.findFirst({
                where: { organizationId, archivedAt: null },
                orderBy: { createdAt: 'asc' },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    timezone: true,
                    address: true,
                    city: true,
                    state: true,
                    postalCode: true,
                    country: true,
                    phone: true,
                    operatingHours: true,
                    taxRatePct: true,
                    instructions: true,
                },
            }),
            this.prisma.service.findFirst({
                where: { organizationId, archivedAt: null, isActive: true },
                orderBy: { createdAt: 'asc' },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    durationMin: true,
                    priceCents: true,
                    currency: true,
                    depositType: true,
                    depositValue: true,
                    postBufferMin: true,
                },
            }),
            this.prisma.staffProfile.findFirst({
                where: { organizationId, archivedAt: null, isActive: true },
                orderBy: { createdAt: 'asc' },
                include: {
                    membership: {
                        include: { user: { select: { email: true, fullName: true } } },
                    },
                    availabilities: {
                        orderBy: { dayOfWeek: 'asc' },
                        select: {
                            id: true,
                            dayOfWeek: true,
                            startTime: true,
                            endTime: true,
                            locationId: true,
                        },
                    },
                },
            }),
            this.prisma.staffAvailability.count({ where: { organizationId } }),
            this.prisma.policyConfig.findFirst({
                where: { organizationId, locationId: null, serviceId: null },
                select: {
                    minNoticeHours: true,
                    maxNoticeDays: true,
                    cancelCutoffHours: true,
                    cancelFeeType: true,
                    cancelFeeValue: true,
                    rescheduleCutoffHours: true,
                    holdDurationMinutes: true,
                },
            }),
        ]);

        if (!org) throw new NotFoundException('Organization not found');

        const completedSteps: string[] = [];
        if (org.name && org.country) completedSteps.push('BUSINESS_DETAILS');
        if (org.industry) completedSteps.push('INDUSTRY');
        if (org.timezone && org.currency) completedSteps.push('REGIONAL_SETTINGS');
        if (firstLocation) completedSteps.push('LOCATION');
        if (firstService) completedSteps.push('SERVICE');
        if (firstStaff) completedSteps.push('STAFF');
        if (availabilitiesCount > 0) completedSteps.push('AVAILABILITY');
        if (org.paymentIntent || org.stripeAccountId) completedSteps.push('PAYMENT');
        if (org.brandName || org.primaryColor || org.logoUrl) completedSteps.push('BRANDING');
        if (policy) completedSteps.push('POLICY');
        if (org.bookingEnabled && org.onboardingCompleted) completedSteps.push('PUBLISH');

        const issues: PublishReadinessIssueDto[] = [];
        if (!firstLocation) {
            issues.push({
                code: 'NO_LOCATION',
                step: 'LOCATION',
                stepNumber: 4,
                message: 'At least 1 active location branch is required.',
                blocking: true,
            });
        }
        if (!firstService) {
            issues.push({
                code: 'NO_SERVICE',
                step: 'SERVICE',
                stepNumber: 5,
                message: 'At least 1 active bookable service is required.',
                blocking: true,
            });
        }
        if (!firstStaff) {
            issues.push({
                code: 'NO_STAFF',
                step: 'STAFF',
                stepNumber: 6,
                message: 'At least 1 active staff member profile is required.',
                blocking: true,
            });
        }
        if (availabilitiesCount === 0) {
            issues.push({
                code: 'NO_STAFF_AVAILABILITY',
                step: 'AVAILABILITY',
                stepNumber: 7,
                message: 'Weekly staff availability schedule must be configured.',
                blocking: true,
            });
        }
        if (!policy) {
            issues.push({
                code: 'NO_POLICY',
                step: 'POLICY',
                stepNumber: 10,
                message: 'Booking & cancellation policy guardrails must be configured.',
                blocking: true,
            });
        }
        if (!org.stripeAccountId && org.paymentIntent === 'ONLINE') {
            issues.push({
                code: 'STRIPE_NOT_CONNECTED',
                step: 'PAYMENT',
                stepNumber: 8,
                message: 'Stripe Connect is selected for online payments but not connected yet.',
                blocking: false,
            });
        }

        const readyToPublish = issues.filter((i) => i.blocking).length === 0;

        return {
            currentStep: org.onboardingStep || 1,
            completedSteps,
            readyToPublish,
            issues,
            organization: {
                ...org,
                stripeConnectedAt: org.stripeConnectedAt?.toISOString() || null,
            },
            firstLocation: firstLocation
                ? {
                    ...firstLocation,
                    taxRatePct: firstLocation.taxRatePct ? Number(firstLocation.taxRatePct) : null,
                    operatingHours: firstLocation.operatingHours as any,
                }
                : null,
            firstService: firstService
                ? {
                    ...firstService,
                    bufferAfterMin: firstService.postBufferMin,
                }
                : null,
            firstStaff: firstStaff
                ? {
                    id: firstStaff.id,
                    displayName: firstStaff.displayName,
                    title: firstStaff.title,
                    bio: firstStaff.bio,
                    email: firstStaff.membership.user.email,
                    isOwner: firstStaff.membership.roleCode === 'OWNER',
                    roleCode: firstStaff.membership.roleCode,
                    availabilities: (firstStaff as any).availabilities || [],
                }
                : null,
            policy: policy || null,
            stripe: {
                connected: !!org.stripeAccountId,
                accountId: org.stripeAccountId,
                connectedAt: org.stripeConnectedAt?.toISOString() || null,
                chargesEnabled: org.stripeChargesEnabled ?? false,
                payoutsEnabled: org.stripePayoutsEnabled ?? false,
                detailsSubmitted: org.stripeDetailsSubmitted ?? false,
            },
        };
    }

    async publishOrganization(organizationId: string) {
        const status = await this.getOnboardingStatus(organizationId);

        const blockingIssues = status.issues.filter((i) => i.blocking);
        if (blockingIssues.length > 0) {
            throw new BadRequestException({
                code: 'ONBOARDING_NOT_READY',
                message: 'Cannot publish booking portal until all mandatory setup requirements are fulfilled.',
                issues: blockingIssues,
            });
        }

        const updated = await this.prisma.organization.update({
            where: { id: organizationId },
            data: {
                bookingEnabled: true,
                onboardingCompleted: true,
                onboardingStep: 11,
            },
        });

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const publicUrl = `${baseUrl}/book/${updated.slug}`;

        return {
            success: true,
            publicUrl,
            slug: updated.slug,
            publishedAt: new Date().toISOString(),
        };
    }

    async checkPublishEligibility(organizationId: string) {
        const status = await this.getOnboardingStatus(organizationId);
        return {
            isEligible: status.readyToPublish,
            issues: status.issues.map((i) => i.message),
            details: status.issues,
            summary: {
                hasLocation: !!status.firstLocation,
                hasService: !!status.firstService,
                hasStaff: !!status.firstStaff,
                hasAvailability: status.completedSteps.includes('AVAILABILITY'),
                hasPolicy: !!status.policy,
            },
        };
    }

    async getOrganizationBySlug(slug: string) {
        const org = await this.prisma.organization.findFirst({
            where: { slug, archivedAt: null, isActive: true, bookingEnabled: true },
            select: {
                id: true,
                name: true,
                slug: true,
                brandName: true,
                logoUrl: true,
                faviconUrl: true,
                primaryColor: true,
                accentColor: true,
                timezone: true,
                currency: true,
                defaultLocale: true,
                supportedLocales: true,
                phone: true,
                email: true,
                website: true,
                locations: {
                    where: { archivedAt: null },
                    select: { id: true, name: true, slug: true, timezone: true, address: true, city: true, state: true, postalCode: true, country: true, phone: true, email: true, operatingHours: true, instructions: true, parkingAccess: true, taxRatePct: true },
                },
                services: {
                    where: { archivedAt: null, isActive: true },
                    select: {
                        id: true,
                        name: true,
                        category: true,
                        description: true,
                        imageUrl: true,
                        durationMin: true,
                        preBufferMin: true,
                        postBufferMin: true,
                        priceCents: true,
                        currency: true,
                        depositType: true,
                        depositValue: true,
                        taxBehavior: true,
                        capacity: true,
                        minParticipants: true,
                        maxParticipants: true,
                        preparationInstructions: true,
                    },
                },
                staffProfiles: {
                    where: { archivedAt: null, isActive: true, bookingVisible: true },
                    select: {
                        id: true,
                        displayName: true,
                        title: true,
                        bio: true,
                        avatarUrl: true,
                        calendarColor: true,
                        skills: true,
                        staffLocations: { select: { locationId: true } },
                        staffServices: { select: { serviceId: true, customPriceCents: true, customDurationMin: true } },
                    },
                },
            },
        });

        if (org) {
            const policy = await this.prisma.policyConfig.findFirst({
                where: { organizationId: org.id, locationId: null, serviceId: null },
            });
            return {
                ...org,
                defaultLocationId: org.locations && org.locations[0] ? org.locations[0].id : null,
                policy: policy ? {
                    minNoticeHours: policy.minNoticeHours,
                    maxNoticeDays: policy.maxNoticeDays,
                    cancelCutoffHours: policy.cancelCutoffHours,
                    cancelFeeType: policy.cancelFeeType,
                    cancelFeeValue: policy.cancelFeeValue,
                } : null,
            };
        }

        // Also check if slug is a location-level slug (e.g. manhattan-flagship)
        const loc = await this.prisma.location.findFirst({
            where: { slug, archivedAt: null },
            include: {
                organization: {
                    select: {
                        id: true, name: true, slug: true, brandName: true, logoUrl: true, faviconUrl: true,
                        primaryColor: true, accentColor: true, timezone: true, currency: true, defaultLocale: true,
                        supportedLocales: true, phone: true, email: true, website: true, isActive: true,
                        bookingEnabled: true, archivedAt: true,
                        locations: { where: { archivedAt: null }, select: { id: true, name: true, slug: true, timezone: true, address: true, city: true, state: true, postalCode: true, country: true, phone: true, instructions: true, parkingAccess: true } },
                        services: {
                            where: { archivedAt: null, isActive: true },
                            select: {
                                id: true,
                                name: true,
                                category: true,
                                description: true,
                                imageUrl: true,
                                durationMin: true,
                                preBufferMin: true,
                                postBufferMin: true,
                                priceCents: true,
                                currency: true,
                                depositType: true,
                                depositValue: true,
                                taxBehavior: true,
                                capacity: true,
                                minParticipants: true,
                                maxParticipants: true,
                                preparationInstructions: true,
                            },
                        },
                        staffProfiles: {
                            where: { archivedAt: null, isActive: true, bookingVisible: true },
                            select: {
                                id: true,
                                displayName: true,
                                title: true,
                                bio: true,
                                avatarUrl: true,
                                calendarColor: true,
                                skills: true,
                                staffLocations: { select: { locationId: true } },
                                staffServices: { select: { serviceId: true, customPriceCents: true, customDurationMin: true } },
                            },
                        },
                    },
                },
            },
        });

        if (loc && loc.organization && loc.organization.isActive && loc.organization.bookingEnabled && !loc.organization.archivedAt) {
            const policy = await this.prisma.policyConfig.findFirst({
                where: { organizationId: loc.organization.id, locationId: null, serviceId: null },
            });
            const { isActive: _isActive, bookingEnabled: _bookingEnabled, archivedAt: _archivedAt, ...publicOrganization } = loc.organization;
            return {
                ...publicOrganization,
                defaultLocationId: loc.id,
                defaultLocation: { id: loc.id, name: loc.name, slug: loc.slug, address: loc.address, city: loc.city, state: loc.state },
                policy: policy ? {
                    minNoticeHours: policy.minNoticeHours,
                    maxNoticeDays: policy.maxNoticeDays,
                    cancelCutoffHours: policy.cancelCutoffHours,
                    cancelFeeType: policy.cancelFeeType,
                    cancelFeeValue: policy.cancelFeeValue,
                } : null,
            };
        }

        throw new NotFoundException(`Organization or location with slug "${slug}" not found`);
    }

}
