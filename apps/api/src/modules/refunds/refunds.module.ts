import { Module } from "@nestjs/common";
import { RefundsService } from "./refunds.service";
import { RefundsController } from "./refunds.controller";
import { DatabaseModule } from "../database/database.module";
import { OutboxModule } from "../outbox/outbox.module";
import { PaymentsModule } from "../payments/payments.module";
import { CommonModule } from "../common/common.module";

@Module({
    imports: [DatabaseModule, OutboxModule, PaymentsModule, CommonModule],
    controllers: [RefundsController],
    providers: [RefundsService],
    exports: [RefundsService],
})
export class RefundsModule { }
