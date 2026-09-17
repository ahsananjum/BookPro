import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { CommonModule } from "../common/common.module";
import { PaymentsModule } from "../payments/payments.module";
import { AnalyticsAggregatorService } from "./analytics-aggregator.service";
import { AnalyticsRebuildService } from "./analytics-rebuild.service";
import { ProductAnalyticsService } from "./product-analytics.service";
import { AnalyticsController } from "./analytics.controller";

@Module({
    imports: [DatabaseModule, CommonModule, PaymentsModule],
    controllers: [AnalyticsController],
    providers: [
        AnalyticsAggregatorService,
        AnalyticsRebuildService,
        ProductAnalyticsService,
    ],
    exports: [
        AnalyticsAggregatorService,
        AnalyticsRebuildService,
        ProductAnalyticsService,
    ],
})
export class AnalyticsModule {}
