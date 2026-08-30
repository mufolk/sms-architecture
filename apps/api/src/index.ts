import Fastify from "fastify";
import { loadEnv } from "./env.js";
import { checkPostgres, createPool } from "./db.js";
import { checkRedis, createRedis } from "./redis.js";

export async function buildApp(envSource: NodeJS.ProcessEnv = process.env) {
  const env = loadEnv(envSource);
  const pool = createPool(env);
  const redis = createRedis(env);

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  app.get("/health", async (_request, reply) => {
    return reply.status(200).send({ status: "ok" });
  });

  app.get("/ready", async (_request, reply) => {
    const [postgresReady, redisReady] = await Promise.all([
      checkPostgres(pool),
      checkRedis(redis),
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

  app.addHook("onClose", async () => {
    await redis.quit();
    await pool.end();
  });

  return { app, env, pool, redis };
}
