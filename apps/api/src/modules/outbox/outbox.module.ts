import { Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { DatabaseModule } from '../database/database.module';

@Module({
    imports: [DatabaseModule],
    providers: [OutboxService],
    exports: [OutboxService],
})
export class OutboxModule { }
