import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { JobQueue, ReenqueueStaleInboundResult } from "../ports/job-queue.js";
import type { ProcessJobPayload } from "../domain/types.js";

export const PROCESS_INBOUND_QUEUE = "process-inbound";

// Keep in sync with jobOptions(): if enqueue gains priority or parent/child jobs,
// add the corresponding BullMQ states here so live work is never removed.
const LIVE_JOB_STATES = new Set(["active", "waiting", "delayed"]);

export type BullMqJobQueue = JobQueue & {
  queue: Queue<ProcessJobPayload>;
};

function jobOptions(payload: ProcessJobPayload) {
  return {
    jobId: payload.providerMessageSid,
    attempts: 5,
    backoff: {
      type: "fixed" as const,
      delay: 100,
    },
  };
}

export function createBullMqJobQueue(redis: Redis): BullMqJobQueue {
  const queue = new Queue<ProcessJobPayload>(PROCESS_INBOUND_QUEUE, {
    connection: redis,
  });

  return {
    queue,
    async enqueueAfterCommit(payload) {
      await queue.add("process-inbound", payload, jobOptions(payload));
    },
    async reenqueueStaleInbound(payload): Promise<ReenqueueStaleInboundResult> {
      const existing = await queue.getJob(payload.providerMessageSid);
      if (existing) {
        const state = await existing.getState();
        if (LIVE_JOB_STATES.has(state)) {
          return "skipped-live";
        }
        await existing.remove();
      }

      await queue.add("process-inbound", payload, jobOptions(payload));
      return "enqueued";
    },
  };
}
