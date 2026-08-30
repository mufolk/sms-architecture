import { NextResponse } from "next/server";

export async function proxyApiGet(path: string): Promise<NextResponse> {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "API_URL is not configured" }, { status: 500 });
  }

  try {
    const response = await fetch(`${apiUrl}${path}`, { cache: "no-store" });
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the API" }, { status: 502 });
  }
}
