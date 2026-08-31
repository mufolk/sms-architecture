import { NextResponse } from "next/server";
import { z } from "zod";

const receiptSchema = z.object({
  providerMessageSid: z.string().min(1),
  status: z.enum(["delivered", "undelivered", "failed"]),
  errorCode: z.string().min(1).optional(),
});

function buildTwilioStatusBody(params: {
  providerMessageSid: string;
  status: "delivered" | "undelivered" | "failed";
  errorCode?: string;
}): string {
  const fields: Record<string, string> = {
    MessageSid: params.providerMessageSid,
    MessageStatus: params.status,
    SmsStatus: params.status,
  };
  if (params.errorCode) {
    fields.ErrorCode = params.errorCode;
  }
  return new URLSearchParams(fields).toString();
}

export async function POST(request: Request) {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "API_URL is not configured" }, { status: 500 });
  }

  const parsed = receiptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  try {
    const response = await fetch(`${apiUrl}/webhooks/status`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: buildTwilioStatusBody(parsed.data),
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        { error: "status webhook failed", detail },
        { status: response.status },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not reach the API" }, { status: 502 });
  }
}
