import { Module, forwardRef } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { RecurrenceSeriesService } from './recurrence-series.service';
import { AppointmentsController } from './appointments.controller';
import { ConcurrencyModule } from '../concurrency/concurrency.module';
import { CommonModule } from '../common/common.module';
import { OutboxModule } from '../outbox/outbox.module';
import { DatabaseModule } from '../database/database.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { PolicyModule } from '../policy/policy.module';
import { RefundsModule } from '../refunds/refunds.module';
import { AvailabilityModule } from '../availability/availability.module';
import { OrganizationModule } from '../organization/organization.module';
import { PaymentsModule } from '../payments/payments.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { OptimizerModule } from '../optimizer/optimizer.module';
import { RedisService } from '@bookpro/server-core';

@Module({
    imports: [
        DatabaseModule,
        ConcurrencyModule,
        CommonModule,
        OutboxModule,
        CommissionsModule,
        PolicyModule,
        RefundsModule,
        AvailabilityModule,
        OrganizationModule,
        PaymentsModule,
        RealtimeModule,
        forwardRef(() => OptimizerModule),
    ],
    controllers: [AppointmentsController],
    providers: [AppointmentService, RecurrenceSeriesService, RedisService],
    exports: [AppointmentService, RecurrenceSeriesService],
})
export class AppointmentsModule { }
