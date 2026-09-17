import { Module } from '@nestjs/common';
import { ServiceService } from './service.service';
import { ServiceController } from './service.controller';
import { DatabaseModule } from '../database/database.module';
import { OrganizationModule } from '../organization/organization.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RedisService } from '@bookpro/server-core';

@Module({
    imports: [DatabaseModule, OrganizationModule, RealtimeModule],
    controllers: [ServiceController],
    providers: [ServiceService, RedisService],
    exports: [ServiceService],
})
export class ServiceModule { }
