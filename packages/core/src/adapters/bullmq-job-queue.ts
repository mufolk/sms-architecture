import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { JobQueue } from "../ports/job-queue.js";
import type { ProcessJobPayload } from "../domain/types.js";

export const PROCESS_INBOUND_QUEUE = "process-inbound";

export type BullMqJobQueue = JobQueue & {
  queue: Queue<ProcessJobPayload>;
};

export function createBullMqJobQueue(redis: Redis): BullMqJobQueue {
  const queue = new Queue<ProcessJobPayload>(PROCESS_INBOUND_QUEUE, {
    connection: redis,
  });

  return {
    queue,
    async enqueueAfterCommit(payload) {
      await queue.add("process-inbound", payload, {
        jobId: payload.providerMessageSid,
        attempts: 5,
        backoff: {
          type: "fixed",
          delay: 100,
        },
      });
    },
  };
}
