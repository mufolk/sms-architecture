import { randomUUID } from "node:crypto";
import type { SendSmsParams, SendSmsResult, SmsProvider } from "../ports/sms-provider.js";

export type SentMessage = SendSmsParams & {
  providerMessageSid: string;
};

export type DeliveryReceiptStatus = "delivered" | "undelivered" | "failed";

export type FakeSmsProvider = SmsProvider & {
  sent: SentMessage[];
  reset(): void;
  emitDeliveryReceipt(params: {
    statusCallbackUrl: string;
    providerMessageSid: string;
    status: DeliveryReceiptStatus;
    errorCode?: string;
  }): Promise<void>;
};

export function createFakeSmsProvider(): FakeSmsProvider {
  const sent: SentMessage[] = [];

  return {
    name: "fake",
    verifySignature() {
      return true;
    },
    async send(params: SendSmsParams): Promise<SendSmsResult> {
      const existing = sent.find((message) => message.idempotencyKey === params.idempotencyKey);
      if (existing) {
        return { providerMessageSid: existing.providerMessageSid };
      }

      const providerMessageSid = `FAKE${randomUUID().replace(/-/g, "")}`;
      sent.push({ ...params, providerMessageSid });
      return { providerMessageSid };
    },
    async lookupByIdempotencyKey(idempotencyKey: string): Promise<SendSmsResult | null> {
      const existing = sent.find((message) => message.idempotencyKey === idempotencyKey);
      return existing ? { providerMessageSid: existing.providerMessageSid } : null;
    },
    async emitDeliveryReceipt(params) {
      const fields: Record<string, string> = {
        MessageSid: params.providerMessageSid,
        MessageStatus: params.status,
        SmsStatus: params.status,
      };
      if (params.errorCode) {
        fields.ErrorCode = params.errorCode;
      }

      const response = await fetch(params.statusCallbackUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields).toString(),
      });

      if (!response.ok) {
        throw new Error(`Delivery receipt callback failed (${response.status})`);
      }
    },
    sent,
    reset() {
      sent.length = 0;
    },
  };
}
