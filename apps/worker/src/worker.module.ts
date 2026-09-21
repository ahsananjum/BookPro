import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { HealthService } from "./health/health.service";
import { DatabaseModule } from "./database/database.module";
import { PrismaService } from "./database/prisma.service";
import { NotificationService } from "./notifications/notification.service";
import { NotificationTemplateEngineService } from "./notifications/template-engine.service";
import { EMAIL_PROVIDER, BrevoEmailProvider, DisabledEmailProvider } from "./notifications/providers/email.provider";
import { SMS_PROVIDER, TwilioSmsProvider, DisabledSmsProvider } from "./notifications/providers/sms.provider";
import { OutboxDispatcherService } from "./outbox/outbox-dispatcher.service";
import { HoldJanitorService } from "./janitor/hold-janitor.service";
import { WaitlistJanitorService } from "./janitor/waitlist-janitor.service";
import { IdempotencyJanitorService } from "./janitor/idempotency-janitor.service";
import { AppointmentLifecycleJanitorService } from "./janitor/appointment-lifecycle-janitor.service";
import { OptimizerJanitorService } from "./janitor/optimizer-janitor.service";
import { CalendarOutboundSyncService } from "./calendar/calendar-outbound-sync.service";
import { CalendarInboundSyncService } from "./calendar/calendar-inbound-sync.service";
import { CALENDAR_PROVIDER, GoogleCalendarAdapter, RedisService } from "@bookpro/server-core";

@Module({
    imports: [DatabaseModule],
    controllers: [HealthController],
    providers: [
        HealthService,
        NotificationTemplateEngineService,
        BrevoEmailProvider,
        DisabledEmailProvider,
        {
            provide: EMAIL_PROVIDER,
            inject: [BrevoEmailProvider, DisabledEmailProvider],
            useFactory: (brevo: BrevoEmailProvider, disabled: DisabledEmailProvider) => {
                const providerSetting = (process.env.EMAIL_PROVIDER || "brevo").toLowerCase();
                if (providerSetting === "disabled") {
                    return disabled;
                }
                if (providerSetting === "brevo") {
                    if (!process.env.BREVO_API_KEY && process.env.NODE_ENV === "production") {
                        throw new Error("BREVO_API_KEY and BREVO_SENDER_EMAIL are required when EMAIL_PROVIDER=brevo in production");
                    }
                    return brevo;
                }
                return disabled;
            },
        },
        TwilioSmsProvider,
        DisabledSmsProvider,
        {
            provide: SMS_PROVIDER,
            inject: [TwilioSmsProvider, DisabledSmsProvider],
            useFactory: (twilio: TwilioSmsProvider, disabled: DisabledSmsProvider) => {
                const providerSetting = (process.env.SMS_PROVIDER || "disabled").toLowerCase();
                if (providerSetting === "twilio") {
                    if (!process.env.TWILIO_ACCOUNT_SID && process.env.NODE_ENV === "production") {
                        throw new Error("TWILIO credentials are required when SMS_PROVIDER=twilio in production");
                    }
                    return twilio;
                }
                return disabled;
            },
        },
        {
            provide: NotificationService,
            inject: [PrismaService, NotificationTemplateEngineService, EMAIL_PROVIDER, SMS_PROVIDER],
            useFactory: (
                prisma: PrismaService,
                templateEngine: NotificationTemplateEngineService,
                emailProvider: any,
                smsProvider: any,
            ) => new NotificationService(prisma, templateEngine, emailProvider, smsProvider),
        },
        OutboxDispatcherService,
        HoldJanitorService,
        WaitlistJanitorService,
        IdempotencyJanitorService,
        AppointmentLifecycleJanitorService,
        OptimizerJanitorService,
        GoogleCalendarAdapter,
        {
            provide: CALENDAR_PROVIDER,
            useClass: GoogleCalendarAdapter,
        },
        {
            provide: CalendarOutboundSyncService,
            inject: [PrismaService, CALENDAR_PROVIDER],
            useFactory: (prisma: PrismaService, calendarProvider: any) =>
                new CalendarOutboundSyncService(prisma, calendarProvider),
        },
        {
            provide: CalendarInboundSyncService,
            inject: [PrismaService, CALENDAR_PROVIDER, RedisService],
            useFactory: (prisma: PrismaService, calendarProvider: any, redisService: RedisService) =>
                new CalendarInboundSyncService(prisma, calendarProvider, redisService),
        },
        RedisService,
    ],
    exports: [
        HealthService,
        NotificationService,
        OutboxDispatcherService,
        HoldJanitorService,
        WaitlistJanitorService,
        IdempotencyJanitorService,
        AppointmentLifecycleJanitorService,
        OptimizerJanitorService,
        CalendarOutboundSyncService,
        CalendarInboundSyncService,
        RedisService,
    ],
})
export class WorkerModule { }
