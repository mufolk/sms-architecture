import { proxyApiGet } from "../../../../../../lib/proxy-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyApiGet(`/conversations/${id}/messages`);
}
