import { randomUUID } from "node:crypto";
import type { SendSmsParams, SendSmsResult, SmsProvider } from "../ports/sms-provider.js";

export type SentMessage = SendSmsParams & {
  providerMessageSid: string;
};

export type FakeSmsProvider = SmsProvider & {
  sent: SentMessage[];
  reset(): void;
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
    sent,
    reset() {
      sent.length = 0;
    },
  };
}
