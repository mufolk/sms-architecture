import type {
  ConversationId,
  InboundWebhookPayload,
  Message,
  MessageId,
  MessageStatus,
} from "../domain/types.js";

export type InsertInboundParams = {
  conversationId: ConversationId;
  payload: InboundWebhookPayload;
  correlationId: string;
  provider: string;
};

export type InsertInboundResult = {
  message: Message;
  inserted: boolean;
};

export type InsertOutboundParams = {
  conversationId: ConversationId;
  inReplyTo: MessageId;
  body: string;
  provider: string;
  correlationId: string;
};

export type TransitionStatusParams = {
  messageId: MessageId;
  toStatus: MessageStatus;
  reason: string;
  correlationId: string;
  errorCode?: string | null;
  providerMessageSid?: string;
};

export type MessageRepository = {
  insertInbound(params: InsertInboundParams): Promise<InsertInboundResult>;
  insertOutbound(params: InsertOutboundParams): Promise<Message>;
  findById(id: MessageId): Promise<Message | null>;
  findByProviderSid(provider: string, providerMessageSid: string): Promise<Message | null>;
  listByConversation(conversationId: ConversationId): Promise<Message[]>;
  transitionStatus(params: TransitionStatusParams): Promise<void>;
  findStaleInboundReceived(olderThan: Date): Promise<Message[]>;
  findStaleInboundProcessing(olderThan: Date): Promise<Message[]>;
  findStaleOutboundQueued(olderThan: Date): Promise<Message[]>;
};
