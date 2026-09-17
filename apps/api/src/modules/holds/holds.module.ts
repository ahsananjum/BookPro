import { Module } from '@nestjs/common';
import { BookingHoldService } from './booking-hold.service';
import { HoldsController } from './holds.controller';
import { ConcurrencyModule } from '../concurrency/concurrency.module';
import { CommonModule } from '../common/common.module';
import { OutboxModule } from '../outbox/outbox.module';
import { DatabaseModule } from '../database/database.module';
import { PolicyModule } from '../policy/policy.module';
import { PricingModule } from '../pricing/pricing.module';
import { AvailabilityModule } from '../availability/availability.module';
import { OrganizationModule } from '../organization/organization.module';

@Module({
    imports: [
        DatabaseModule,
        ConcurrencyModule,
        CommonModule,
        OutboxModule,
        PolicyModule,
        PricingModule,
        AvailabilityModule,
        OrganizationModule,
    ],
    controllers: [HoldsController],
    providers: [BookingHoldService],
    exports: [BookingHoldService],
})
export class HoldsModule { }
