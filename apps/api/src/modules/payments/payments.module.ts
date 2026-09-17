import { Module } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PaymentsController, OrganizationPaymentsController } from "./payments.controller";
import { DatabaseModule } from "../database/database.module";
import { OutboxModule } from "../outbox/outbox.module";
import { ConcurrencyModule } from "../concurrency/concurrency.module";
import { AvailabilityModule } from "../availability/availability.module";
import { OrganizationModule } from "../organization/organization.module";
import { CommonModule } from "../common/common.module";
import { RedisService } from "@bookpro/server-core";
import { StripePaymentAdapter } from "./stripe-payment.adapter";
import { StripeConnectController } from "./stripe-connect.controller";
import { StripeConnectService } from "./stripe-connect.service";
import { StripeConnectAdapter } from "./stripe-connect.adapter";
import { ExchangeRateService } from "./exchange-rate.service";
import { STRIPE_CONNECT_PROVIDER } from "./stripe-connect-provider.interface";
import { PAYMENT_PROVIDER } from "./payment-provider.interface";

@Module({
    imports: [
        DatabaseModule,
        OutboxModule,
        ConcurrencyModule,
        AvailabilityModule,
        OrganizationModule,
        CommonModule,
    ],
    controllers: [PaymentsController, OrganizationPaymentsController, StripeConnectController],
    providers: [
        PaymentsService,
        StripeConnectService,
        ExchangeRateService,
        RedisService,
        { provide: STRIPE_CONNECT_PROVIDER, useClass: StripeConnectAdapter },
        {
            provide: PAYMENT_PROVIDER,
            useClass: StripePaymentAdapter,
        },
    ],
    exports: [PaymentsService, PAYMENT_PROVIDER, ExchangeRateService],
})
export class PaymentsModule { }

