import { Module } from "@nestjs/common";
import { AvailabilityController } from "./availability.controller";
import { AvailabilityService } from "./availability.service";
import { AvailabilityValidatorService } from "./availability-validator.service";
import { AuthoritativeAvailabilityValidatorService } from "./authoritative-availability-validator.service";
import { AvailabilityQueryValidator } from "./availability-query-validator";
import { EligibleStaffResolver } from "./eligible-staff-resolver";
import { EffectiveOperatingWindowBuilder } from "./effective-operating-window-builder";
import { StaffAvailabilityBuilder } from "./staff-availability-builder";
import { BusyIntervalRepository } from "./busy-interval-repository";
import { DurationCalculator } from "./duration-calculator";
import { ResourceAvailabilityService } from "./resource-availability.service";
import { CapacityAvailabilityService } from "./capacity-availability.service";
import { PolicyResolver } from "./policy-resolver";
import { SlotGenerator } from "./slot-generator";
import { DatabaseModule } from "../database/database.module";
import { ConcurrencyModule } from "../concurrency/concurrency.module";
import { OutboxModule } from "../outbox/outbox.module";
import { RedisService } from "@bookpro/server-core";
import { OrganizationModule } from "../organization/organization.module";
import { AuthModule } from "../auth/auth.module";

@Module({
    imports: [DatabaseModule, OrganizationModule, AuthModule, ConcurrencyModule, OutboxModule],
    controllers: [AvailabilityController],
    providers: [
        AvailabilityService,
        AvailabilityValidatorService,
        AuthoritativeAvailabilityValidatorService,
        AvailabilityQueryValidator,
        EligibleStaffResolver,
        EffectiveOperatingWindowBuilder,
        StaffAvailabilityBuilder,
        BusyIntervalRepository,
        DurationCalculator,
        ResourceAvailabilityService,
        CapacityAvailabilityService,
        PolicyResolver,
        SlotGenerator,
        RedisService,
    ],
    exports: [
        AvailabilityService,
        AvailabilityValidatorService,
        AuthoritativeAvailabilityValidatorService,
        BusyIntervalRepository,
        PolicyResolver,
    ],
})
export class AvailabilityModule { }
