import { createBullMqRedis } from "@conversational-sms/core/adapters/bullmq-redis";
import type { Redis } from "ioredis";

export function createWorkerRedis(redisUrl: string): Redis {
  return createBullMqRedis(redisUrl, { lazyConnect: false });
}
