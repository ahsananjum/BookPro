import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { DatabaseModule } from '../database/database.module';
import { OrganizationModule } from '../organization/organization.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RedisService } from '@bookpro/server-core';

@Module({
    imports: [DatabaseModule, OrganizationModule, RealtimeModule],
    controllers: [StaffController],
    providers: [StaffService, RedisService],
    exports: [StaffService],
})
export class StaffModule { }
