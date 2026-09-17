import { Module, forwardRef } from "@nestjs/common";
import { RedisService } from "@bookpro/server-core";
import { AIController } from "./ai.controller";
import { AIConversationService } from "./ai-conversation.service";
import { AIToolRegistryService } from "./ai-tool-registry.service";
import { AI_PROVIDER } from "./ai-provider.interface";
import { GeminiAIAdapter } from "./gemini-ai.adapter";
import { ServiceModule } from "../service/service.module";
import { AvailabilityModule } from "../availability/availability.module";
import { AppointmentsModule } from "../appointments/appointments.module";
import { HoldsModule } from "../holds/holds.module";
import { PricingModule } from "../pricing/pricing.module";
import { PolicyModule } from "../policy/policy.module";
import { WaitlistModule } from "../waitlist/waitlist.module";
import { PaymentsModule } from "../payments/payments.module";
import { LocationModule } from "../location/location.module";
import { StaffModule } from "../staff/staff.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { OrganizationModule } from "../organization/organization.module";
import { CrmModule } from "../crm/crm.module";
import { MarketingModule } from "../marketing/marketing.module";
import { CommissionsModule } from "../commissions/commissions.module";
import { OptimizerModule } from "../optimizer/optimizer.module";

@Module({
    imports: [
        ServiceModule,
        AvailabilityModule,
        forwardRef(() => AppointmentsModule),
        HoldsModule,
        PricingModule,
        PolicyModule,
        WaitlistModule,
        PaymentsModule,
        LocationModule,
        StaffModule,
        EntitlementsModule,
        OrganizationModule,
        CrmModule,
        MarketingModule,
        CommissionsModule,
        forwardRef(() => OptimizerModule),
    ],
    controllers: [AIController],
    providers: [AIConversationService, AIToolRegistryService, GeminiAIAdapter, RedisService, { provide: AI_PROVIDER, useExisting: GeminiAIAdapter }],
    exports: [AIConversationService, AIToolRegistryService, AI_PROVIDER, GeminiAIAdapter],
})
export class AIModule {}
