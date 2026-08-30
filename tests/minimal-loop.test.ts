import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../packages/core/src/migrate.js";
import { buildApp } from "../apps/api/src/index.js";
import { createFakeSmsProvider } from "../packages/core/src/adapters/fake-sms-provider.js";
import { createBullMqJobQueue } from "../packages/core/src/adapters/bullmq-job-queue.js";
import { createWorkerConsumer, createDefaultWorkerConsumer } from "../apps/worker/src/consumer.js";
import { createRuleBasedMessageProcessor } from "../apps/worker/src/processor/rule-based-message-processor.js";
import type { JobQueue } from "../packages/core/src/ports/job-queue.js";
import type { MessageProcessor } from "../packages/core/src/ports/message-processor.js";
import type { SmsProvider } from "../packages/core/src/ports/sms-provider.js";
import type { Message, ProcessJobPayload } from "../packages/core/src/domain/types.js";
import { loadEnv as loadWorkerEnv } from "../apps/worker/src/env.js";
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

function createFlakyMessageProcessor(failuresBeforeSuccess: number): MessageProcessor {
  let calls = 0;

  return {
    async process(inbound: Message) {
      calls += 1;
      if (calls <= failuresBeforeSuccess) {
        throw new Error("simulated worker crash");
      }

      return {
        body: `Reply: ${inbound.body}`,
      };
    },
  };
}

function createSendCrashAfterSuccessProvider(
  base: ReturnType<typeof createFakeSmsProvider>,
): SmsProvider {
  let sendCalls = 0;

  return {
    name: base.name,
    verifySignature: (...args) => base.verifySignature(...args),
    async send(params) {
      sendCalls += 1;
      const result = await base.send(params);
      if (sendCalls === 1) {
        throw new Error("simulated crash after provider send");
      }
      return result;
    },
  };
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

describe("minimal loop", () => {
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

  it("returns 200 and persists the inbound message readable over HTTP", async () => {
    const smsProvider = createFakeSmsProvider();
    const { app } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider },
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM111",
          from: "+15550001",
          to: "+15559999",
          body: "hello",
        }),
      });

      expect(response.statusCode).toBe(200);

      const listResponse = await app.inject({ method: "GET", url: "/conversations" });
      const { conversations } = listResponse.json<{ conversations: Array<{ id: string }> }>();
      expect(conversations).toHaveLength(1);

      const messagesResponse = await app.inject({
        method: "GET",
        url: `/conversations/${conversations[0]!.id}/messages`,
      });
      const { messages } = messagesResponse.json<{
        messages: Array<{ direction: string; body: string; status: string }>;
      }>();

      expect(messages).toEqual([
        expect.objectContaining({
          direction: "inbound",
          body: "hello",
          status: "received",
        }),
      ]);
    } finally {
      await app.close();
    }
  });

  it("reuses a conversation for the same number pair and opens a new one for a different pair", async () => {
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
          messageSid: "SM211",
          from: "+15550002",
          to: "+15559999",
          body: "first",
        }),
      });

      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM212",
          from: "+15550002",
          to: "+15559999",
          body: "second",
        }),
      });

      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM213",
          from: "+15550003",
          to: "+15559999",
          body: "other user",
        }),
      });

      const listResponse = await app.inject({ method: "GET", url: "/conversations" });
      const { conversations } = listResponse.json<{
        conversations: Array<{ id: string; userNumber: string }>;
      }>();

      expect(conversations).toHaveLength(2);

      const samePairConversation = conversations.find((c) => c.userNumber === "+15550002");
      expect(samePairConversation).toBeDefined();

      const messagesResponse = await app.inject({
        method: "GET",
        url: `/conversations/${samePairConversation!.id}/messages`,
      });
      const { messages } = messagesResponse.json<{ messages: Array<{ body: string }> }>();
      expect(messages.map((message) => message.body)).toEqual(["first", "second"]);
    } finally {
      await app.close();
    }
  });

  it("processes the inbound message and sends a reply through the fake provider", async () => {
    const smsProvider = createFakeSmsProvider();
    const { app, pool: appPool, redis } = await buildApp({
      env: {
        ...baseEnv(infra),
        PROCESSING_DELAY_MS: "0",
      },
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
          messageSid: "SM311",
          from: "+15550004",
          to: "+15559999",
          body: "ping",
        }),
      });

      await waitFor(() => (smsProvider.sent.length > 0 ? smsProvider.sent[0] : null));

      expect(smsProvider.sent[0]).toMatchObject({
        to: "+15550004",
        from: "+15559999",
        body: "Reply: ping",
      });
    } finally {
      await consumer.close();
      await app.close();
    }
  });

  it("records which inbound message the outbound answers and returns both in chronological order", async () => {
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
          messageSid: "SM411",
          from: "+15550005",
          to: "+15559999",
          body: "question",
        }),
      });

      await waitFor(() => (smsProvider.sent.length > 0 ? true : null));

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
          body: string;
          inReplyTo: string | null;
          status: string;
        }>;
      }>();

      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({
        direction: "inbound",
        body: "question",
        status: "processed",
        inReplyTo: null,
      });
      expect(messages[1]).toMatchObject({
        direction: "outbound",
        body: "Reply: question",
        status: "sent",
        inReplyTo: messages[0]!.id,
      });
    } finally {
      await consumer.close();
      await app.close();
    }
  });

  it("completes processing when the worker retries after a mid-flight crash", async () => {
    const smsProvider = createFakeSmsProvider();
    const { app, pool: appPool, redis } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider },
    });

    const consumer = createWorkerConsumer({
      pool: appPool,
      redis,
      smsProvider,
      messageProcessor: createFlakyMessageProcessor(1),
    });

    try {
      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM422",
          from: "+15550014",
          to: "+15559999",
          body: "retry me",
        }),
      });

      await waitFor(() => (smsProvider.sent.length > 0 ? smsProvider.sent[0] : null), 15_000);

      expect(smsProvider.sent[0]).toMatchObject({
        to: "+15550014",
        from: "+15559999",
        body: "Reply: retry me",
      });

      const listResponse = await app.inject({ method: "GET", url: "/conversations" });
      const { conversations } = listResponse.json<{ conversations: Array<{ id: string }> }>();
      const messagesResponse = await app.inject({
        method: "GET",
        url: `/conversations/${conversations[0]!.id}/messages`,
      });
      const { messages } = messagesResponse.json<{
        messages: Array<{ direction: string; status: string }>;
      }>();

      expect(messages[0]).toMatchObject({
        direction: "inbound",
        status: "processed",
      });
    } finally {
      await consumer.close();
      await app.close();
    }
  });

  it("completes processing when the worker retries after the provider send succeeds", async () => {
    const baseProvider = createFakeSmsProvider();
    const smsProvider = createSendCrashAfterSuccessProvider(baseProvider);
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
          messageSid: "SM423",
          from: "+15550015",
          to: "+15559999",
          body: "send retry",
        }),
      });

      await waitFor(async () => {
        const list = await app.inject({ method: "GET", url: "/conversations" });
        const { conversations } = list.json<{ conversations: Array<{ id: string }> }>();
        const detail = await app.inject({
          method: "GET",
          url: `/conversations/${conversations[0]!.id}/messages`,
        });
        const { messages: currentMessages } = detail.json<{
          messages: Array<{ direction: string; status: string }>;
        }>();
        const inbound = currentMessages.find((message) => message.direction === "inbound");
        const outbound = currentMessages.find((message) => message.direction === "outbound");
        return inbound?.status === "processed" && outbound?.status === "sent" ? true : null;
      }, 15_000);

      expect(baseProvider.sent).toHaveLength(1);
      expect(baseProvider.sent[0]).toMatchObject({
        to: "+15550015",
        body: "Reply: send retry",
      });

      const listResponse = await app.inject({ method: "GET", url: "/conversations" });
      const { conversations } = listResponse.json<{ conversations: Array<{ id: string }> }>();
      const messagesResponse = await app.inject({
        method: "GET",
        url: `/conversations/${conversations[0]!.id}/messages`,
      });
      const { messages } = messagesResponse.json<{
        messages: Array<{ direction: string; status: string }>;
      }>();

      expect(messages).toEqual([
        expect.objectContaining({ direction: "inbound", status: "processed" }),
        expect.objectContaining({ direction: "outbound", status: "sent" }),
      ]);
    } finally {
      await consumer.close();
      await app.close();
    }
  });

  it("marks inbound processed when the outbound was already sent before worker retry", async () => {
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
          messageSid: "SM424",
          from: "+15550016",
          to: "+15559999",
          body: "already sent",
        }),
      });

      await waitFor(() => (smsProvider.sent.length > 0 ? true : null), 15_000);
      const sendCountAfterSuccess = smsProvider.sent.length;

      const listResponse = await app.inject({ method: "GET", url: "/conversations" });
      const { conversations } = listResponse.json<{ conversations: Array<{ id: string }> }>();
      const messagesResponse = await app.inject({
        method: "GET",
        url: `/conversations/${conversations[0]!.id}/messages`,
      });
      const { messages } = messagesResponse.json<{
        messages: Array<{ id: string; direction: string; status: string }>;
      }>();
      const inbound = messages.find((message) => message.direction === "inbound");
      expect(inbound).toBeDefined();

      await pool.query("UPDATE messages SET status = $1 WHERE id = $2", [
        "processing",
        inbound!.id,
      ]);

      const jobQueue = createBullMqJobQueue(redis);
      await jobQueue.enqueueAfterCommit({
        messageId: inbound!.id,
        conversationId: conversations[0]!.id,
        correlationId: inbound!.id,
        providerMessageSid: "SM424-retry",
      });

      await waitFor(async () => {
        const retryMessagesResponse = await app.inject({
          method: "GET",
          url: `/conversations/${conversations[0]!.id}/messages`,
        });
        const { messages: retryMessages } = retryMessagesResponse.json<{
          messages: Array<{ direction: string; status: string }>;
        }>();
        return retryMessages.find((message) => message.direction === "inbound")?.status ===
          "processed"
          ? true
          : null;
      }, 15_000);

      expect(smsProvider.sent).toHaveLength(sendCountAfterSuccess);
    } finally {
      await consumer.close();
      await app.close();
    }
  });

  it("does not process an inbound message twice", async () => {
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
          messageSid: "SM421",
          from: "+15550009",
          to: "+15559999",
          body: "once only",
        }),
      });

      await waitFor(() => (smsProvider.sent.length > 0 ? true : null));
      const firstSendCount = smsProvider.sent.length;

      const listResponse = await app.inject({ method: "GET", url: "/conversations" });
      const { conversations } = listResponse.json<{ conversations: Array<{ id: string }> }>();
      const messagesResponse = await app.inject({
        method: "GET",
        url: `/conversations/${conversations[0]!.id}/messages`,
      });
      const { messages } = messagesResponse.json<{ messages: Array<{ id: string }> }>();

      const jobQueue = createBullMqJobQueue(redis);
      await jobQueue.enqueueAfterCommit({
        messageId: messages[0]!.id,
        conversationId: conversations[0]!.id,
        correlationId: messages[0]!.id,
        providerMessageSid: "SM421-retry",
      });
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(smsProvider.sent).toHaveLength(firstSendCount);
    } finally {
      await consumer.close();
      await app.close();
    }
  });

  it("ignores jobs for missing messages", async () => {
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
      const jobQueue = createBullMqJobQueue(redis);
      await jobQueue.enqueueAfterCommit({
        messageId: "00000000-0000-4000-8000-000000000099",
        conversationId: "00000000-0000-4000-8000-000000000098",
        correlationId: "missing",
        providerMessageSid: "SM999",
      });
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(smsProvider.sent).toHaveLength(0);
      smsProvider.reset();
      expect(smsProvider.sent).toHaveLength(0);
    } finally {
      await consumer.close();
      await app.close();
    }
  });

  it("ignores jobs when the conversation does not exist", async () => {
    const smsProvider = createFakeSmsProvider();
    const capturedJobs: ProcessJobPayload[] = [];
    const jobQueue: JobQueue = {
      async enqueueAfterCommit(payload) {
        capturedJobs.push(payload);
      },
    };

    const { app, pool: appPool, redis } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider, jobQueue },
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
          messageSid: "SM432",
          from: "+15550012",
          to: "+15559999",
          body: "orphan conversation",
        }),
      });

      expect(capturedJobs).toHaveLength(1);

      const bullQueue = createBullMqJobQueue(redis);
      await bullQueue.enqueueAfterCommit({
        ...capturedJobs[0]!,
        conversationId: "00000000-0000-4000-8000-000000000097",
        providerMessageSid: "SM432-retry",
      });
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(smsProvider.sent).toHaveLength(0);
    } finally {
      await consumer.close();
      await app.close();
    }
  });

  it("uses a configurable processing delay", async () => {
    const smsProvider = createFakeSmsProvider();
    const { app, pool: appPool, redis } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider },
    });

    const consumer = createWorkerConsumer({
      pool: appPool,
      redis,
      smsProvider,
      messageProcessor: createRuleBasedMessageProcessor({ delayMs: 100 }),
    });

    try {
      const startedAt = Date.now();
      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM431",
          from: "+15550010",
          to: "+15559999",
          body: "slow",
        }),
      });

      await waitFor(() => (smsProvider.sent.length > 0 ? smsProvider.sent[0] : null));
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(90);
    } finally {
      await consumer.close();
      await app.close();
    }
  });

  it("enqueues only after the inbound message is committed", async () => {
    const smsProvider = createFakeSmsProvider();
    let messagePersistedBeforeEnqueue = false;

    const jobQueue: JobQueue = {
      async enqueueAfterCommit(payload: ProcessJobPayload) {
        const result = await pool.query<{ status: string }>(
          "SELECT status FROM messages WHERE id = $1",
          [payload.messageId],
        );
        messagePersistedBeforeEnqueue = result.rows[0]?.status === "received";
      },
    };

    const { app } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider, jobQueue },
    });

    try {
      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM511",
          from: "+15550006",
          to: "+15559999",
          body: "persist first",
        }),
      });

      expect(messagePersistedBeforeEnqueue).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("does not enqueue a duplicate provider message sid", async () => {
    const smsProvider = createFakeSmsProvider();
    let enqueueCount = 0;
    const jobQueue: JobQueue = {
      async enqueueAfterCommit() {
        enqueueCount += 1;
      },
    };

    const { app } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider, jobQueue },
    });

    const payload = twilioBody({
      messageSid: "SM611",
      from: "+15550007",
      to: "+15559999",
      body: "once",
    });

    try {
      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload,
      });
      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload,
      });

      expect(enqueueCount).toBe(1);
    } finally {
      await app.close();
    }
  });

  it("rejects an invalid webhook payload", async () => {
    const { app } = await buildApp({ env: baseEnv(infra) });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: "MessageSid=SM701",
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("rejects an invalid webhook signature", async () => {
    const smsProvider = createFakeSmsProvider();
    smsProvider.verifySignature = () => false;
    const { app } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider },
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM702",
          from: "+15550008",
          to: "+15559999",
          body: "blocked",
        }),
      });

      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("surfaces unexpected webhook handling failures", async () => {
    const { app } = await buildApp({
      env: baseEnv(infra),
      deps: {
        conversationRepository: {
          async findOrCreate() {
            throw new Error("boom");
          },
          async findById() {
            return null;
          },
          async listAll() {
            return [];
          },
        },
      },
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM703",
          from: "+15550013",
          to: "+15559999",
          body: "fail",
        }),
      });

      expect(response.statusCode).toBe(500);
    } finally {
      await app.close();
    }
  });

  it("returns 404 for an unknown conversation", async () => {
    const { app } = await buildApp({ env: baseEnv(infra) });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/conversations/00000000-0000-4000-8000-000000000000/messages",
      });

      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe("worker environment validation", () => {
  it("loads valid worker environment", () => {
    expect(
      loadWorkerEnv({
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/conversational_sms",
        REDIS_URL: "redis://127.0.0.1:6379",
        PROCESSING_DELAY_MS: "0",
      }),
    ).toMatchObject({
      PROCESSING_DELAY_MS: 0,
    });
  });

  it("refuses to boot on a missing variable, naming the offending variable", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as typeof process.exit);
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      loadWorkerEnv({
        REDIS_URL: "redis://127.0.0.1:6379",
      }),
    ).toThrow("process.exit");

    expect(stderr).toHaveBeenCalledWith("Invalid environment variable DATABASE_URL: Required");

    exit.mockRestore();
    stderr.mockRestore();
  });

  it("refuses to boot on a malformed value, naming the offending variable", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as typeof process.exit);
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      loadWorkerEnv({
        DATABASE_URL: "not-a-url",
        REDIS_URL: "redis://127.0.0.1:6379",
      }),
    ).toThrow("process.exit");

    expect(stderr).toHaveBeenCalledWith("Invalid environment variable DATABASE_URL: Invalid url");

    exit.mockRestore();
    stderr.mockRestore();
  });
});

describe("worker bootstrap", () => {
  let infra: TestInfrastructure;
  let pool: pg.Pool;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    pool = new pg.Pool({ connectionString: infra.databaseUrl });
    await runMigrations(pool);
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await infra.stop();
  }, 30_000);

  it("creates the default worker consumer", async () => {
    const { app, redis } = await buildApp({ env: baseEnv(infra) });
    const consumer = createDefaultWorkerConsumer(pool, redis, 0);
    try {
      await consumer.close();
    } finally {
      await app.close();
    }
  });
});
