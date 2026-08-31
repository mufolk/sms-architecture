import type { Redis } from "ioredis";
import type pg from "pg";
import { createBullMqJobQueue } from "@conversational-sms/core/adapters/bullmq-job-queue";
import { createDrizzleMessageRepository } from "@conversational-sms/core/adapters/drizzle-repositories";
import {
  runReaperPass,
  type ReaperLogger,
  type ReaperThresholds,
} from "@conversational-sms/core/use-cases/run-reaper-pass";
import type { JobQueue } from "@conversational-sms/core/ports/job-queue";
import type { SmsProvider } from "@conversational-sms/core/ports/sms-provider";

export type ReaperConfig = ReaperThresholds & {
  intervalMs: number;
};

export type ReaperDeps = {
  pool: pg.Pool;
  redis: Redis;
  smsProvider: SmsProvider;
  config: ReaperConfig;
  log?: ReaperLogger;
  jobQueue?: JobQueue;
};

export type Reaper = {
  runOnce(): Promise<void>;
  start(): void;
  stop(): void;
  drain(): Promise<void>;
};

export const defaultReaperConfig: ReaperConfig = {
  intervalMs: 10_000,
  receivedThresholdMs: 30_000,
  jobTimeoutMs: 30_000,
  sendTimeoutMs: 30_000,
};

export function createReaper(deps: ReaperDeps): Reaper {
  const messageRepository = createDrizzleMessageRepository(deps.pool);
  const jobQueue = deps.jobQueue ?? createBullMqJobQueue(deps.redis);
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight: Promise<void> | null = null;
  let stopped = false;

  const executePass = async () => {
    try {
      await runReaperPass(
        {
          messageRepository,
          jobQueue,
          smsProvider: deps.smsProvider,
          log: deps.log,
        },
        deps.config,
      );
    } catch (error) {
      deps.log?.error({ err: error }, "reaper pass failed");
    }
  };

  const runOnce = async () => {
    if (inFlight) {
      return inFlight;
    }

    inFlight = executePass().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };

  return {
    runOnce,
    start() {
      if (timer || stopped) {
        return;
      }
      timer = setInterval(() => {
        void runOnce();
      }, deps.config.intervalMs);
    },
    stop() {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    async drain() {
      if (inFlight) {
        await inFlight;
      }
    },
  };
}
