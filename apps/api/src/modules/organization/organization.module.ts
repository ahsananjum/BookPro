import { Module } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { DashboardOverviewService } from './dashboard-overview.service';
import { OrganizationController } from './organization.controller';
import { DatabaseModule } from '../database/database.module';
import { ExchangeRateService } from '../payments/exchange-rate.service';
import { RedisService } from '@bookpro/server-core';

@Module({
    imports: [DatabaseModule],
    controllers: [OrganizationController],
    providers: [OrganizationService, DashboardOverviewService, ExchangeRateService, RedisService],
    exports: [OrganizationService, DashboardOverviewService, ExchangeRateService],
})
export class OrganizationModule { }
