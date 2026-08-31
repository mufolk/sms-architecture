import { Worker } from "bullmq";
import type { Redis } from "ioredis";
import type pg from "pg";
import { PROCESS_INBOUND_QUEUE } from "@conversational-sms/core/adapters/bullmq-job-queue";
import {
  createDrizzleConversationRepository,
  createDrizzleMessageRepository,
} from "@conversational-sms/core/adapters/drizzle-repositories";
import { createFakeSmsProvider } from "@conversational-sms/core/adapters/fake-sms-provider";
import { processInboundMessage } from "@conversational-sms/core/use-cases/process-inbound-message";
import type { ProcessJobPayload } from "@conversational-sms/core/domain/types";
import type { MessageProcessor } from "@conversational-sms/core/ports/message-processor";
import type { SmsProvider } from "@conversational-sms/core/ports/sms-provider";
import { createRuleBasedMessageProcessor } from "./processor/rule-based-message-processor.js";
import type { ReaperLogger } from "@conversational-sms/core/use-cases/run-reaper-pass";
import { createReaper, defaultReaperConfig, type Reaper, type ReaperConfig } from "./reaper.js";

export type WorkerConsumerDeps = {
  pool: pg.Pool;
  redis: Redis;
  smsProvider: SmsProvider;
  messageProcessor: MessageProcessor;
  reaperConfig?: ReaperConfig;
  log?: ReaperLogger;
};

export type WorkerConsumer = {
  worker: Worker<ProcessJobPayload>;
  reaper: Reaper;
  close(): Promise<void>;
};

export function createWorkerConsumer(deps: WorkerConsumerDeps): WorkerConsumer {
  const conversationRepository = createDrizzleConversationRepository(deps.pool);
  const messageRepository = createDrizzleMessageRepository(deps.pool);

  const worker = new Worker<ProcessJobPayload>(
    PROCESS_INBOUND_QUEUE,
    async (job) => {
      await processInboundMessage(
        {
          smsProvider: deps.smsProvider,
          conversationRepository,
          messageRepository,
          messageProcessor: deps.messageProcessor,
        },
        job.data,
      );
    },
    {
      connection: deps.redis,
    },
  );

  const reaper = createReaper({
    pool: deps.pool,
    redis: deps.redis,
    smsProvider: deps.smsProvider,
    config: deps.reaperConfig ?? defaultReaperConfig,
    log: deps.log,
  });

  reaper.start();

  return {
    worker,
    reaper,
    async close() {
      reaper.stop();
      await reaper.drain();
      await worker.close();
    },
  };
}

export function createDefaultWorkerConsumer(
  pool: pg.Pool,
  redis: Redis,
  env: {
    PROCESSING_DELAY_MS: number;
    REAPER_INTERVAL_MS: number;
    REAPER_RECEIVED_THRESHOLD_MS: number;
    REAPER_JOB_TIMEOUT_MS: number;
    REAPER_SEND_TIMEOUT_MS: number;
  },
  log?: ReaperLogger,
): WorkerConsumer {
  return createWorkerConsumer({
    pool,
    redis,
    smsProvider: createFakeSmsProvider(),
    messageProcessor: createRuleBasedMessageProcessor({ delayMs: env.PROCESSING_DELAY_MS }),
    reaperConfig: {
      intervalMs: env.REAPER_INTERVAL_MS,
      receivedThresholdMs: env.REAPER_RECEIVED_THRESHOLD_MS,
      jobTimeoutMs: env.REAPER_JOB_TIMEOUT_MS,
      sendTimeoutMs: env.REAPER_SEND_TIMEOUT_MS,
    },
    log,
  });
}
