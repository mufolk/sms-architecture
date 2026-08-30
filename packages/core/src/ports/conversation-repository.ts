import type { Conversation, ConversationId } from "../domain/types.js";

export type FindOrCreateConversationParams = {
  inboundNumber: string;
  userNumber: string;
  lastMessageAt: Date;
};

export type ConversationRepository = {
  findOrCreate(params: FindOrCreateConversationParams): Promise<Conversation>;
  findById(id: ConversationId): Promise<Conversation | null>;
  listAll(): Promise<Conversation[]>;
};
