import { proxyApiGet } from "../../../../lib/proxy-api";

export async function GET() {
  return proxyApiGet("/conversations");
}
