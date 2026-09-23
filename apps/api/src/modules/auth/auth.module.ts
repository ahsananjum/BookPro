import { Module, Global } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { DatabaseModule } from "../database/database.module";
import { OutboxModule } from "../outbox/outbox.module";

@Global()
@Module({
    imports: [DatabaseModule, OutboxModule],
    controllers: [AuthController],
    providers: [AuthService, AuthGuard],
    exports: [AuthService, AuthGuard],
})
export class AuthModule { }
