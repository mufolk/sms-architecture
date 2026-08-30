import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { conversations, messages } from "@conversational-sms/core/schema";
import type { ConversationRepository } from "../ports/conversation-repository.js";
import type {
  Conversation,
  ConversationId,
  Message,
  MessageId,
  MessageStatus,
} from "../domain/types.js";
import type { MessageRepository } from "../ports/message-repository.js";

function mapConversation(row: typeof conversations.$inferSelect): Conversation {
  return {
    id: row.id,
    inboundNumber: row.inboundNumber,
    userNumber: row.userNumber,
    lastMessageAt: row.lastMessageAt,
    needsAttention: row.needsAttention,
    createdAt: row.createdAt,
  };
}

function mapMessage(row: typeof messages.$inferSelect): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    direction: row.direction as Message["direction"],
    status: row.status as MessageStatus,
    body: row.body,
    provider: row.provider,
    providerMessageSid: row.providerMessageSid,
    correlationId: row.correlationId,
    inReplyTo: row.inReplyTo,
    errorCode: row.errorCode,
    attempts: row.attempts,
    rawPayload: row.rawPayload,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createDrizzleConversationRepository(pool: Pool): ConversationRepository {
  const db = drizzle(pool);

  return {
    async findOrCreate(params) {
      const [row] = await db
        .insert(conversations)
        .values({
          inboundNumber: params.inboundNumber,
          userNumber: params.userNumber,
          lastMessageAt: params.lastMessageAt,
        })
        .onConflictDoUpdate({
          target: [conversations.inboundNumber, conversations.userNumber],
          set: { lastMessageAt: params.lastMessageAt },
        })
        .returning();

      if (!row) {
        throw new Error("Failed to find or create conversation");
      }

      return mapConversation(row);
    },

    async findById(id: ConversationId) {
      const [row] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
      return row ? mapConversation(row) : null;
    },

    async listAll() {
      const rows = await db
        .select()
        .from(conversations)
        .orderBy(desc(conversations.lastMessageAt), desc(conversations.id));
      return rows.map(mapConversation);
    },
  };
}

export function createDrizzleMessageRepository(pool: Pool): MessageRepository {
  const db = drizzle(pool);

  return {
    async insertInbound(params) {
      const [inserted] = await db
        .insert(messages)
        .values({
          conversationId: params.conversationId,
          direction: "inbound",
          status: "received",
          body: params.payload.body,
          provider: params.provider,
          providerMessageSid: params.payload.providerMessageSid,
          correlationId: params.correlationId,
          rawPayload: params.payload.rawPayload,
        })
        .onConflictDoNothing({
          target: [messages.provider, messages.providerMessageSid],
        })
        .returning();

      if (inserted) {
        return { message: mapMessage(inserted), inserted: true };
      }

      const [existing] = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.provider, params.provider),
            eq(messages.providerMessageSid, params.payload.providerMessageSid),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new Error("Inbound message conflict without existing row");
      }

      return { message: mapMessage(existing), inserted: false };
    },

    async insertOutbound(params) {
      const [row] = await db
        .insert(messages)
        .values({
          conversationId: params.conversationId,
          direction: "outbound",
          status: "queued",
          body: params.body,
          provider: params.provider,
          providerMessageSid: `pending-${randomUUID()}`,
          correlationId: params.correlationId,
          inReplyTo: params.inReplyTo,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to insert outbound message");
      }

      return mapMessage(row);
    },

    async findById(id: MessageId) {
      const [row] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
      return row ? mapMessage(row) : null;
    },

    async listByConversation(conversationId) {
      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.createdAt), asc(messages.id));

      return rows.map(mapMessage);
    },

    async updateStatus(messageId, status) {
      await db
        .update(messages)
        .set({ status, updatedAt: new Date() })
        .where(eq(messages.id, messageId));
    },

    async markOutboundSent(messageId, providerMessageSid) {
      await db
        .update(messages)
        .set({
          status: "sent",
          providerMessageSid,
          updatedAt: new Date(),
        })
        .where(eq(messages.id, messageId));
    },
  };
}
