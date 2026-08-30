import { Redis } from "ioredis";
import type { Env } from "./env.js";

export function createRedis(env: Env): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
}

export async function checkRedis(redisUrl: string): Promise<boolean> {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: 1_000,
  });

  try {
    const response = await redis.ping();
    return response === "PONG";
  } catch {
    return false;
  } finally {
    redis.disconnect();
  }
}
