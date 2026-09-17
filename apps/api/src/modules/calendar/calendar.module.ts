import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { OutboxModule } from "../outbox/outbox.module";
import { GoogleOAuthService } from "./google-oauth.service";
import { CalendarConnectionService } from "./calendar-connection.service";
import { CalendarIntegrationController } from "./calendar-integration.controller";
import { GoogleCalendarWebhookController } from "./google-calendar-webhook.controller";
import { CALENDAR_PROVIDER, GoogleCalendarAdapter } from "@bookpro/server-core";

@Module({
    imports: [DatabaseModule, OutboxModule],
    controllers: [CalendarIntegrationController, GoogleCalendarWebhookController],
    providers: [
        GoogleOAuthService,
        CalendarConnectionService,
        GoogleCalendarAdapter,
        {
            provide: CALENDAR_PROVIDER,
            useClass: GoogleCalendarAdapter,
        },
    ],
    exports: [GoogleOAuthService, CalendarConnectionService, CALENDAR_PROVIDER],
})
export class CalendarModule { }
