import { Module } from '@nestjs/common';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';
import { DatabaseModule } from '../database/database.module';
import { OrganizationModule } from '../organization/organization.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RedisService } from '@bookpro/server-core';

@Module({
    imports: [DatabaseModule, OrganizationModule, RealtimeModule],
    controllers: [LocationController],
    providers: [LocationService, RedisService],
    exports: [LocationService],
})
export class LocationModule { }
