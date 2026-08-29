import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  bigserial,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inboundNumber: text("inbound_number").notNull(),
    userNumber: text("user_number").notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull(),
    needsAttention: boolean("needs_attention").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("conversations_inbound_user_unique").on(table.inboundNumber, table.userNumber),
    index("conversations_last_message_at_idx").on(
      table.lastMessageAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    direction: text("direction").notNull(),
    status: text("status").notNull(),
    body: text("body").notNull(),
    provider: text("provider").notNull(),
    providerMessageSid: text("provider_message_sid").notNull(),
    correlationId: text("correlation_id").notNull(),
    inReplyTo: uuid("in_reply_to").references((): AnyPgColumn => messages.id),
    errorCode: text("error_code"),
    attempts: integer("attempts").notNull().default(0),
    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("messages_provider_sid_unique").on(table.provider, table.providerMessageSid),
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("messages_reaper_idx")
      .on(table.status, table.createdAt)
      .where(sql`${table.status} in ('received', 'processing', 'queued')`),
  ],
);

export const messageStatusEvents = pgTable("message_status_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  reason: text("reason"),
  correlationId: text("correlation_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});
