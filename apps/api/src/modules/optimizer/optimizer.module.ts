import { Module, forwardRef } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AvailabilityModule } from "../availability/availability.module";
import { WaitlistModule } from "../waitlist/waitlist.module";
import { AIModule } from "../ai/ai.module";
import { CommonModule } from "../common/common.module";
import { DeterministicScoringService } from "./deterministic-scoring.service";
import { AIOptimizerExplanationService } from "./ai-optimizer-explanation.service";
import { GapDetectionService } from "./gap-detection.service";
import { ScheduleInsightService } from "./schedule-insight.service";
import { NoShowSignalService } from "./no-show-signal.service";
import { RecoveredRevenueService } from "./recovered-revenue.service";
import { OptimizerController } from "./optimizer.controller";

@Module({
    imports: [
        DatabaseModule,
        AvailabilityModule,
        WaitlistModule,
        forwardRef(() => AIModule),
        CommonModule,
    ],
    controllers: [OptimizerController],
    providers: [
        DeterministicScoringService,
        AIOptimizerExplanationService,
        GapDetectionService,
        ScheduleInsightService,
        NoShowSignalService,
        RecoveredRevenueService,
    ],
    exports: [
        DeterministicScoringService,
        AIOptimizerExplanationService,
        GapDetectionService,
        ScheduleInsightService,
        NoShowSignalService,
        RecoveredRevenueService,
    ],
})
export class OptimizerModule {}
