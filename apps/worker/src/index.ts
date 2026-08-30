import pino from "pino";
import pg from "pg";
import { Redis } from "ioredis";
import { loadEnv } from "./env.js";
import { createDefaultWorkerConsumer } from "./consumer.js";

async function main() {
  const env = loadEnv();
  const log = pino({ level: env.LOG_LEVEL });
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  const redis = new Redis(env.REDIS_URL);

  const consumer = createDefaultWorkerConsumer(pool, redis, env.PROCESSING_DELAY_MS);
  log.info("Worker consumer started");

  async function shutdown() {
    log.info("Worker shutting down");
    await consumer.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
