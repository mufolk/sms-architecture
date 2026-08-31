import type { ProcessJobPayload } from "../domain/types.js";

export type ReenqueueStaleInboundResult = "enqueued" | "skipped-live";

export type JobQueue = {
  enqueueAfterCommit(payload: ProcessJobPayload): Promise<void>;
  reenqueueStaleInbound(payload: ProcessJobPayload): Promise<ReenqueueStaleInboundResult>;
};
