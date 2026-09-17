import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ConcurrencyModule } from "../concurrency/concurrency.module";
import { OutboxModule } from "../outbox/outbox.module";
import { PolicyModule } from "../policy/policy.module";
import { PricingModule } from "../pricing/pricing.module";
import { PaymentsModule } from "../payments/payments.module";
import { AvailabilityModule } from "../availability/availability.module";
import { WaitlistEntryService } from "./waitlist-entry.service";
import { WaitlistOfferService } from "./waitlist-offer.service";
import { WaitlistAcceptanceService } from "./waitlist-acceptance.service";
import { WaitlistCustomerController } from "./waitlist-customer.controller";
import { WaitlistStaffController } from "./waitlist-staff.controller";
import { CommonModule } from "../common/common.module";
import { OrganizationModule } from "../organization/organization.module";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
    imports: [
        DatabaseModule,
        ConcurrencyModule,
        OutboxModule,
        PolicyModule,
        PricingModule,
        PaymentsModule,
        AvailabilityModule,
        CommonModule,
        OrganizationModule,
        RealtimeModule,
    ],
    controllers: [WaitlistCustomerController, WaitlistStaffController],
    providers: [
        WaitlistEntryService,
        WaitlistOfferService,
        WaitlistAcceptanceService,
    ],
    exports: [
        WaitlistEntryService,
        WaitlistOfferService,
        WaitlistAcceptanceService,
    ],
})
export class WaitlistModule { }
