import { Redis } from "ioredis";

export type CreateBullMqRedisOptions = {
  lazyConnect?: boolean;
  connectTimeout?: number;
  enableOfflineQueue?: boolean;
};

export function createBullMqRedis(
  url: string,
  options: CreateBullMqRedisOptions = {},
): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    lazyConnect: options.lazyConnect ?? true,
    ...(options.connectTimeout !== undefined ? { connectTimeout: options.connectTimeout } : {}),
    ...(options.enableOfflineQueue !== undefined
      ? { enableOfflineQueue: options.enableOfflineQueue }
      : {}),
  });
}
