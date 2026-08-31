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

export type MessageRepository = {
  insertInbound(params: InsertInboundParams): Promise<InsertInboundResult>;
  insertOutbound(params: InsertOutboundParams): Promise<Message>;
  findById(id: MessageId): Promise<Message | null>;
  listByConversation(conversationId: ConversationId): Promise<Message[]>;
  updateStatus(messageId: MessageId, status: MessageStatus): Promise<void>;
  markOutboundSent(messageId: MessageId, providerMessageSid: string): Promise<void>;
  findStaleInboundReceived(olderThan: Date): Promise<Message[]>;
  findStaleInboundProcessing(olderThan: Date): Promise<Message[]>;
  findStaleOutboundQueued(olderThan: Date): Promise<Message[]>;
};
