import { Module } from '@nestjs/common';
import { IntakeFormService } from './intake-form.service';
import { IntakeFormController } from './intake-form.controller';
import { DatabaseModule } from '../database/database.module';
import { OrganizationModule } from '../organization/organization.module';

@Module({
    imports: [DatabaseModule, OrganizationModule],
    controllers: [IntakeFormController],
    providers: [IntakeFormService],
    exports: [IntakeFormService],
})
export class IntakeFormModule { }
