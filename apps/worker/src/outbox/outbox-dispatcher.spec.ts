import { OutboxDispatcherService } from "./outbox-dispatcher.service";

describe("OutboxDispatcherService Leased Claiming & Idempotency Suite", () => {
    let mockPrisma: any;
    let mockNotificationService: any;
    let mockCalendarOutboundSync: any;
    let mockCalendarInboundSync: any;
    let mockRedisService: any;

    beforeEach(() => {
        mockNotificationService = {
            handleOutboxEvent: jest.fn().mockResolvedValue(true),
            pollAndProcessQueuedNotifications: jest.fn().mockResolvedValue(0),
        };

        mockCalendarOutboundSync = {
            handleAppointmentConfirmed: jest.fn().mockResolvedValue(true),
            handleAppointmentRescheduled: jest.fn().mockResolvedValue(true),
            handleAppointmentCancelled: jest.fn().mockResolvedValue(true),
        };

        mockCalendarInboundSync = {
            syncConnection: jest.fn().mockResolvedValue(true),
        };

        mockRedisService = {
            getIsConnected: jest.fn().mockReturnValue(true),
            publish: jest.fn().mockResolvedValue(1),
            delPrefix: jest.fn().mockResolvedValue(1),
        };

        mockPrisma = {
            $transaction: jest.fn(),
            $queryRaw: jest.fn(),
            $executeRaw: jest.fn().mockResolvedValue(1),
            outboxEvent: {
                update: jest.fn().mockResolvedValue({ id: "event-1" }),
            },
        };
    });

    it("should atomically claim pending and expired-lease events using leased claims with worker ID", async () => {
        const testEvent = {
            id: "event-1",
            organizationId: "org-1",
            aggregateType: "Appointment",
            aggregateId: "appt-1",
            eventType: "appointment.confirmed",
            eventVersion: 1,
            payload: JSON.stringify({ appointmentId: "appt-1", organizationId: "org-1" }),
            attempts: 1,
            completed_handlers: [],
        };

        mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
            const tx = {
                $queryRaw: jest.fn().mockResolvedValue([testEvent]),
            };
            return callback(tx);
        });

        const dispatcher = new OutboxDispatcherService(
            mockPrisma,
            mockNotificationService,
            mockCalendarOutboundSync,
            mockCalendarInboundSync,
            mockRedisService
        );

        const claimedCount = await dispatcher.pollAndDispatch();

        expect(claimedCount).toBe(1);
        expect(mockNotificationService.handleOutboxEvent).toHaveBeenCalledWith(
            "appointment.confirmed",
            expect.objectContaining({ appointmentId: "appt-1" }),
            "event-1",
            "org-1"
        );
        expect(mockCalendarOutboundSync.handleAppointmentConfirmed).toHaveBeenCalled();
        expect(mockRedisService.publish).toHaveBeenCalled();
        expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
            where: { id: "event-1" },
            data: expect.objectContaining({ status: "PROCESSED" }),
        });
    });

    it("should skip already completed handlers when processing an event (Per-Handler Idempotency)", async () => {
        const eventWithCompletedNotification = {
            id: "event-2",
            organizationId: "org-1",
            aggregateType: "Appointment",
            aggregateId: "appt-2",
            eventType: "appointment.confirmed",
            eventVersion: 1,
            payload: { appointmentId: "appt-2", organizationId: "org-1" },
            attempts: 2,
            completed_handlers: ["notifications"], // notifications already succeeded on previous attempt!
        };

        const dispatcher = new OutboxDispatcherService(
            mockPrisma,
            mockNotificationService,
            mockCalendarOutboundSync,
            mockCalendarInboundSync,
            mockRedisService
        );

        const result = await dispatcher.processSingleEvent(eventWithCompletedNotification);

        expect(result).toBe(true);
        // Notification service must NOT be called again
        expect(mockNotificationService.handleOutboxEvent).not.toHaveBeenCalled();
        // Subsequent handlers must be called
        expect(mockCalendarOutboundSync.handleAppointmentConfirmed).toHaveBeenCalled();
        expect(mockRedisService.publish).toHaveBeenCalled();
        expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
            where: { id: "event-2" },
            data: expect.objectContaining({ status: "PROCESSED" }),
        });
    });

    it("should mark event DEAD_LETTER on terminal non-retryable errors or 5 attempts", async () => {
        mockNotificationService.handleOutboxEvent.mockRejectedValue(new Error("Invalid customer identifier format"));

        const failedEvent = {
            id: "event-3",
            organizationId: "org-1",
            aggregateType: "Appointment",
            aggregateId: "appt-3",
            eventType: "appointment.confirmed",
            eventVersion: 1,
            payload: { appointmentId: "appt-3" },
            attempts: 5, // Maximum attempts reached!
            completed_handlers: [],
        };

        const dispatcher = new OutboxDispatcherService(
            mockPrisma,
            mockNotificationService,
            mockCalendarOutboundSync,
            mockCalendarInboundSync,
            mockRedisService
        );

        const success = await dispatcher.processSingleEvent(failedEvent);

        expect(success).toBe(false);
        expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
            where: { id: "event-3" },
            data: expect.objectContaining({
                status: "DEAD_LETTER",
            }),
        });
    });
});
