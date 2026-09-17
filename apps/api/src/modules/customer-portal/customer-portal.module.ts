import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { CustomerPortalController } from "./customer-portal.controller";
import { CustomerPortalService } from "./customer-portal.service";

@Module({
    imports: [DatabaseModule],
    controllers: [CustomerPortalController],
    providers: [CustomerPortalService],
    exports: [CustomerPortalService],
})
export class CustomerPortalModule {}
