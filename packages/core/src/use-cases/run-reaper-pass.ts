import { randomUUID } from "node:crypto";
import type { JobQueue } from "../ports/job-queue.js";
import type { MessageRepository } from "../ports/message-repository.js";
import type { Message } from "../domain/types.js";
import type { SmsProvider } from "../ports/sms-provider.js";

export type ReaperThresholds = {
  receivedThresholdMs: number;
  jobTimeoutMs: number;
  sendTimeoutMs: number;
};

export type ReaperLogger = {
  info(payload: Record<string, unknown>, message: string): void;
  error(payload: Record<string, unknown>, message: string): void;
};

export type RunReaperPassDeps = {
  messageRepository: MessageRepository;
  jobQueue: JobQueue;
  smsProvider: SmsProvider;
  log?: ReaperLogger;
};

async function reenqueueInbound(
  deps: RunReaperPassDeps,
  inbound: Message,
  reason: "received-stale" | "processing-stale" | "outbound-lookup-miss",
): Promise<void> {
  const result = await deps.jobQueue.reenqueueStaleInbound({
    messageId: inbound.id,
    conversationId: inbound.conversationId,
    correlationId: randomUUID(),
    providerMessageSid: inbound.providerMessageSid,
  });

  deps.log?.info(
    {
      messageId: inbound.id,
      providerMessageSid: inbound.providerMessageSid,
      reason,
      result,
    },
    "reaper re-enqueued inbound message",
  );
}

async function withScanItemErrorHandling(
  deps: RunReaperPassDeps,
  context: Record<string, unknown>,
  message: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    deps.log?.error({ err: error, ...context }, message);
  }
}

export async function runReaperPass(
  deps: RunReaperPassDeps,
  thresholds: ReaperThresholds,
  now: Date = new Date(),
): Promise<void> {
  const receivedCutoff = new Date(now.getTime() - thresholds.receivedThresholdMs);
  const processingCutoff = new Date(now.getTime() - thresholds.jobTimeoutMs);
  const sendCutoff = new Date(now.getTime() - thresholds.sendTimeoutMs);

  const staleQueuedOutbound = await deps.messageRepository.findStaleOutboundQueued(sendCutoff);
  for (const outbound of staleQueuedOutbound) {
    await withScanItemErrorHandling(
      deps,
      { outboundMessageId: outbound.id },
      "reaper outbound scan failed",
      async () => {
        const providerResult = await deps.smsProvider.lookupByIdempotencyKey(outbound.id);
        if (providerResult) {
          const correlationId = randomUUID();
          await deps.messageRepository.transitionStatus({
            messageId: outbound.id,
            toStatus: "sent",
            reason: "reaper-reconcile",
            correlationId,
            providerMessageSid: providerResult.providerMessageSid,
          });
          if (outbound.inReplyTo) {
            const inbound = await deps.messageRepository.findById(outbound.inReplyTo);
            if (inbound && inbound.status !== "processed") {
              await deps.messageRepository.transitionStatus({
                messageId: outbound.inReplyTo,
                toStatus: "processed",
                reason: "reaper-reconcile",
                correlationId,
              });
            }
          }
          deps.log?.info(
            {
              outboundMessageId: outbound.id,
              providerMessageSid: providerResult.providerMessageSid,
            },
            "reaper reconciled queued outbound from provider lookup",
          );
          return;
        }

        if (!outbound.inReplyTo) {
          return;
        }

        const inbound = await deps.messageRepository.findById(outbound.inReplyTo);
        if (!inbound) {
          return;
        }

        await reenqueueInbound(deps, inbound, "outbound-lookup-miss");
      },
    );
  }

  const staleReceived = await deps.messageRepository.findStaleInboundReceived(receivedCutoff);
  for (const inbound of staleReceived) {
    await withScanItemErrorHandling(
      deps,
      { messageId: inbound.id },
      "reaper received scan failed",
      async () => {
        await reenqueueInbound(deps, inbound, "received-stale");
      },
    );
  }

  const staleProcessing = await deps.messageRepository.findStaleInboundProcessing(processingCutoff);
  for (const inbound of staleProcessing) {
    await withScanItemErrorHandling(
      deps,
      { messageId: inbound.id },
      "reaper processing scan failed",
      async () => {
        await reenqueueInbound(deps, inbound, "processing-stale");
      },
    );
  }
}
