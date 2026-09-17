import { OrganizationService } from './organization.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('OrganizationService Onboarding & Publishing', () => {
    let service: OrganizationService;
    let mockPrisma: any;
    const orgId = '00000000-0000-0000-0000-000000000001';

    beforeEach(() => {
        mockPrisma = {
            organization: {
                findUnique: jest.fn(),
                findFirst: jest.fn(),
                update: jest.fn(),
            },
            location: {
                findFirst: jest.fn(),
                count: jest.fn(),
            },
            service: {
                findFirst: jest.fn(),
                count: jest.fn(),
            },
            staffProfile: {
                findFirst: jest.fn(),
                count: jest.fn(),
            },
            staffAvailability: {
                count: jest.fn(),
            },
            policyConfig: {
                findFirst: jest.fn(),
                count: jest.fn(),
            },
        };
        service = new OrganizationService(mockPrisma);
    });

    describe('getOnboardingStatus', () => {
        it('should return incomplete status with blocking issues when entities are missing', async () => {
            mockPrisma.organization.findUnique.mockResolvedValue({
                id: orgId,
                name: 'Test Salon',
                slug: 'test-salon',
                timezone: 'UTC',
                currency: 'USD',
                country: 'US',
                onboardingStep: 3,
                onboardingCompleted: false,
                bookingEnabled: false,
                stripeAccountId: null,
            });
            mockPrisma.location.findFirst.mockResolvedValue(null);
            mockPrisma.service.findFirst.mockResolvedValue(null);
            mockPrisma.staffProfile.findFirst.mockResolvedValue(null);
            mockPrisma.staffAvailability.count.mockResolvedValue(0);
            mockPrisma.policyConfig.findFirst.mockResolvedValue(null);

            const status = await service.getOnboardingStatus(orgId);

            expect(status.readyToPublish).toBe(false);
            expect(status.issues.some((i) => i.code === 'NO_LOCATION')).toBe(true);
            expect(status.issues.some((i) => i.code === 'NO_SERVICE')).toBe(true);
            expect(status.issues.some((i) => i.code === 'NO_STAFF')).toBe(true);
            expect(status.issues.some((i) => i.code === 'NO_STAFF_AVAILABILITY')).toBe(true);
            expect(status.issues.some((i) => i.code === 'NO_POLICY')).toBe(true);
        });

        it('should return readyToPublish = true when all prerequisites are fulfilled', async () => {
            mockPrisma.organization.findUnique.mockResolvedValue({
                id: orgId,
                name: 'Test Salon',
                slug: 'test-salon',
                timezone: 'Asia/Karachi',
                currency: 'PKR',
                country: 'PK',
                industry: 'Beauty & Hair Salon',
                brandName: 'Test Salon',
                primaryColor: '#0284c7',
                onboardingStep: 10,
                onboardingCompleted: false,
                bookingEnabled: false,
                paymentIntent: 'IN_PERSON',
                stripeAccountId: null,
            });
            mockPrisma.location.findFirst.mockResolvedValue({
                id: 'loc-1',
                name: 'Main Branch',
                slug: 'main-branch',
                timezone: 'Asia/Karachi',
                taxRatePct: 5,
            });
            mockPrisma.service.findFirst.mockResolvedValue({
                id: 'svc-1',
                name: 'Signature Consultation',
                durationMin: 45,
                priceCents: 3500,
                currency: 'PKR',
                depositType: 'NONE',
            });
            mockPrisma.staffProfile.findFirst.mockResolvedValue({
                id: 'stf-1',
                displayName: 'Master Stylist',
                title: 'Director',
                membership: { user: { email: 'stylist@salon.com', fullName: 'Master Stylist' } },
            });
            mockPrisma.staffAvailability.count.mockResolvedValue(5);
            mockPrisma.policyConfig.findFirst.mockResolvedValue({
                minNoticeHours: 24,
                maxNoticeDays: 60,
                cancelCutoffHours: 24,
                cancelFeeType: 'NONE',
                cancelFeeValue: 0,
                rescheduleCutoffHours: 12,
                holdDurationMinutes: 10,
            });

            const status = await service.getOnboardingStatus(orgId);

            expect(status.readyToPublish).toBe(true);
            expect(status.issues.filter((i) => i.blocking).length).toBe(0);
            expect(status.completedSteps).toContain('LOCATION');
            expect(status.completedSteps).toContain('SERVICE');
            expect(status.completedSteps).toContain('STAFF');
            expect(status.completedSteps).toContain('AVAILABILITY');
            expect(status.completedSteps).toContain('POLICY');
        });
    });

    describe('publishOrganization', () => {
        it('should throw BadRequestException if prerequisites are incomplete', async () => {
            mockPrisma.organization.findUnique.mockResolvedValue({
                id: orgId,
                name: 'Test Salon',
                slug: 'test-salon',
                timezone: 'UTC',
                currency: 'USD',
                country: 'US',
            });
            mockPrisma.location.findFirst.mockResolvedValue(null);
            mockPrisma.service.findFirst.mockResolvedValue(null);
            mockPrisma.staffProfile.findFirst.mockResolvedValue(null);
            mockPrisma.staffAvailability.count.mockResolvedValue(0);
            mockPrisma.policyConfig.findFirst.mockResolvedValue(null);

            await expect(service.publishOrganization(orgId)).rejects.toThrow(BadRequestException);
        });

        it('should enable booking and return live public URL on successful publish', async () => {
            mockPrisma.organization.findUnique.mockResolvedValue({
                id: orgId,
                name: 'Test Salon',
                slug: 'test-salon',
                timezone: 'UTC',
                currency: 'USD',
                country: 'US',
                onboardingStep: 10,
                onboardingCompleted: false,
                bookingEnabled: false,
                stripeAccountId: null,
            });
            mockPrisma.location.findFirst.mockResolvedValue({ id: 'loc-1', name: 'Main Branch' });
            mockPrisma.service.findFirst.mockResolvedValue({ id: 'svc-1', name: 'Service', durationMin: 30, priceCents: 1000 });
            mockPrisma.staffProfile.findFirst.mockResolvedValue({
                id: 'stf-1',
                displayName: 'Provider',
                membership: { user: { email: 'p@test.com' } },
            });
            mockPrisma.staffAvailability.count.mockResolvedValue(5);
            mockPrisma.policyConfig.findFirst.mockResolvedValue({ minNoticeHours: 24 });
            mockPrisma.organization.update.mockResolvedValue({
                id: orgId,
                slug: 'test-salon',
                bookingEnabled: true,
                onboardingCompleted: true,
                onboardingStep: 11,
            });

            const result = await service.publishOrganization(orgId);

            expect(result.success).toBe(true);
            expect(result.slug).toBe('test-salon');
            expect(result.publicUrl).toContain('/book/test-salon');
            expect(mockPrisma.organization.update).toHaveBeenCalledWith({
                where: { id: orgId },
                data: {
                    bookingEnabled: true,
                    onboardingCompleted: true,
                    onboardingStep: 11,
                },
            });
        });
    });
});
