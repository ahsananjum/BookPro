import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { SystemHealthIndicator } from "@bookpro/observability";
import { HealthController } from "./health.controller";

@Module({
    imports: [TerminusModule],
    controllers: [HealthController],
    providers: [SystemHealthIndicator],
})
export class HealthModule { }
