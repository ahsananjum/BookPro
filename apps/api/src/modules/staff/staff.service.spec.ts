import { Test, TestingModule } from '@nestjs/testing';
import { StaffService } from './staff.service';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('StaffService Authoritative Unit Suite', () => {
    let service: StaffService;
    let prisma: any;
    let realtime: any;

    const orgId = '00000000-0000-0000-0000-000000000001';
    const staffId = '00000000-0000-0000-0000-000000000010';
    const membershipId = '00000000-0000-0000-0000-000000000020';
    const userId = '00000000-0000-0000-0000-000000000030';
    const locationId = '00000000-0000-0000-0000-000000000040';
    const serviceId = '00000000-0000-0000-0000-000000000050';

    const mockStaffRecord: any = {
        id: staffId,
        organizationId: orgId,
        membershipId,
        displayName: 'Dr. John Doe',
        title: 'Lead Specialist',
        bio: 'Expert practitioner',
        avatarUrl: null,
        skills: ['Specialist'],
        calendarColor: '#8b5cf6',
        bookingVisible: true,
        isActive: true,
        archivedAt: null,
        membership: {
            id: membershipId,
            roleCode: 'STAFF',
            user: { id: userId, email: 'john@example.com', fullName: 'Johnathan Doe' },
        },
        staffLocations: [{ locationId, location: { id: locationId, name: 'Downtown' } }],
        staffServices: [{ serviceId, service: { id: serviceId, name: 'General Consultation' } }],
        availabilities: [],
        breaks: [],
        leaves: [],
    };

    beforeEach(async () => {
        prisma = {
            staffProfile: {
                findMany: jest.fn().mockResolvedValue([mockStaffRecord]),
                findFirst: jest.fn().mockResolvedValue(mockStaffRecord),
                findUnique: jest.fn().mockResolvedValue(mockStaffRecord),
                create: jest.fn().mockResolvedValue(mockStaffRecord),
                update: jest.fn().mockResolvedValue(mockStaffRecord),
            },
            user: {
                findUnique: jest.fn().mockResolvedValue({ id: userId, email: 'john@example.com', fullName: 'Johnathan Doe' }),
                create: jest.fn().mockResolvedValue({ id: userId, email: 'john@example.com', fullName: 'Johnathan Doe' }),
                update: jest.fn().mockResolvedValue({ id: userId, email: 'john@example.com', fullName: 'Johnathan Doe' }),
            },
            membership: {
                findUnique: jest.fn().mockResolvedValue({ id: membershipId, roleCode: 'STAFF' }),
                create: jest.fn().mockResolvedValue({ id: membershipId, roleCode: 'STAFF' }),
                update: jest.fn().mockResolvedValue({ id: membershipId, roleCode: 'MANAGER' }),
            },
            staffLocation: {
                deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
                createMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            staffService: {
                deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
                createMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            staffAvailability: {
                deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
                createMany: jest.fn().mockResolvedValue({ count: 5 }),
            },
            staffBreak: {
                deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
                createMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            staffLeave: {
                findFirst: jest.fn().mockResolvedValue({ id: 'leave-1', organizationId: orgId, staffId }),
                create: jest.fn().mockResolvedValue({ id: 'leave-1', status: 'APPROVED' }),
                deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
        };

        realtime = {
            broadcastEvent: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                StaffService,
                { provide: PrismaService, useValue: prisma },
                { provide: RealtimeService, useValue: realtime },
            ],
        }).compile();

        service = module.get<StaffService>(StaffService);
    });

    it('should query staff members with filters', async () => {
        const staff = await service.getStaffMembers(orgId, {
            activeOnly: true,
            bookingVisibleOnly: true,
            locationId,
            serviceId,
        });

        expect(staff).toBeDefined();
        expect(prisma.staffProfile.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    organizationId: orgId,
                    isActive: true,
                    bookingVisible: true,
                    staffLocations: { some: { locationId } },
                    staffServices: { some: { serviceId } },
                }),
            })
        );
    });

    it('should create a staff member and broadcast realtime event', async () => {
        const result = await service.createStaffMember(orgId, {
            displayName: 'Dr. Jane Smith',
            fullName: 'Jane Smith',
            email: 'jane@example.com',
            roleCode: 'MANAGER',
            title: 'Senior Specialist',
            calendarColor: '#10b981',
            bookingVisible: true,
            skills: ['Laser', 'Consulting'],
            locationIds: [locationId],
            serviceIds: [serviceId],
            serviceOverrides: [{ serviceId, customPriceCents: 15000, customDurationMin: 45 }],
        });

        expect(result).toBeDefined();
        expect(realtime.broadcastEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'staff.updated',
                organizationId: orgId,
            })
        );
    });

    it('should enforce that booking-visible staff must have location and service', async () => {
        await expect(
            service.createStaffMember(orgId, {
                displayName: 'Invisible Staff',
                fullName: 'Invisible Staff',
                email: 'invis@example.com',
                bookingVisible: true,
                locationIds: [],
                serviceIds: [],
            })
        ).rejects.toThrow(BadRequestException);
    });

    it('should update staff member profile, role in membership, and user details', async () => {
        await service.updateStaffMember(orgId, staffId, {
            displayName: 'Dr. John Doe Updated',
            roleCode: 'MANAGER',
            fullName: 'Johnathan Doe Updated',
            calendarColor: '#06b6d4',
            bookingVisible: true,
            skills: ['Advanced'],
            locationIds: [locationId],
            serviceIds: [serviceId],
        });

        expect(prisma.membership.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { roleCode: 'MANAGER' },
            })
        );
        expect(prisma.user.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ fullName: 'Johnathan Doe Updated' }),
            })
        );
        expect(realtime.broadcastEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'staff.updated',
                organizationId: orgId,
            })
        );
    });

    it('should save recurring availability shifts and breaks', async () => {
        await service.setStaffAvailability(orgId, staffId, {
            availabilities: [
                { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', locationId },
                { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', locationId },
            ],
            breaks: [
                { dayOfWeek: 1, startTime: '12:00', endTime: '13:00', label: 'Lunch' },
            ],
        });

        expect(prisma.staffAvailability.createMany).toHaveBeenCalled();
        expect(prisma.staffBreak.createMany).toHaveBeenCalled();
        expect(realtime.broadcastEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'staff.updated',
                organizationId: orgId,
            })
        );
    });

    it('should create and delete staff leaves', async () => {
        const leave = await service.createStaffLeave(orgId, staffId, {
            startDate: '2026-10-01T00:00:00Z',
            endDate: '2026-10-05T23:59:59Z',
            reason: 'Annual Vacation',
        });
        expect(leave).toBeDefined();

        await service.deleteStaffLeave(orgId, staffId, 'leave-1');
        expect(prisma.staffLeave.deleteMany).toHaveBeenCalledWith({
            where: { id: 'leave-1', organizationId: orgId, staffId },
        });
        expect(realtime.broadcastEvent).toHaveBeenCalledTimes(2);
    });

    it('should archive staff member and broadcast update', async () => {
        await service.archiveStaff(orgId, staffId);

        expect(prisma.staffProfile.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ isActive: false }),
            })
        );
        expect(realtime.broadcastEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'staff.updated',
                organizationId: orgId,
            })
        );
    });
});
