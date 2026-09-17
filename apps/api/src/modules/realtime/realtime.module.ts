import { Module } from "@nestjs/common";
import { RealtimeController } from "./realtime.controller";
import { RealtimeService } from "./realtime.service";
import { RedisService } from "@bookpro/server-core";

@Module({
    controllers: [RealtimeController],
    providers: [RealtimeService, RedisService],
    exports: [RealtimeService],
})
export class RealtimeModule { }
