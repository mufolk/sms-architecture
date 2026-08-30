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

export type WorkerConsumerDeps = {
  pool: pg.Pool;
  redis: Redis;
  smsProvider: SmsProvider;
  messageProcessor: MessageProcessor;
};

export type WorkerConsumer = {
  worker: Worker<ProcessJobPayload>;
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

  return {
    worker,
    async close() {
      await worker.close();
    },
  };
}

export function createDefaultWorkerConsumer(
  pool: pg.Pool,
  redis: Redis,
  processingDelayMs: number,
): WorkerConsumer {
  return createWorkerConsumer({
    pool,
    redis,
    smsProvider: createFakeSmsProvider(),
    messageProcessor: createRuleBasedMessageProcessor({ delayMs: processingDelayMs }),
  });
}
