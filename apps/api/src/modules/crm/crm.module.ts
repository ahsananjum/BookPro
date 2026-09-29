import { Module } from "@nestjs/common";
import { CrmService } from "./crm.service";
import { CrmController } from "./crm.controller";
import { DatabaseModule } from "../database/database.module";
import { CustomerPortalModule } from "../customer-portal/customer-portal.module";
import { PaymentsModule } from "../payments/payments.module";

@Module({
    imports: [DatabaseModule, CustomerPortalModule, PaymentsModule],
    controllers: [CrmController],
    providers: [CrmService],
    exports: [CrmService],
})
export class CrmModule { }
