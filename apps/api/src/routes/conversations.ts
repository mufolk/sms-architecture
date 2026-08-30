import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../deps.js";
import { isUuid } from "../ids.js";

export async function registerConversationRoutes(
  app: FastifyInstance,
  deps: AppDeps,
): Promise<void> {
  app.get("/conversations", async (_request, reply) => {
    const conversations = await deps.conversationRepository.listAll();
    return reply.status(200).send({
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        inboundNumber: conversation.inboundNumber,
        userNumber: conversation.userNumber,
        lastMessageAt: conversation.lastMessageAt.toISOString(),
        needsAttention: conversation.needsAttention,
        createdAt: conversation.createdAt.toISOString(),
      })),
    });
  });

  app.get<{ Params: { id: string } }>("/conversations/:id/messages", async (request, reply) => {
    if (!isUuid(request.params.id)) {
      return reply.status(404).send({ error: "conversation not found" });
    }

    const conversation = await deps.conversationRepository.findById(request.params.id);
    if (!conversation) {
      return reply.status(404).send({ error: "conversation not found" });
    }

    const messages = await deps.messageRepository.listByConversation(conversation.id);
    return reply.status(200).send({
      messages: messages.map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
        direction: message.direction,
        status: message.status,
        body: message.body,
        provider: message.provider,
        providerMessageSid: message.providerMessageSid,
        correlationId: message.correlationId,
        inReplyTo: message.inReplyTo,
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt.toISOString(),
      })),
    });
  });
}
