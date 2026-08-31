import pg from "pg";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../packages/core/src/migrate.js";
import { buildApp } from "../apps/api/src/index.js";
import { createFakeSmsProvider } from "../packages/core/src/adapters/fake-sms-provider.js";
import { type BullMqJobQueue } from "../packages/core/src/adapters/bullmq-job-queue.js";
import { createWorkerConsumer } from "../apps/worker/src/consumer.js";
import { createRuleBasedMessageProcessor } from "../apps/worker/src/processor/rule-based-message-processor.js";
import { baseEnv, startTestInfrastructure, type TestInfrastructure } from "./helpers/infrastructure.js";

function twilioBody(params: {
  messageSid: string;
  from: string;
  to: string;
  body: string;
}): string {
  return new URLSearchParams({
    MessageSid: params.messageSid,
    From: params.from,
    To: params.to,
    Body: params.body,
  }).toString();
}

function twilioStatusBody(params: {
  messageSid: string;
  messageStatus: string;
  errorCode?: string;
}): string {
  const fields: Record<string, string> = {
    MessageSid: params.messageSid,
    MessageStatus: params.messageStatus,
    SmsStatus: params.messageStatus,
  };
  if (params.errorCode) {
    fields.ErrorCode = params.errorCode;
  }
  return new URLSearchParams(fields).toString();
}

async function waitFor<T>(
  fn: () => T | Promise<T | null | undefined>,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for condition");
}

async function sendAndProcess(params: {
  app: Awaited<ReturnType<typeof buildApp>>["app"];
  smsProvider: ReturnType<typeof createFakeSmsProvider>;
  messageSid: string;
  from?: string;
  to?: string;
  body?: string;
}): Promise<{ conversationId: string; outboundProviderSid: string }> {
  await params.app.inject({
    method: "POST",
    url: "/webhooks/sms",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: twilioBody({
      messageSid: params.messageSid,
      from: params.from ?? "+15550001",
      to: params.to ?? "+15559999",
      body: params.body ?? "hello",
    }),
  });

  const sent = await waitFor(() =>
    params.smsProvider.sent.length > 0 ? params.smsProvider.sent[0]! : null,
  );

  if (!sent) {
    throw new Error("Expected outbound send");
  }

  const listResponse = await params.app.inject({ method: "GET", url: "/conversations" });
  const { conversations } = listResponse.json<{ conversations: Array<{ id: string }> }>();

  return {
    conversationId: conversations[0]!.id,
    outboundProviderSid: sent.providerMessageSid,
  };
}

describe("status lifecycle", () => {
  let infra: TestInfrastructure;
  let pool: pg.Pool;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    pool = new pg.Pool({ connectionString: infra.databaseUrl });
    await runMigrations(pool);
  }, 120_000);

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE TABLE message_status_events, messages, conversations RESTART IDENTITY CASCADE",
    );
  });

  afterAll(async () => {
    await pool.end();
    await infra.stop();
  }, 30_000);

  describe("illegal transitions are rejected", () => {
    it("does not move an outbound message backwards when a later delivery receipt arrives", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app, pool: appPool, redis } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
      });

      try {
        const { conversationId, outboundProviderSid } = await sendAndProcess({
          app,
          smsProvider,
          messageSid: "SM601",
        });

        const deliveredResponse = await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioStatusBody({
            messageSid: outboundProviderSid,
            messageStatus: "delivered",
          }),
        });
        expect(deliveredResponse.statusCode).toBe(200);

        const undeliveredResponse = await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioStatusBody({
            messageSid: outboundProviderSid,
            messageStatus: "undelivered",
            errorCode: "30003",
          }),
        });
        expect(undeliveredResponse.statusCode).toBe(200);

        const messagesResponse = await app.inject({
          method: "GET",
          url: `/conversations/${conversationId}/messages`,
        });
        const { messages } = messagesResponse.json<{
          messages: Array<{ direction: string; status: string }>;
        }>();

        expect(messages[1]).toMatchObject({
          direction: "outbound",
          status: "delivered",
        });
      } finally {
        await consumer.close();
        await app.close();
      }
    });

    it("does not apply delivered to an outbound message still queued", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app, pool: appPool, redis } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
      });

      try {
        await app.inject({
          method: "POST",
          url: "/webhooks/sms",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioBody({
            messageSid: "SM602",
            from: "+15550002",
            to: "+15559999",
            body: "queued test",
          }),
        });

        const outbound = await waitFor(async () => {
          const result = await pool.query<{ provider_message_sid: string }>(
            "SELECT provider_message_sid FROM messages WHERE direction = 'outbound' LIMIT 1",
          );
          return result.rows[0] ?? null;
        });

        await pool.query("UPDATE messages SET status = 'queued' WHERE direction = 'outbound'");

        const response = await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioStatusBody({
            messageSid: outbound!.provider_message_sid,
            messageStatus: "delivered",
          }),
        });
        expect(response.statusCode).toBe(200);

        const statusResult = await pool.query<{ status: string }>(
          "SELECT status FROM messages WHERE direction = 'outbound'",
        );
        expect(statusResult.rows[0]?.status).toBe("queued");
      } finally {
        await consumer.close();
        await app.close();
      }
    });

    it("does not apply a delivery receipt to an inbound message", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      try {
        await app.inject({
          method: "POST",
          url: "/webhooks/sms",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioBody({
            messageSid: "SM603",
            from: "+15550003",
            to: "+15559999",
            body: "inbound receipt",
          }),
        });

        const response = await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioStatusBody({
            messageSid: "SM603",
            messageStatus: "delivered",
          }),
        });
        expect(response.statusCode).toBe(200);

        const statusResult = await pool.query<{ status: string }>(
          "SELECT status FROM messages WHERE direction = 'inbound'",
        );
        expect(statusResult.rows[0]?.status).toBe("received");
      } finally {
        await app.close();
      }
    });

    it("handles a delivery receipt for an unknown provider message SID without error", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      try {
        const response = await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioStatusBody({
            messageSid: "SMunknown",
            messageStatus: "delivered",
          }),
        });

        expect(response.statusCode).toBe(200);
      } finally {
        await app.close();
      }
    });
  });

  describe("happy paths and transition records", () => {
    it("moves an inbound message through received, processing, and processed", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app, pool: appPool, redis } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
      });

      try {
        const { conversationId } = await sendAndProcess({
          app,
          smsProvider,
          messageSid: "SM611",
          body: "lifecycle inbound",
        });

        const messagesResponse = await app.inject({
          method: "GET",
          url: `/conversations/${conversationId}/messages`,
        });
        const { messages } = messagesResponse.json<{
          messages: Array<{ direction: string; status: string }>;
        }>();

        expect(messages[0]).toMatchObject({ direction: "inbound", status: "processed" });

        const events = await pool.query<{ from_status: string | null; to_status: string; reason: string }>(
          `SELECT from_status, to_status, reason
           FROM message_status_events
           WHERE message_id = (SELECT id FROM messages WHERE direction = 'inbound')
           ORDER BY id`,
        );

        expect(events.rows).toEqual([
          expect.objectContaining({ from_status: null, to_status: "received", reason: "webhook-ingest" }),
          expect.objectContaining({ from_status: "received", to_status: "processing", reason: "worker-start" }),
          expect.objectContaining({ from_status: "processing", to_status: "processed", reason: "reply-sent" }),
        ]);
      } finally {
        await consumer.close();
        await app.close();
      }
    });

    it("records queued to sent on the outbound message with reason and correlation id", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app, pool: appPool, redis } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
      });

      try {
        await sendAndProcess({ app, smsProvider, messageSid: "SM612" });

        const events = await pool.query<{
          from_status: string | null;
          to_status: string;
          reason: string;
          correlation_id: string;
        }>(
          `SELECT from_status, to_status, reason, correlation_id
           FROM message_status_events
           WHERE message_id = (SELECT id FROM messages WHERE direction = 'outbound')
           ORDER BY id`,
        );

        expect(events.rows).toEqual([
          expect.objectContaining({ from_status: null, to_status: "queued", reason: "outbound-created" }),
          expect.objectContaining({ from_status: "queued", to_status: "sent", reason: "provider-accepted" }),
        ]);
        expect(events.rows[1]!.correlation_id).toBeTruthy();
      } finally {
        await consumer.close();
        await app.close();
      }
    });

    it("moves a sent outbound message to delivered via the delivery receipt endpoint", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app, pool: appPool, redis } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
      });

      try {
        const { conversationId, outboundProviderSid } = await sendAndProcess({
          app,
          smsProvider,
          messageSid: "SM613",
        });

        await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioStatusBody({
            messageSid: outboundProviderSid,
            messageStatus: "delivered",
          }),
        });

        const messagesResponse = await app.inject({
          method: "GET",
          url: `/conversations/${conversationId}/messages`,
        });
        const { messages } = messagesResponse.json<{
          messages: Array<{ direction: string; status: string }>;
        }>();

        expect(messages[1]).toMatchObject({ direction: "outbound", status: "delivered" });
      } finally {
        await consumer.close();
        await app.close();
      }
    });

    it("moves a sent outbound message to undelivered via the delivery receipt endpoint", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app, pool: appPool, redis } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
      });

      try {
        const { conversationId, outboundProviderSid } = await sendAndProcess({
          app,
          smsProvider,
          messageSid: "SM616",
        });

        await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioStatusBody({
            messageSid: outboundProviderSid,
            messageStatus: "undelivered",
            errorCode: "30003",
          }),
        });

        const messagesResponse = await app.inject({
          method: "GET",
          url: `/conversations/${conversationId}/messages`,
        });
        const { messages } = messagesResponse.json<{
          messages: Array<{ direction: string; status: string }>;
        }>();

        expect(messages[1]).toMatchObject({ direction: "outbound", status: "undelivered" });
      } finally {
        await consumer.close();
        await app.close();
      }
    });

    it("ignores a repeated delivered receipt without changing status", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app, pool: appPool, redis } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
      });

      try {
        const { outboundProviderSid } = await sendAndProcess({
          app,
          smsProvider,
          messageSid: "SM614",
        });

        const payload = twilioStatusBody({
          messageSid: outboundProviderSid,
          messageStatus: "delivered",
        });

        await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload,
        });
        await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload,
        });

        const events = await pool.query("SELECT COUNT(*)::int AS count FROM message_status_events WHERE to_status = 'delivered'");
        expect(events.rows[0]?.count).toBe(1);
      } finally {
        await consumer.close();
        await app.close();
      }
    });

    it("does not add transition events when the worker sees an already processed inbound message", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app, pool: appPool, redis, deps } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
      });

      const jobQueue = deps.jobQueue as BullMqJobQueue;

      try {
        await sendAndProcess({ app, smsProvider, messageSid: "SM615" });

        const inbound = (
          await pool.query<{ id: string; conversation_id: string; provider_message_sid: string }>(
            "SELECT id, conversation_id, provider_message_sid FROM messages WHERE direction = 'inbound'",
          )
        ).rows[0]!;

        const eventsBefore = (
          await pool.query("SELECT COUNT(*)::int AS count FROM message_status_events WHERE message_id = $1", [
            inbound.id,
          ])
        ).rows[0]!.count;

        const jobBefore = await jobQueue.queue.getJob(inbound.provider_message_sid);
        const processedOnBefore = jobBefore?.processedOn;

        await jobQueue.reenqueueStaleInbound({
          messageId: inbound.id,
          conversationId: inbound.conversation_id,
          correlationId: randomUUID(),
          providerMessageSid: inbound.provider_message_sid,
        });

        await waitFor(async () => {
          const job = await jobQueue.queue.getJob(inbound.provider_message_sid);
          if (!job) {
            return null;
          }
          const state = await job.getState();
          if (state !== "completed" && state !== "failed") {
            return null;
          }
          if (job.processedOn === processedOnBefore) {
            return null;
          }
          return true;
        }, 15_000);

        const eventsAfter = (
          await pool.query("SELECT COUNT(*)::int AS count FROM message_status_events WHERE message_id = $1", [
            inbound.id,
          ])
        ).rows[0]!.count;

        expect(eventsAfter).toBe(eventsBefore);
      } finally {
        await consumer.close();
        await app.close();
      }
    });

    it("marks inbound processed when reaper retries after outbound became undelivered", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app, pool: appPool, redis, deps } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
      });

      const jobQueue = deps.jobQueue as BullMqJobQueue;

      try {
        const { outboundProviderSid } = await sendAndProcess({
          app,
          smsProvider,
          messageSid: "SM630",
        });

        const inbound = (
          await pool.query<{ id: string; conversation_id: string; provider_message_sid: string }>(
            "SELECT id, conversation_id, provider_message_sid FROM messages WHERE direction = 'inbound'",
          )
        ).rows[0]!;

        await pool.query("UPDATE messages SET status = 'processing' WHERE id = $1", [inbound.id]);

        await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioStatusBody({
            messageSid: outboundProviderSid,
            messageStatus: "undelivered",
            errorCode: "30003",
          }),
        });

        await jobQueue.reenqueueStaleInbound({
          messageId: inbound.id,
          conversationId: inbound.conversation_id,
          correlationId: randomUUID(),
          providerMessageSid: inbound.provider_message_sid,
        });

        await waitFor(async () => {
          const result = await pool.query<{ status: string }>(
            "SELECT status FROM messages WHERE id = $1",
            [inbound.id],
          );
          return result.rows[0]?.status === "processed" ? true : null;
        }, 15_000);

        expect(smsProvider.sent).toHaveLength(1);

        const outboundStatus = await pool.query<{ status: string }>(
          "SELECT status FROM messages WHERE direction = 'outbound'",
        );
        expect(outboundStatus.rows[0]?.status).toBe("undelivered");
      } finally {
        await consumer.close();
        await app.close();
      }
    });
  });

  describe("fake provider and end-to-end operator visibility", () => {
    it("emits a delivery receipt on demand through the status webhook", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app, pool: appPool, redis } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
      });

      try {
        const { conversationId, outboundProviderSid } = await sendAndProcess({
          app,
          smsProvider,
          messageSid: "SM621",
        });

        await app.listen({ port: 0, host: "127.0.0.1" });
        const address = app.server.address();
        if (!address || typeof address === "string") {
          throw new Error("Expected server address");
        }

        await smsProvider.emitDeliveryReceipt({
          statusCallbackUrl: `http://127.0.0.1:${address.port}/webhooks/status`,
          providerMessageSid: outboundProviderSid,
          status: "delivered",
        });

        const messagesResponse = await app.inject({
          method: "GET",
          url: `/conversations/${conversationId}/messages`,
        });
        const { messages } = messagesResponse.json<{
          messages: Array<{ direction: string; status: string }>;
        }>();

        expect(messages[1]).toMatchObject({ direction: "outbound", status: "delivered" });
      } finally {
        await consumer.close();
        await app.close();
      }
    });

    it("shows operator-visible status at each step through to delivered", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app, pool: appPool, redis } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 50 }),
      });

      try {
        await app.inject({
          method: "POST",
          url: "/webhooks/sms",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioBody({
            messageSid: "SM622",
            from: "+15550022",
            to: "+15559999",
            body: "track me",
          }),
        });

        const listResponse = await app.inject({ method: "GET", url: "/conversations" });
        const { conversations } = listResponse.json<{ conversations: Array<{ id: string }> }>();
        const conversationId = conversations[0]!.id;

        const receivedResponse = await app.inject({
          method: "GET",
          url: `/conversations/${conversationId}/messages`,
        });
        expect(receivedResponse.json<{ messages: Array<{ status: string }> }>().messages[0]?.status).toBe(
          "received",
        );

        await waitFor(async () => {
          const detail = await app.inject({
            method: "GET",
            url: `/conversations/${conversationId}/messages`,
          });
          const inbound = detail
            .json<{ messages: Array<{ direction: string; status: string }> }>()
            .messages.find((message) => message.direction === "inbound");
          return inbound?.status === "processed" ? detail : null;
        });

        const sentResponse = await app.inject({
          method: "GET",
          url: `/conversations/${conversationId}/messages`,
        });
        const sentMessages = sentResponse.json<{
          messages: Array<{ direction: string; status: string; id: string }>;
        }>().messages;
        expect(sentMessages.find((message) => message.direction === "inbound")?.status).toBe("processed");
        expect(sentMessages.find((message) => message.direction === "outbound")?.status).toBe("sent");

        const outboundSid = smsProvider.sent[0]!.providerMessageSid;
        await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioStatusBody({
            messageSid: outboundSid,
            messageStatus: "delivered",
          }),
        });

        const deliveredResponse = await app.inject({
          method: "GET",
          url: `/conversations/${conversationId}/messages`,
        });
        expect(
          deliveredResponse
            .json<{ messages: Array<{ direction: string; status: string }> }>()
            .messages.find((message) => message.direction === "outbound")?.status,
        ).toBe("delivered");
      } finally {
        await consumer.close();
        await app.close();
      }
    });

    it("maps a Twilio failed receipt to outbound failed with error code", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app, pool: appPool, redis } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
      });

      try {
        const { conversationId, outboundProviderSid } = await sendAndProcess({
          app,
          smsProvider,
          messageSid: "SM623",
        });

        await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioStatusBody({
            messageSid: outboundProviderSid,
            messageStatus: "failed",
            errorCode: "30003",
          }),
        });

        const messagesResponse = await app.inject({
          method: "GET",
          url: `/conversations/${conversationId}/messages`,
        });
        const { messages } = messagesResponse.json<{
          messages: Array<{ direction: string; status: string }>;
        }>();

        expect(messages[1]).toMatchObject({ direction: "outbound", status: "failed" });

        const errorResult = await pool.query<{ error_code: string | null }>(
          "SELECT error_code FROM messages WHERE direction = 'outbound'",
        );
        expect(errorResult.rows[0]?.error_code).toBe("30003");
      } finally {
        await consumer.close();
        await app.close();
      }
    });
  });

  describe("status webhook edge cases", () => {
    it("returns 200 ignored for queued and sent Twilio statuses", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      try {
        for (const messageStatus of ["queued", "sent"] as const) {
          const response = await app.inject({
            method: "POST",
            url: "/webhooks/status",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            payload: twilioStatusBody({
              messageSid: "SMignored",
              messageStatus,
            }),
          });

          expect(response.statusCode).toBe(200);
          expect(response.json()).toEqual({ ignored: true });
        }
      } finally {
        await app.close();
      }
    });

    it("returns 403 for ignored Twilio statuses when the signature is invalid", async () => {
      const base = createFakeSmsProvider();
      const smsProvider = {
        ...base,
        verifySignature: () => false,
      };
      const { app } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      try {
        const response = await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioStatusBody({
            messageSid: "SMignored403",
            messageStatus: "queued",
          }),
        });

        expect(response.statusCode).toBe(403);
      } finally {
        await app.close();
      }
    });

    it("returns 400 for an invalid status payload", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      try {
        const response = await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: "MessageStatus=delivered",
        });

        expect(response.statusCode).toBe(400);
      } finally {
        await app.close();
      }
    });

    it("returns 403 when the provider rejects the status webhook signature", async () => {
      const base = createFakeSmsProvider();
      const smsProvider = {
        ...base,
        verifySignature: () => false,
      };
      const { app } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      try {
        const response = await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioStatusBody({
            messageSid: "SM403",
            messageStatus: "delivered",
          }),
        });

        expect(response.statusCode).toBe(403);
      } finally {
        await app.close();
      }
    });

    it("accepts SmsStatus when MessageStatus is absent", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app, pool: appPool, redis } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
      });

      try {
        const { conversationId, outboundProviderSid } = await sendAndProcess({
          app,
          smsProvider,
          messageSid: "SM624",
        });

        const response = await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: new URLSearchParams({
            MessageSid: outboundProviderSid,
            SmsStatus: "delivered",
          }).toString(),
        });
        expect(response.statusCode).toBe(200);

        const messagesResponse = await app.inject({
          method: "GET",
          url: `/conversations/${conversationId}/messages`,
        });
        const outbound = messagesResponse
          .json<{ messages: Array<{ direction: string; status: string }> }>()
          .messages.find((message) => message.direction === "outbound");
        expect(outbound?.status).toBe("delivered");
      } finally {
        await consumer.close();
        await app.close();
      }
    });

    it("does not apply a delivery receipt when the outbound row has a mismatched status", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app, pool: appPool, redis } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
      });

      try {
        const { outboundProviderSid } = await sendAndProcess({
          app,
          smsProvider,
          messageSid: "SM625",
        });

        await pool.query("UPDATE messages SET status = 'received' WHERE direction = 'outbound'");

        const response = await app.inject({
          method: "POST",
          url: "/webhooks/status",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioStatusBody({
            messageSid: outboundProviderSid,
            messageStatus: "delivered",
          }),
        });
        expect(response.statusCode).toBe(200);

        const statusResult = await pool.query<{ status: string }>(
          "SELECT status FROM messages WHERE direction = 'outbound'",
        );
        expect(statusResult.rows[0]?.status).toBe("received");
      } finally {
        await consumer.close();
        await app.close();
      }
    });

    it("skips worker processing when an inbound message has a non-processable status", async () => {
      const smsProvider = createFakeSmsProvider();
      const { app, pool: appPool, redis, deps } = await buildApp({
        env: baseEnv(infra),
        deps: { smsProvider },
      });

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
      });

      try {
        await app.inject({
          method: "POST",
          url: "/webhooks/sms",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          payload: twilioBody({
            messageSid: "SM626",
            from: "+15550026",
            to: "+15559999",
            body: "stuck",
          }),
        });

        const inbound = (
          await pool.query<{ id: string; conversation_id: string; provider_message_sid: string }>(
            "SELECT id, conversation_id, provider_message_sid FROM messages WHERE direction = 'inbound'",
          )
        ).rows[0]!;

        await pool.query("UPDATE messages SET status = 'queued' WHERE id = $1", [inbound.id]);

        await deps.jobQueue.reenqueueStaleInbound({
          messageId: inbound.id,
          conversationId: inbound.conversation_id,
          correlationId: randomUUID(),
          providerMessageSid: inbound.provider_message_sid,
        });

        await new Promise((resolve) => setTimeout(resolve, 300));

        const statusResult = await pool.query<{ status: string }>(
          "SELECT status FROM messages WHERE id = $1",
          [inbound.id],
        );
        expect(statusResult.rows[0]?.status).toBe("queued");
        expect(smsProvider.sent).toHaveLength(0);
      } finally {
        await consumer.close();
        await app.close();
      }
    });

    it("throws when the fake provider delivery receipt callback fails", async () => {
      const smsProvider = createFakeSmsProvider();
      const server = createServer((_request, response) => {
        response.writeHead(500);
        response.end();
      });

      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve());
      });

      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected server address");
      }

      try {
        await expect(
          smsProvider.emitDeliveryReceipt({
            statusCallbackUrl: `http://127.0.0.1:${address.port}/webhooks/status`,
            providerMessageSid: "SMfail",
            status: "delivered",
          }),
        ).rejects.toThrow(/Delivery receipt callback failed/);
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
    });
  });
});
