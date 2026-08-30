export function parseTwilioWebhookBody(body: string): {
  providerMessageSid: string;
  userNumber: string;
  inboundNumber: string;
  body: string;
  rawPayload: Record<string, string>;
} {
  const params = new URLSearchParams(body);
  const providerMessageSid = params.get("MessageSid");
  const userNumber = params.get("From");
  const inboundNumber = params.get("To");
  const messageBody = params.get("Body");

  if (!providerMessageSid || !userNumber || !inboundNumber || messageBody === null) {
    throw new InvalidTwilioWebhookPayloadError();
  }

  const rawPayload: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    rawPayload[key] = value;
  }

  return {
    providerMessageSid,
    userNumber,
    inboundNumber,
    body: messageBody,
    rawPayload,
  };
}

export class InvalidTwilioWebhookPayloadError extends Error {
  constructor() {
    super("Invalid Twilio webhook payload");
    this.name = "InvalidTwilioWebhookPayloadError";
  }
}
