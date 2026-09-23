import { Module } from "@nestjs/common";
import { MembershipService } from "./membership.service";
import { MembershipController } from "./membership.controller";
import { OutboxModule } from "../outbox/outbox.module";

@Module({
    imports: [OutboxModule],
    controllers: [MembershipController],
    providers: [MembershipService],
    exports: [MembershipService],
})
export class IdentityModule { }
