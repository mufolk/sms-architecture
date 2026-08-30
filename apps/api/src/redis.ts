import { Redis } from "ioredis";
import { createBullMqRedis } from "@conversational-sms/core/adapters/bullmq-redis";
import type { Env } from "./env.js";

export function createRedis(env: Env): Redis {
  return createBullMqRedis(env.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 2_000,
    enableOfflineQueue: false,
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
