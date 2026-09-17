import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { RequestContextMiddleware, RequestLimitsMiddleware, PermissionsGuard, LocationScopeGuard } from "@bookpro/server-core";
import { HealthModule } from "./modules/health/health.module";
import { DatabaseModule } from "./modules/database/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AuthGuard } from "./modules/auth/auth.guard";
import { IdentityModule } from "./modules/identity/identity.module";
import { EntitlementsModule } from "./modules/entitlements/entitlements.module";
import { StorageModule } from "./modules/storage/storage.module";
import { OrganizationModule } from "./modules/organization/organization.module";
import { LocationModule } from "./modules/location/location.module";
import { StaffModule } from "./modules/staff/staff.module";
import { ServiceModule } from "./modules/service/service.module";
import { ResourceModule } from "./modules/resource/resource.module";
import { PolicyModule } from "./modules/policy/policy.module";
import { IntakeFormModule } from "./modules/intake-form/intake-form.module";
import { AvailabilityModule } from "./modules/availability/availability.module";
import { ConcurrencyModule } from "./modules/concurrency/concurrency.module";
import { CommonModule } from "./modules/common/common.module";
import { OutboxModule } from "./modules/outbox/outbox.module";
import { HoldsModule } from "./modules/holds/holds.module";
import { AppointmentsModule } from "./modules/appointments/appointments.module";
import { PricingModule } from "./modules/pricing/pricing.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { RefundsModule } from "./modules/refunds/refunds.module";
import { CrmModule } from "./modules/crm/crm.module";
import { CommissionsModule } from "./modules/commissions/commissions.module";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { SearchModule } from "./modules/search/search.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { WaitlistModule } from "./modules/waitlist/waitlist.module";
import { AIModule } from "./modules/ai/ai.module";
import { OptimizerModule } from "./modules/optimizer/optimizer.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { ReviewModule } from "./modules/reviews/review.module";
import { CheckInModule } from "./modules/check-in/check-in.module";
import { AttendanceModule } from "./modules/attendance/attendance.module";
import { ExportModule } from "./modules/export/export.module";
import { AuditLogModule } from "./modules/audit/audit-log.module";
import { PlatformAdminModule } from "./modules/platform-admin/platform-admin.module";
import { ReferenceModule } from "./modules/reference/reference.module";
import { CustomerPortalModule } from "./modules/customer-portal/customer-portal.module";
import { MarketingModule } from "./modules/marketing/marketing.module";

@Module({
    imports: [
        ReferenceModule,
        ThrottlerModule.forRoot([
            {
                ttl: 60000, // 60 seconds
                limit: 100, // 100 requests per minute default
            },
        ]),
        DatabaseModule,
        HealthModule,
        AuthModule,
        IdentityModule,
        EntitlementsModule,
        StorageModule,
        OrganizationModule,
        LocationModule,
        StaffModule,
        ServiceModule,
        ResourceModule,
        PolicyModule,
        IntakeFormModule,
        AvailabilityModule,
        ConcurrencyModule,
        CommonModule,
        OutboxModule,
        HoldsModule,
        AppointmentsModule,
        PricingModule,
        PaymentsModule,
        RefundsModule,
        CrmModule,
        CommissionsModule,
        SearchModule,
        RealtimeModule,
        JobsModule,
        CalendarModule,
        WaitlistModule,
        AIModule,
        OptimizerModule,
        AnalyticsModule,
        ReviewModule,
        CheckInModule,
        AttendanceModule,
        ExportModule,
        AuditLogModule,
        PlatformAdminModule,
        CustomerPortalModule,
        MarketingModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
        {
            provide: APP_GUARD,
            useClass: AuthGuard,
        },
        {
            provide: APP_GUARD,
            useClass: PermissionsGuard,
        },
        {
            provide: APP_GUARD,
            useClass: LocationScopeGuard,
        },
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(RequestLimitsMiddleware, RequestContextMiddleware).forRoutes("*");
    }
}
