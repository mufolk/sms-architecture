import pg from "pg";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createWorkerRedis } from "../apps/worker/src/redis.js";
import { runMigrations } from "../packages/core/src/migrate.js";
import { buildApp } from "../apps/api/src/index.js";
import { createFakeSmsProvider } from "../packages/core/src/adapters/fake-sms-provider.js";
import { createBullMqJobQueue } from "../packages/core/src/adapters/bullmq-job-queue.js";
import { createWorkerConsumer } from "../apps/worker/src/consumer.js";
import { createReaper, defaultReaperConfig } from "../apps/worker/src/reaper.js";
import { createRuleBasedMessageProcessor } from "../apps/worker/src/processor/rule-based-message-processor.js";
import type { JobQueue } from "../packages/core/src/ports/job-queue.js";
import type { MessageProcessor } from "../packages/core/src/ports/message-processor.js";
import type { Message, ReplyDraft } from "../packages/core/src/domain/types.js";
import type { SmsProvider } from "../packages/core/src/ports/sms-provider.js";
import { baseEnv, startTestInfrastructure, type TestInfrastructure } from "./helpers/infrastructure.js";

const testReaperConfig = {
  intervalMs: 50,
  receivedThresholdMs: 50,
  jobTimeoutMs: 50,
  sendTimeoutMs: 50,
};

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

function createSilentEnqueueJobQueue(): JobQueue {
  return {
    async enqueueAfterCommit() {
      // Simulates a crash after commit: the inbound row exists, Redis never sees a job.
    },
    async reenqueueStaleInbound() {
      return "enqueued";
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

function createSendGateProvider(
  base: ReturnType<typeof createFakeSmsProvider>,
): SmsProvider & { releaseSend(): void } {
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

function createAlwaysFailProcessor(): MessageProcessor {
  return {
    async process() {
      throw new Error("simulated worker crash");
    },
  };
}

function createThrowOnSendProvider(base: ReturnType<typeof createFakeSmsProvider>): SmsProvider {
  return {
    name: base.name,
    verifySignature: (...args) => base.verifySignature(...args),
    lookupByIdempotencyKey: (...args) => base.lookupByIdempotencyKey(...args),
    async send() {
      throw new Error("simulated send failure");
    },
  };
}

async function waitForFailedJob(redis: Awaited<ReturnType<typeof buildApp>>["redis"], timeoutMs = 30_000) {
  const jobQueue = createBullMqJobQueue(redis);
  return waitFor(async () => {
    const counts = await jobQueue.queue.getJobCounts("failed");
    return (counts.failed ?? 0) > 0 ? counts : null;
  }, timeoutMs);
}

function liveJobCount(counts: { active?: number; waiting?: number; delayed?: number }) {
  return (counts.active ?? 0) + (counts.waiting ?? 0) + (counts.delayed ?? 0);
}

describe("durability and reaper", () => {
  let infra: TestInfrastructure;
  let pool: pg.Pool;
  let redisClient: Redis;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    pool = new pg.Pool({ connectionString: infra.databaseUrl });
    redisClient = createWorkerRedis(infra.redisUrl);
    await runMigrations(pool);
  }, 120_000);

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE TABLE message_status_events, messages, conversations RESTART IDENTITY CASCADE",
    );
    await redisClient.flushall();
  });

  afterAll(async () => {
    await redisClient.quit();
    await pool.end();
    await infra.stop();
  }, 30_000);

  it("allows a swappable queue client that skips enqueue after the inbound message is committed", async () => {
    const smsProvider = createFakeSmsProvider();
    let enqueueCalled = false;

    const jobQueue: JobQueue = {
      async enqueueAfterCommit(payload) {
        enqueueCalled = true;
        const result = await pool.query<{ status: string }>(
          "SELECT status FROM messages WHERE id = $1",
          [payload.messageId],
        );
        expect(result.rows[0]?.status).toBe("received");
      },
      async reenqueueStaleInbound() {
        return "enqueued";
      },
    };

    const { app } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider, jobQueue },
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM-REAP-SEAM",
          from: "+15558001",
          to: "+15559999",
          body: "committed only",
        }),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ duplicate: false });
      expect(enqueueCalled).toBe(true);

      const messages = await listMessages(app);
      expect(messages).toEqual([
        expect.objectContaining({ direction: "inbound", status: "received" }),
      ]);
      expect(smsProvider.sent).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("recovers a committed inbound message when enqueue never reached Redis and the reply still goes out", async () => {
    const smsProvider = createFakeSmsProvider();
    const { app, pool: appPool, redis } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider, jobQueue: createSilentEnqueueJobQueue() },
    });

    const consumer = createWorkerConsumer({
      pool: appPool,
      redis,
      smsProvider,
      messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
      reaperConfig: testReaperConfig,
    });

    try {
      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM-REAP-CENTER",
          from: "+15558002",
          to: "+15559999",
          body: "lost enqueue",
        }),
      });

      await pool.query(
        "UPDATE messages SET created_at = created_at - interval '1 minute' WHERE provider_message_sid = $1",
        ["SM-REAP-CENTER"],
      );

      await consumer.reaper.runOnce();

      await waitFor(() => (smsProvider.sent.length > 0 ? smsProvider.sent[0] : null), 15_000);

      expect(smsProvider.sent[0]).toMatchObject({
        to: "+15558002",
        body: "Reply: lost enqueue",
      });

      const messages = await listMessages(app);
      expect(messages).toEqual([
        expect.objectContaining({ direction: "inbound", status: "processed" }),
        expect.objectContaining({ direction: "outbound", status: "sent" }),
      ]);
    } finally {
      await consumer.close();
      await app.close();
    }
  });

  it("re-enqueues inbound messages left in received past the threshold", async () => {
    const smsProvider = createFakeSmsProvider();
    const { app, pool: appPool, redis } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider, jobQueue: createSilentEnqueueJobQueue() },
    });

    try {
      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM-REAP-RECEIVED",
          from: "+15558003",
          to: "+15559999",
          body: "stale received",
        }),
      });

      await pool.query(
        "UPDATE messages SET created_at = created_at - interval '1 minute' WHERE provider_message_sid = $1",
        ["SM-REAP-RECEIVED"],
      );

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
        reaperConfig: testReaperConfig,
      });

      await consumer.reaper.runOnce();

      await waitFor(() => (smsProvider.sent.length > 0 ? smsProvider.sent[0] : null), 15_000);

      expect(smsProvider.sent[0]).toMatchObject({ body: "Reply: stale received" });

      await consumer.close();
    } finally {
      await app.close();
    }
  });

  it("re-enqueues inbound messages left in processing past the job timeout", async () => {
    const smsProvider = createFakeSmsProvider();
    const { app, pool: appPool, redis } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider },
    });

    const failingConsumer = createWorkerConsumer({
      pool: appPool,
      redis,
      smsProvider,
      messageProcessor: createAlwaysFailProcessor(),
      reaperConfig: testReaperConfig,
    });

    try {
      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM-REAP-PROCESSING",
          from: "+15558004",
          to: "+15559999",
          body: "stale processing",
        }),
      });

      await waitForFailedJob(redis);

      await failingConsumer.close();

      await pool.query(
        "UPDATE messages SET updated_at = updated_at - interval '1 minute' WHERE provider_message_sid = $1",
        ["SM-REAP-PROCESSING"],
      );

      const recoveryConsumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
        reaperConfig: testReaperConfig,
      });

      await recoveryConsumer.reaper.runOnce();

      await waitFor(() => (smsProvider.sent.length > 0 ? smsProvider.sent[0] : null), 15_000);

      expect(smsProvider.sent[0]).toMatchObject({ body: "Reply: stale processing" });

      await recoveryConsumer.close();
    } finally {
      await app.close();
    }
  });

  it("reconciles queued outbound messages against the provider without blind resending", async () => {
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
      reaperConfig: testReaperConfig,
    });

    try {
      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM-REAP-QUEUED",
          from: "+15558005",
          to: "+15559999",
          body: "reconcile me",
        }),
      });

      const queuedOutbound = await waitFor(async () => {
        const messages = await listMessages(app);
        const outbound = messages.find((message) => message.direction === "outbound");
        return outbound?.status === "queued" ? outbound : null;
      }, 15_000);

      smsProvider.releaseSend();
      await waitFor(() => (baseProvider.sent.length > 0 ? baseProvider.sent : null), 15_000);
      const sendCountAfterFirstSend = baseProvider.sent.length;

      await pool.query("UPDATE messages SET status = 'queued', updated_at = updated_at - interval '1 minute' WHERE id = $1", [
        queuedOutbound.id,
      ]);
      await pool.query("UPDATE messages SET status = 'processing' WHERE provider_message_sid = $1", [
        "SM-REAP-QUEUED",
      ]);

      await consumer.reaper.runOnce();
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(baseProvider.sent).toHaveLength(sendCountAfterFirstSend);

      const messages = await listMessages(app);
      expect(messages).toEqual([
        expect.objectContaining({ direction: "inbound", status: "processed" }),
        expect.objectContaining({ direction: "outbound", status: "sent" }),
      ]);
    } finally {
      await consumer.close();
      await app.close();
    }
  });

  it("does not cause duplicate work when a reaper pass overlaps a live job", async () => {
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
      reaperConfig: testReaperConfig,
    });

    const jobQueue = createBullMqJobQueue(redis);

    try {
      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM-REAP-OVERLAP",
          from: "+15558006",
          to: "+15559999",
          body: "overlap",
        }),
      });

      await waitFor(async () => {
        const messages = await listMessages(app);
        const inbound = messages.find((message) => message.direction === "inbound");
        return inbound?.status === "processing" ? inbound : null;
      }, 15_000);

      const liveJobsBeforeReaper = await jobQueue.queue.getJobCounts("active", "waiting", "delayed");
      expect(liveJobCount(liveJobsBeforeReaper)).toBeGreaterThan(0);

      await pool.query(
        "UPDATE messages SET updated_at = updated_at - interval '1 minute' WHERE provider_message_sid = $1",
        ["SM-REAP-OVERLAP"],
      );

      await consumer.reaper.runOnce();

      const liveJobsAfterReaper = await jobQueue.queue.getJobCounts("active", "waiting", "delayed");
      expect(liveJobCount(liveJobsAfterReaper)).toBe(liveJobCount(liveJobsBeforeReaper));

      messageProcessor.release();

      await waitFor(() => (smsProvider.sent.length > 0 ? smsProvider.sent : null), 15_000);

      expect(smsProvider.sent).toHaveLength(1);
      expect(smsProvider.sent[0]).toMatchObject({ body: "Reply: overlap" });
    } finally {
      await consumer.close();
      await app.close();
    }
  });

  it("re-enqueues inbound when outbound is queued and the provider has no send record", async () => {
    const failingProvider = createThrowOnSendProvider(createFakeSmsProvider());
    const recoveryProvider = createFakeSmsProvider();
    const { app, pool: appPool, redis } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider: failingProvider },
    });

    const failingConsumer = createWorkerConsumer({
      pool: appPool,
      redis,
      smsProvider: failingProvider,
      messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
      reaperConfig: testReaperConfig,
    });

    try {
      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM-REAP-LOOKUP-MISS",
          from: "+15558008",
          to: "+15559999",
          body: "lookup miss",
        }),
      });

      const queuedOutbound = await waitFor(async () => {
        const messages = await listMessages(app);
        const outbound = messages.find((message) => message.direction === "outbound");
        return outbound?.status === "queued" ? outbound : null;
      }, 15_000);

      await waitForFailedJob(redis);

      await failingConsumer.close();

      await pool.query("UPDATE messages SET updated_at = updated_at - interval '1 minute' WHERE id = $1", [
        queuedOutbound.id,
      ]);

      const recoveryConsumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider: recoveryProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
        reaperConfig: testReaperConfig,
      });

      await recoveryConsumer.reaper.runOnce();

      await waitFor(() => (recoveryProvider.sent.length > 0 ? recoveryProvider.sent : null), 15_000);

      expect(recoveryProvider.sent).toHaveLength(1);
      expect(recoveryProvider.sent[0]).toMatchObject({ body: "Reply: lookup miss" });

      await recoveryConsumer.close();
    } finally {
      await app.close();
    }
  });

  it("coalesces concurrent reaper passes into a single scan", async () => {
    const smsProvider = createFakeSmsProvider();
    const { app, redis } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider, jobQueue: createSilentEnqueueJobQueue() },
    });

    let reenqueueCalls = 0;
    const countingQueue: JobQueue = {
      async enqueueAfterCommit() {},
      async reenqueueStaleInbound() {
        reenqueueCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "enqueued";
      },
    };

    const reaper = createReaper({
      pool,
      redis,
      smsProvider,
      config: testReaperConfig,
      jobQueue: countingQueue,
    });

    try {
      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM-REAP-COALESCE",
          from: "+15558010",
          to: "+15559999",
          body: "coalesce me",
        }),
      });

      await pool.query(
        "UPDATE messages SET created_at = created_at - interval '1 minute' WHERE provider_message_sid = $1",
        ["SM-REAP-COALESCE"],
      );

      await Promise.all([reaper.runOnce(), reaper.runOnce()]);

      expect(reenqueueCalls).toBe(1);
    } finally {
      reaper.stop();
      await app.close();
    }
  });

  it("ignores duplicate start calls", async () => {
    const smsProvider = createFakeSmsProvider();
    const { app, redis } = await buildApp({ env: baseEnv(infra), deps: { smsProvider } });
    const reaper = createReaper({
      pool,
      redis,
      smsProvider,
      config: { ...defaultReaperConfig, intervalMs: 60_000 },
    });

    try {
      reaper.start();
      reaper.start();

      await reaper.runOnce();
    } finally {
      reaper.stop();
      await reaper.drain();
      await app.close();
    }
  });

  it("continues a reaper pass when re-enqueue fails for one stale received message", async () => {
    const smsProvider = createFakeSmsProvider();
    const { app, redis } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider, jobQueue: createSilentEnqueueJobQueue() },
    });

    const reenqueuedSids: string[] = [];
    const selectiveQueue: JobQueue = {
      async enqueueAfterCommit() {},
      async reenqueueStaleInbound(payload) {
        if (payload.providerMessageSid === "SM-REAP-ERR-1") {
          throw new Error("redis unavailable");
        }
        reenqueuedSids.push(payload.providerMessageSid);
        return "enqueued";
      },
    };

    const reaper = createReaper({
      pool,
      redis,
      smsProvider,
      config: testReaperConfig,
      jobQueue: selectiveQueue,
    });

    try {
      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM-REAP-ERR-1",
          from: "+15558011",
          to: "+15559999",
          body: "first error",
        }),
      });

      await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM-REAP-ERR-2",
          from: "+15558012",
          to: "+15559999",
          body: "second ok",
        }),
      });

      await pool.query(
        "UPDATE messages SET created_at = created_at - interval '1 minute' WHERE provider_message_sid IN ($1, $2)",
        ["SM-REAP-ERR-1", "SM-REAP-ERR-2"],
      );

      await reaper.runOnce();

      expect(reenqueuedSids).toEqual(["SM-REAP-ERR-2"]);
    } finally {
      reaper.stop();
      await app.close();
    }
  });

  it("does not crash the worker when a reaper pass cannot reach postgres", async () => {
    const smsProvider = createFakeSmsProvider();
    const badPool = new pg.Pool({ connectionString: "postgresql://postgres:postgres@127.0.0.1:1/nope" });
    const { app, redis } = await buildApp({ env: baseEnv(infra), deps: { smsProvider } });

    const reaper = createReaper({
      pool: badPool,
      redis,
      smsProvider,
      config: testReaperConfig,
    });

    try {
      await expect(reaper.runOnce()).resolves.toBeUndefined();
    } finally {
      reaper.stop();
      await badPool.end();
      await app.close();
    }
  });

  it("still accepts messages when the worker is stopped and processes them once it returns", async () => {
    const smsProvider = createFakeSmsProvider();
    const { app, pool: appPool, redis } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider },
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/sms",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: twilioBody({
          messageSid: "SM-REAP-STOPPED",
          from: "+15558007",
          to: "+15559999",
          body: "while worker down",
        }),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ duplicate: false });
      expect(smsProvider.sent).toHaveLength(0);

      const messagesBeforeWorker = await listMessages(app);
      expect(messagesBeforeWorker).toEqual([
        expect.objectContaining({ direction: "inbound", status: "received" }),
      ]);

      const consumer = createWorkerConsumer({
        pool: appPool,
        redis,
        smsProvider,
        messageProcessor: createRuleBasedMessageProcessor({ delayMs: 0 }),
        reaperConfig: testReaperConfig,
      });

      await waitFor(() => (smsProvider.sent.length > 0 ? smsProvider.sent[0] : null), 15_000);

      expect(smsProvider.sent[0]).toMatchObject({ body: "Reply: while worker down" });

      await consumer.close();
    } finally {
      await app.close();
    }
  });
});
