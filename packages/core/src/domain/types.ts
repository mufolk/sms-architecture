export type ConversationId = string;
export type MessageId = string;

export type MessageDirection = "inbound" | "outbound";

export type InboundStatus = "received" | "processing" | "processed" | "failed";
export type OutboundStatus = "queued" | "sent" | "delivered" | "undelivered" | "failed";
export type MessageStatus = InboundStatus | OutboundStatus;

export type Conversation = {
  id: ConversationId;
  inboundNumber: string;
  userNumber: string;
  lastMessageAt: Date;
  needsAttention: boolean;
  createdAt: Date;
};

export type Message = {
  id: MessageId;
  conversationId: ConversationId;
  direction: MessageDirection;
  status: MessageStatus;
  body: string;
  provider: string;
  providerMessageSid: string;
  correlationId: string;
  inReplyTo: MessageId | null;
  errorCode: string | null;
  attempts: number;
  rawPayload: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type InboundWebhookPayload = {
  providerMessageSid: string;
  userNumber: string;
  inboundNumber: string;
  body: string;
  rawPayload: Record<string, string>;
};

export type ProcessJobPayload = {
  messageId: MessageId;
  conversationId: ConversationId;
  correlationId: string;
  providerMessageSid: string;
};

export type ReplyDraft = {
  body: string;
};
