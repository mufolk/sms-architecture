export type SendSmsParams = {
  to: string;
  from: string;
  body: string;
  idempotencyKey: string;
};

export type SendSmsResult = {
  providerMessageSid: string;
};

export type SmsProvider = {
  readonly name: string;
  verifySignature(_headers: Record<string, string | string[] | undefined>, _body: string): boolean;
  send(params: SendSmsParams): Promise<SendSmsResult>;
  lookupByIdempotencyKey(idempotencyKey: string): Promise<SendSmsResult | null>;
};
