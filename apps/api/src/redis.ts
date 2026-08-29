import { Redis } from "ioredis";
import type { Env } from "./env.js";

export function createRedis(env: Env): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
}

export async function checkRedis(redis: Redis): Promise<boolean> {
  try {
    const response = await redis.ping();
    return response === "PONG";
  } catch {
    return false;
  }
}
