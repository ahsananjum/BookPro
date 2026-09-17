import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { MarketingController } from "./marketing.controller";
import { MarketingService } from "./marketing.service";
@Module({
    imports: [DatabaseModule],
    controllers: [MarketingController],
    providers: [MarketingService],
    exports: [MarketingService],
})
export class MarketingModule {}
