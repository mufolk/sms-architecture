import pg from "pg";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../packages/core/src/migrate.js";
import { buildApp } from "../apps/api/src/index.js";
import {
  createFakeSmsProvider,
  type FakeSmsProvider,
} from "../packages/core/src/adapters/fake-sms-provider.js";
import { createWorkerConsumer } from "../apps/worker/src/consumer.js";
import { createRuleBasedMessageProcessor } from "../apps/worker/src/processor/rule-based-message-processor.js";
import type { MessageProcessor } from "../packages/core/src/ports/message-processor.js";
import type { Message, ReplyDraft } from "../packages/core/src/domain/types.js";
import type { SmsProvider } from "../packages/core/src/ports/sms-provider.js";
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

async function listMessages(
  app: Awaited<ReturnType<typeof buildApp>>["app"],
): Promise<
  Array<{
    id: string;
    direction: string;
    status: string;
    body: string;
    inReplyTo: string | null;
  }>
> {
  const listResponse = await app.inject({ method: "GET", url: "/conversations" });
  const { conversations } = listResponse.json<{ conversations: Array<{ id: string }> }>();
  const messagesResponse = await app.inject({
    method: "GET",
    url: `/conversations/${conversations[0]!.id}/messages`,
  });
  const { messages } = messagesResponse.json<{
    messages: Array<{
      id: string;
      direction: string;
      status: string;
      body: string;
      inReplyTo: string | null;
    }>;
  }>();
  return messages;
}

function createGatedMessageProcessor(): MessageProcessor & { release(): void } {
  let releaseGate: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });

  return {
    async process(inbound: Message, _history: Message[]): Promise<ReplyDraft> {
      await gate;
      return { body: `Reply: ${inbound.body}` };
    },
    release() {
      releaseGate?.();
    },
  };
}

function createSendGateProvider(base: FakeSmsProvider): SmsProvider & { releaseSend(): void } {
  let releaseSend: (() => void) | null = null;
  const sendGate = new Promise<void>((resolve) => {
    releaseSend = resolve;
  });

  return {
    name: base.name,
    verifySignature: (...args) => base.verifySignature(...args),
    lookupByIdempotencyKey: (...args) => base.lookupByIdempotencyKey(...args),
    async send(params) {
      await sendGate;
      return base.send(params);
    },
    releaseSend() {
      releaseSend?.();
    },
  };
}

describe("idempotency", () => {
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

  it("delivering the same webhook payload twice produces exactly one outbound message", async () => {
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

    const payload = twilioBody({
      messageSid: "SM-IDEM-1",
      from: "+15556001",
      to: "+15559999",
      body: "once",
    });

    try {
      const firstResponse = await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload,
      });
      expect(firstResponse.statusCode).toBe(200);
      expect(firstResponse.json()).toEqual({ duplicate: false });

      const duplicateResponse = await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload,
      });
      expect(duplicateResponse.statusCode).toBe(200);
      expect(duplicateResponse.json()).toEqual({ duplicate: true });

      await waitFor(() => (smsProvider.sent.length > 0 ? smsProvider.sent : null), 15_000);

      expect(smsProvider.sent).toHaveLength(1);
      expect(smsProvider.sent[0]).toMatchObject({
        to: "+15556001",
        from: "+15559999",
        body: "Reply: once",
      });

      const messages = await listMessages(app);
      const outbound = messages.find((message) => message.direction === "outbound");
      expect(outbound).toBeDefined();
      expect(smsProvider.sent[0]!.idempotencyKey).toBe(outbound!.id);
      expect(messages.filter((message) => message.direction === "inbound")).toHaveLength(1);
      expect(messages.filter((message) => message.direction === "outbound")).toHaveLength(1);
    } finally {
      await consumer.close();
      await app.close();
    }
  });

  it("does not send again when the same sid is redelivered after redis loses the job", async () => {
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

    const payload = twilioBody({
      messageSid: "SM-IDEM-REDIS",
      from: "+15557001",
      to: "+15559999",
      body: "survive redis loss",
    });

    try {
      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload,
      });

      await waitFor(() => (smsProvider.sent.length > 0 ? smsProvider.sent : null), 15_000);
      expect(smsProvider.sent).toHaveLength(1);

      await (redis as Redis).flushall();

      const duplicateResponse = await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload,
      });

      expect(duplicateResponse.statusCode).toBe(200);
      expect(duplicateResponse.json()).toEqual({ duplicate: true });

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(smsProvider.sent).toHaveLength(1);

      const messages = await listMessages(app);
      expect(messages.filter((message) => message.direction === "inbound")).toHaveLength(1);
      expect(messages.filter((message) => message.direction === "outbound")).toHaveLength(1);
    } finally {
      await consumer.close();
      await app.close();
    }
  });

  it("absorbs redelivery while the first delivery is still processing", async () => {
    const smsProvider = createFakeSmsProvider();
    const messageProcessor = createGatedMessageProcessor();
    const { app, pool: appPool, redis } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider },
    });

    const consumer = createWorkerConsumer({
      pool: appPool,
      redis,
      smsProvider,
      messageProcessor,
    });

    const payload = twilioBody({
      messageSid: "SM-IDEM-2",
      from: "+15556002",
      to: "+15559999",
      body: "in flight",
    });

    try {
      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload,
      });

      await waitFor(async () => {
        const messages = await listMessages(app);
        const inbound = messages.find((message) => message.direction === "inbound");
        return inbound?.status === "processing" ? inbound : null;
      }, 15_000);

      const duplicateResponse = await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload,
      });

      expect(duplicateResponse.statusCode).toBe(200);
      expect(duplicateResponse.json()).toEqual({ duplicate: true });

      const messagesBeforeRelease = await listMessages(app);
      expect(messagesBeforeRelease.filter((message) => message.direction === "outbound")).toHaveLength(
        0,
      );

      messageProcessor.release();

      await waitFor(() => (smsProvider.sent.length > 0 ? smsProvider.sent : null), 15_000);
      expect(smsProvider.sent).toHaveLength(1);

      const messagesAfterRelease = await listMessages(app);
      expect(messagesAfterRelease.filter((message) => message.direction === "outbound")).toHaveLength(
        1,
      );
    } finally {
      await consumer.close();
      await app.close();
    }
  });

  it("does not create a second outbound when redelivered before the first is confirmed sent", async () => {
    const baseProvider = createFakeSmsProvider();
    const smsProvider = createSendGateProvider(baseProvider);
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

    const payload = twilioBody({
      messageSid: "SM-IDEM-3",
      from: "+15556003",
      to: "+15559999",
      body: "queued outbound",
    });

    try {
      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload,
      });

      const queuedOutbound = await waitFor(async () => {
        const messages = await listMessages(app);
        const outbound = messages.find((message) => message.direction === "outbound");
        return outbound?.status === "queued" ? outbound : null;
      }, 15_000);

      const duplicateResponse = await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload,
      });

      expect(duplicateResponse.statusCode).toBe(200);
      expect(duplicateResponse.json()).toEqual({ duplicate: true });

      const messagesAfterRedelivery = await listMessages(app);
      expect(
        messagesAfterRedelivery.filter((message) => message.direction === "outbound"),
      ).toHaveLength(1);

      smsProvider.releaseSend();

      await waitFor(() => (baseProvider.sent.length > 0 ? baseProvider.sent : null), 15_000);
      expect(baseProvider.sent).toHaveLength(1);
      expect(baseProvider.sent[0]!.idempotencyKey).toBe(queuedOutbound.id);
    } finally {
      await consumer.close();
      await app.close();
    }
  });

  it("discards a redelivered body change for an already-seen provider message sid", async () => {
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
          messageSid: "SM-IDEM-4",
          from: "+15556004",
          to: "+15559999",
          body: "original",
        }),
      });

      const duplicateResponse = await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM-IDEM-4",
          from: "+15556004",
          to: "+15559999",
          body: "tampered",
        }),
      });

      expect(duplicateResponse.statusCode).toBe(200);
      expect(duplicateResponse.json()).toEqual({ duplicate: true });

      await waitFor(() => (smsProvider.sent.length > 0 ? smsProvider.sent : null), 15_000);

      expect(smsProvider.sent).toHaveLength(1);
      expect(smsProvider.sent[0]!.body).toBe("Reply: original");
    } finally {
      await consumer.close();
      await app.close();
    }
  });
});
