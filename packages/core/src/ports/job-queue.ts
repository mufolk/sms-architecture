import type { ProcessJobPayload } from "../domain/types.js";

export type JobQueue = {
  enqueueAfterCommit(payload: ProcessJobPayload): Promise<void>;
};
