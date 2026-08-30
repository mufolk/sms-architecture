import { NextResponse } from "next/server";
import { z } from "zod";

const sendSchema = z.object({
  userNumber: z.string().min(1),
  inboundNumber: z.string().min(1),
  body: z.string(),
  messageSid: z.string().min(1).optional(),
});

function buildTwilioBody(params: {
  userNumber: string;
  inboundNumber: string;
  body: string;
  messageSid: string;
}): string {
  return new URLSearchParams({
    MessageSid: params.messageSid,
    From: params.userNumber,
    To: params.inboundNumber,
    Body: params.body,
  }).toString();
}

export async function POST(request: Request) {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "API_URL is not configured" }, { status: 500 });
  }

  const parsed = sendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const messageSid = parsed.data.messageSid ?? `DEV-${crypto.randomUUID()}`;

  try {
    const response = await fetch(`${apiUrl}/webhooks/sms`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: buildTwilioBody({ ...parsed.data, messageSid }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        { error: "webhook failed", detail },
        { status: response.status },
      );
    }

    const webhookResult = (await response.json()) as { duplicate?: boolean };
    return NextResponse.json({
      ok: true,
      messageSid,
      duplicate: webhookResult.duplicate ?? false,
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the API" }, { status: 502 });
  }
}
