import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ConfirmAIProposalDto, CreateAIConversationDto, PermissionKey, RequestContext, SendAIMessageDto } from "@bookpro/contracts";
import { ReqContext, RequirePermissions } from "@bookpro/server-core";
import { confirmAIProposalSchema, createAIConversationSchema, sendAIMessageSchema } from "@bookpro/validation";
import { AIConversationService } from "./ai-conversation.service";

@Controller("ai")
@RequirePermissions(PermissionKey.AI_EXECUTE)
export class AIController {
    constructor(private readonly conversations: AIConversationService) {}

    @Post("conversations")
    create(@Body() body: CreateAIConversationDto, @ReqContext() ctx: RequestContext) {
        const input = createAIConversationSchema.parse(body || {});
        return this.conversations.createConversation(ctx, input.channel, input.scope);
    }

    @Get("conversations/:id")
    get(@Param("id") id: string, @ReqContext() ctx: RequestContext) {
        return this.conversations.getConversation(id, ctx);
    }

    @Post("conversations/:id/messages")
    message(@Param("id") id: string, @Body() body: SendAIMessageDto, @ReqContext() ctx: RequestContext) {
        const input = sendAIMessageSchema.parse(body);
        return this.conversations.sendMessage(id, input.message, input.idempotencyKey, ctx);
    }

    @Post("conversations/:conversationId/proposals/:proposalId/confirm")
    confirm(
        @Param("conversationId") conversationId: string,
        @Param("proposalId") proposalId: string,
        @Body() body: ConfirmAIProposalDto,
        @ReqContext() ctx: RequestContext,
    ) {
        const input = confirmAIProposalSchema.parse(body);
        return this.conversations.confirmProposal(conversationId, proposalId, input.confirmationToken, input.idempotencyKey, ctx);
    }
}
