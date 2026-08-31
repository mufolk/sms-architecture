export type TwilioDeliveryReceiptStatus = "delivered" | "undelivered" | "failed";

export function parseTwilioStatusWebhookBody(body: string): {
  providerMessageSid: string;
  messageStatus: string;
  errorCode: string | null;
  rawPayload: Record<string, string>;
} {
  const params = new URLSearchParams(body);
  const providerMessageSid = params.get("MessageSid");
  const messageStatus = params.get("MessageStatus") ?? params.get("SmsStatus");

  if (!providerMessageSid || !messageStatus) {
    throw new InvalidTwilioStatusWebhookPayloadError();
  }

  const rawPayload: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    rawPayload[key] = value;
  }

  return {
    providerMessageSid,
    messageStatus,
    errorCode: params.get("ErrorCode"),
    rawPayload,
  };
}

export function mapTwilioMessageStatus(
  messageStatus: string,
): TwilioDeliveryReceiptStatus | "ignored" {
  switch (messageStatus) {
    case "delivered":
    case "undelivered":
    case "failed":
      return messageStatus;
    default:
      return "ignored";
  }
}

export class InvalidTwilioStatusWebhookPayloadError extends Error {
  constructor() {
    super("Invalid Twilio status webhook payload");
    this.name = "InvalidTwilioStatusWebhookPayloadError";
  }
}
