import { randomUUID } from "node:crypto";
import type { ConversationRepository } from "../ports/conversation-repository.js";
import type { JobQueue } from "../ports/job-queue.js";
import type { MessageRepository } from "../ports/message-repository.js";
import type { InboundWebhookPayload } from "../domain/types.js";
import type { SmsProvider } from "../ports/sms-provider.js";

export type HandleInboundMessageDeps = {
  smsProvider: SmsProvider;
  conversationRepository: ConversationRepository;
  messageRepository: MessageRepository;
  jobQueue: JobQueue;
};

export type HandleInboundMessageInput = {
  headers: Record<string, string | string[] | undefined>;
  body: string;
  payload: InboundWebhookPayload;
};

export type HandleInboundMessageResult = {
  duplicate: boolean;
};

export async function handleInboundMessage(
  deps: HandleInboundMessageDeps,
  input: HandleInboundMessageInput,
): Promise<HandleInboundMessageResult> {
  if (!deps.smsProvider.verifySignature(input.headers, input.body)) {
    throw new InvalidWebhookSignatureError();
  }

  const now = new Date();
  const conversation = await deps.conversationRepository.findOrCreate({
    inboundNumber: input.payload.inboundNumber,
    userNumber: input.payload.userNumber,
    lastMessageAt: now,
  });

  const correlationId = randomUUID();
  const { message, inserted } = await deps.messageRepository.insertInbound({
    conversationId: conversation.id,
    payload: input.payload,
    correlationId,
    provider: deps.smsProvider.name,
  });

  if (!inserted) {
    return { duplicate: true };
  }

  await deps.jobQueue.enqueueAfterCommit({
    messageId: message.id,
    conversationId: conversation.id,
    correlationId,
    providerMessageSid: input.payload.providerMessageSid,
  });

  return { duplicate: false };
}

export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super("Invalid webhook signature");
    this.name = "InvalidWebhookSignatureError";
  }
}
