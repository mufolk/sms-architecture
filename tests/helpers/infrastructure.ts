import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";

export type TestInfrastructure = {
  postgres: StartedPostgreSqlContainer;
  redis: StartedRedisContainer;
  databaseUrl: string;
  redisUrl: string;
  stop: () => Promise<void>;
};

export async function startTestInfrastructure(): Promise<TestInfrastructure> {
  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer("postgres:16-alpine").start(),
    new RedisContainer("redis:7-alpine").start(),
  ]);

  return {
    postgres,
    redis,
    databaseUrl: postgres.getConnectionUri(),
    redisUrl: redis.getConnectionUrl(),
    stop: async () => {
      await Promise.all([postgres.stop(), redis.stop()]);
    },
  };
}

export function baseEnv(infra: TestInfrastructure): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    PORT: "3000",
    DATABASE_URL: infra.databaseUrl,
    REDIS_URL: infra.redisUrl,
    LOG_LEVEL: "fatal",
  };
}
