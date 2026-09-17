import { Module } from '@nestjs/common';
import { ScheduleGuardService } from './schedule-guard.service';
import { DatabaseModule } from '../database/database.module';

@Module({
    imports: [DatabaseModule],
    providers: [ScheduleGuardService],
    exports: [ScheduleGuardService],
})
export class ConcurrencyModule { }
