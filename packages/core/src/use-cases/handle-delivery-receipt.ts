import { randomUUID } from "node:crypto";
import { IllegalStatusTransitionError } from "../domain/status-transitions.js";
import type { OutboundStatus } from "../domain/types.js";
import type { MessageRepository } from "../ports/message-repository.js";
import type { SmsProvider } from "../ports/sms-provider.js";

export type DeliveryReceiptPayload = {
  providerMessageSid: string;
  messageStatus: OutboundStatus;
  errorCode: string | null;
};

export type DeliveryReceiptLogger = {
  info(payload: Record<string, unknown>, message: string): void;
};

export type HandleDeliveryReceiptDeps = {
  smsProvider: SmsProvider;
  messageRepository: MessageRepository;
  log?: DeliveryReceiptLogger;
};

export type HandleDeliveryReceiptInput = {
  payload: DeliveryReceiptPayload;
};

export async function handleDeliveryReceipt(
  deps: HandleDeliveryReceiptDeps,
  input: HandleDeliveryReceiptInput,
): Promise<void> {
  const message = await deps.messageRepository.findByProviderSid(
    deps.smsProvider.name,
    input.payload.providerMessageSid,
  );

  if (!message) {
    return;
  }

  try {
    await deps.messageRepository.transitionStatus({
      messageId: message.id,
      toStatus: input.payload.messageStatus,
      reason: "delivery-receipt",
      correlationId: randomUUID(),
      errorCode: input.payload.errorCode,
    });
  } catch (error) {
    if (error instanceof IllegalStatusTransitionError) {
      deps.log?.info(
        {
          messageId: message.id,
          providerMessageSid: input.payload.providerMessageSid,
          fromStatus: error.fromStatus,
          toStatus: error.toStatus,
        },
        "delivery receipt rejected: illegal status transition",
      );
      return;
    }
    throw error;
  }
}
