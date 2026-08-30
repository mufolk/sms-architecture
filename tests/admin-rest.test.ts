import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../packages/core/src/migrate.js";
import { buildApp } from "../apps/api/src/index.js";
import { createFakeSmsProvider } from "../packages/core/src/adapters/fake-sms-provider.js";
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

async function postInbound(
  app: Awaited<ReturnType<typeof buildApp>>["app"],
  params: { messageSid: string; from: string; to: string; body: string },
): Promise<void> {
  await app.inject({
    method: "POST",
    url: "/webhooks/sms",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: twilioBody(params),
  });
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

describe("admin REST", () => {
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

  it("lists conversations by most recent activity using lastMessageAt on the conversation", async () => {
    const smsProvider = createFakeSmsProvider();
    const { app } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider },
    });

    try {
      await postInbound(app, {
        messageSid: "SM-ORDER-1",
        from: "+15551001",
        to: "+15559999",
        body: "older thread",
      });

      await postInbound(app, {
        messageSid: "SM-ORDER-2",
        from: "+15551002",
        to: "+15559999",
        body: "newer thread",
      });

      const firstList = await app.inject({ method: "GET", url: "/conversations" });
      const { conversations: initial } = firstList.json<{
        conversations: Array<{
          id: string;
          inboundNumber: string;
          userNumber: string;
          lastMessageAt: string;
        }>;
      }>();

      expect(initial).toHaveLength(2);
      expect(initial[0]!.userNumber).toBe("+15551002");
      expect(initial[1]!.userNumber).toBe("+15551001");
      expect(new Date(initial[0]!.lastMessageAt).getTime()).toBeGreaterThan(
        new Date(initial[1]!.lastMessageAt).getTime(),
      );

      await postInbound(app, {
        messageSid: "SM-ORDER-3",
        from: "+15551001",
        to: "+15559999",
        body: "bumps older thread",
      });

      const secondList = await app.inject({ method: "GET", url: "/conversations" });
      const { conversations: reordered } = secondList.json<{
        conversations: Array<{ id: string; userNumber: string }>;
      }>();

      expect(reordered[0]!.userNumber).toBe("+15551001");
      expect(reordered[0]!.id).toBe(initial[1]!.id);
      expect(reordered[1]!.userNumber).toBe("+15551002");
    } finally {
      await app.close();
    }
  });

  it("returns a single conversation by id", async () => {
    const smsProvider = createFakeSmsProvider();
    const { app } = await buildApp({
      env: baseEnv(infra),
      deps: { smsProvider },
    });

    try {
      await postInbound(app, {
        messageSid: "SM-SINGLE-1",
        from: "+15553001",
        to: "+15557777",
        body: "single conversation",
      });

      const listResponse = await app.inject({ method: "GET", url: "/conversations" });
      const { conversations } = listResponse.json<{
        conversations: Array<{ id: string; userNumber: string; inboundNumber: string }>;
      }>();

      const detailResponse = await app.inject({
        method: "GET",
        url: `/conversations/${conversations[0]!.id}`,
      });

      expect(detailResponse.statusCode).toBe(200);
      expect(detailResponse.json()).toEqual({
        conversation: {
          id: conversations[0]!.id,
          inboundNumber: "+15557777",
          userNumber: "+15553001",
          lastMessageAt: expect.any(String),
          needsAttention: false,
          createdAt: expect.any(String),
        },
      });
    } finally {
      await app.close();
    }
  });

  it("returns the thread with direction, status, and inReplyTo for each message", async () => {
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
      await postInbound(app, {
        messageSid: "SM-THREAD-1",
        from: "+15552001",
        to: "+15558888",
        body: "hello admin",
      });

      await waitFor(() => (smsProvider.sent.length > 0 ? true : null));

      const listResponse = await app.inject({ method: "GET", url: "/conversations" });
      const { conversations } = listResponse.json<{ conversations: Array<{ id: string }> }>();

      const threadResponse = await app.inject({
        method: "GET",
        url: `/conversations/${conversations[0]!.id}/messages`,
      });
      const { messages } = threadResponse.json<{
        messages: Array<{
          id: string;
          direction: string;
          status: string;
          body: string;
          inReplyTo: string | null;
        }>;
      }>();

      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({
        direction: "inbound",
        status: "processed",
        body: "hello admin",
        inReplyTo: null,
      });
      expect(messages[1]).toMatchObject({
        direction: "outbound",
        status: "sent",
        body: "Reply: hello admin",
        inReplyTo: messages[0]!.id,
      });
    } finally {
      await consumer.close();
      await app.close();
    }
  });
});
