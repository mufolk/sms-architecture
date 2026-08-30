import type { MessageRepository } from "../ports/message-repository.js";
import type { MessageProcessor } from "../ports/message-processor.js";
import type { Conversation, Message, ProcessJobPayload } from "../domain/types.js";
import type { SmsProvider } from "../ports/sms-provider.js";
import type { ConversationRepository } from "../ports/conversation-repository.js";

export type ProcessInboundMessageDeps = {
  smsProvider: SmsProvider;
  conversationRepository: ConversationRepository;
  messageRepository: MessageRepository;
  messageProcessor: MessageProcessor;
};

export async function processInboundMessage(
  deps: ProcessInboundMessageDeps,
  job: ProcessJobPayload,
): Promise<void> {
  const inbound = await deps.messageRepository.findById(job.messageId);
  if (!inbound || inbound.direction !== "inbound") {
    return;
  }

  if (inbound.status === "processed" || inbound.status === "failed") {
    return;
  }

  const conversation = await deps.conversationRepository.findById(job.conversationId);
  if (!conversation) {
    return;
  }

  const history = await deps.messageRepository.listByConversation(job.conversationId);
  const existingOutbound = history.find(
    (message) => message.direction === "outbound" && message.inReplyTo === inbound.id,
  );

  if (existingOutbound) {
    await resumeExistingOutbound(deps, conversation, inbound, existingOutbound);
    return;
  }

  if (inbound.status === "received") {
    await deps.messageRepository.updateStatus(inbound.id, "processing");
  } else if (inbound.status !== "processing") {
    return;
  }

  const reply = await deps.messageProcessor.process(inbound, history);

  const outbound = await deps.messageRepository.insertOutbound({
    conversationId: job.conversationId,
    inReplyTo: inbound.id,
    body: reply.body,
    provider: deps.smsProvider.name,
    correlationId: job.correlationId,
  });

  await sendOutboundAndMarkProcessed(deps, conversation, inbound, outbound, reply.body);
}

async function resumeExistingOutbound(
  deps: ProcessInboundMessageDeps,
  conversation: Conversation,
  inbound: Message,
  outbound: Message,
): Promise<void> {
  if (outbound.status === "queued") {
    await sendOutboundAndMarkProcessed(deps, conversation, inbound, outbound, outbound.body);
    return;
  }

  if (outbound.status === "sent" || outbound.status === "delivered") {
    await deps.messageRepository.updateStatus(inbound.id, "processed");
  }
}

async function sendOutboundAndMarkProcessed(
  deps: ProcessInboundMessageDeps,
  conversation: Conversation,
  inbound: Message,
  outbound: Message,
  body: string,
): Promise<void> {
  const sendResult = await deps.smsProvider.send({
    to: conversation.userNumber,
    from: conversation.inboundNumber,
    body,
    idempotencyKey: outbound.id,
  });

  await deps.messageRepository.markOutboundSent(outbound.id, sendResult.providerMessageSid);
  await deps.messageRepository.updateStatus(inbound.id, "processed");
}
