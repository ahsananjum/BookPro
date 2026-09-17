import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { CommonModule } from "../common/common.module";
import { ReviewService } from "./review.service";
import { ReviewController } from "./review.controller";

@Module({
    imports: [DatabaseModule, CommonModule],
    controllers: [ReviewController],
    providers: [ReviewService],
    exports: [ReviewService],
})
export class ReviewModule {}
