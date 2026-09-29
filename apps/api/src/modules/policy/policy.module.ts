import { Module } from '@nestjs/common';
import { PolicyService } from './policy.service';
import { PolicyController } from './policy.controller';
import { DatabaseModule } from '../database/database.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
    imports: [DatabaseModule, PaymentsModule],
    controllers: [PolicyController],
    providers: [PolicyService],
    exports: [PolicyService],
})
export class PolicyModule { }
