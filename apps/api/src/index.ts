import Fastify from "fastify";
import { loadEnv } from "./env.js";
import { checkPostgres, createPool } from "./db.js";
import { checkRedis, createRedis } from "./redis.js";
import { createBullMqJobQueue } from "@conversational-sms/core/adapters/bullmq-job-queue";
import {
  createDrizzleConversationRepository,
  createDrizzleMessageRepository,
} from "@conversational-sms/core/adapters/drizzle-repositories";
import { createFakeSmsProvider } from "@conversational-sms/core/adapters/fake-sms-provider";
import { registerConversationRoutes } from "./routes/conversations.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import type { AppDeps } from "./deps.js";

export type BuildAppOptions = {
  env?: NodeJS.ProcessEnv;
  deps?: Partial<AppDeps>;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const env = loadEnv(options.env ?? process.env);
  const pool = createPool(env);
  const redis = createRedis(env);

  const smsProvider = options.deps?.smsProvider ?? createFakeSmsProvider();
  const conversationRepository =
    options.deps?.conversationRepository ?? createDrizzleConversationRepository(pool);
  const messageRepository =
    options.deps?.messageRepository ?? createDrizzleMessageRepository(pool);
  const jobQueue = options.deps?.jobQueue ?? createBullMqJobQueue(redis);

  const deps: AppDeps = {
    smsProvider,
    conversationRepository,
    messageRepository,
    jobQueue,
  };

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      done(null, body);
    },
  );

  app.get("/health", async (_request, reply) => {
    return reply.status(200).send({ status: "ok" });
  });

  app.get("/ready", async (_request, reply) => {
    const [postgresReady, redisReady] = await Promise.all([
      checkPostgres(pool),
      checkRedis(env.REDIS_URL),
    ]);

    if (!postgresReady || !redisReady) {
      return reply.status(503).send({
        status: "not ready",
        postgres: postgresReady,
        redis: redisReady,
      });
    }

    return reply.status(200).send({
      status: "ready",
      postgres: true,
      redis: true,
    });
  });

  await registerWebhookRoutes(app, deps);
  await registerConversationRoutes(app, deps);

  app.addHook("onClose", async () => {
    try {
      await redis.quit();
    } catch {
      // Redis may never have connected in failure-path tests.
    }
    await pool.end();
  });

  return { app, env, pool, redis, deps };
}
