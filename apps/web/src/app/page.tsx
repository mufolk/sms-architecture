export const dynamic = "force-dynamic";

type ReadyResponse = {
  status: string;
  postgres?: boolean;
  redis?: boolean;
};

async function fetchApiReady(apiUrl: string): Promise<{ ok: boolean; detail: ReadyResponse | null; error?: string }> {
  try {
    const response = await fetch(`${apiUrl}/ready`, { cache: "no-store" });

    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as ReadyResponse | null;
      return { ok: false, detail, error: `API returned ${response.status}` };
    }

    const detail = (await response.json()) as ReadyResponse;
    return { ok: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, detail: null, error: message };
  }
}

export default async function HomePage() {
  const apiUrl = process.env.API_URL ?? "";
  const result = await fetchApiReady(apiUrl);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Conversational SMS</p>
        <h1 className="mt-2 text-3xl font-semibold">Walking skeleton</h1>
        <p className="mt-3 text-slate-300">
          This page confirms the web app can reach the API readiness endpoint.
        </p>
      </div>

      <section
        className={`rounded-xl border p-6 ${
          result.ok ? "border-emerald-500/40 bg-emerald-500/10" : "border-rose-500/40 bg-rose-500/10"
        }`}
      >
        <h2 className="text-lg font-medium">{result.ok ? "API reachable" : "API unreachable"}</h2>
        {result.ok && result.detail ? (
          <ul className="mt-4 space-y-2 text-sm text-slate-200">
            <li>Status: {result.detail.status}</li>
            <li>Postgres: {result.detail.postgres ? "ready" : "not ready"}</li>
            <li>Redis: {result.detail.redis ? "ready" : "not ready"}</li>
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-200">{result.error ?? "Could not reach the API."}</p>
        )}
      </section>
    </main>
  );
}
