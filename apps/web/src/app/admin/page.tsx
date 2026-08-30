import type { Metadata } from "next";
import Link from "next/link";
import { fetchConversations } from "../../lib/api";
import { formatLoadError } from "../../lib/format-load-error";
import { formatWhen } from "../../lib/format-when";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conversations — Conversational SMS",
};

export default async function AdminPage() {
  let conversations: Awaited<ReturnType<typeof fetchConversations>> = [];
  let error: string | null = null;

  try {
    conversations = await fetchConversations();
  } catch (loadError) {
    error = formatLoadError(loadError);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Operator</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Conversations</h1>
        <p className="mt-2 text-sm text-slate-400">Ordered by most recent inbound activity.</p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : conversations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-700 px-6 py-10 text-center text-sm text-slate-400">
          No conversations yet. Send a message from the dev handset.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Inbound Number</th>
                <th className="px-4 py-3 font-medium">User Number</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">Last inbound (UTC)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950/40">
              {conversations.map((conversation) => (
                <tr key={conversation.id} className="transition hover:bg-slate-900/60">
                  <td className="px-4 py-4 text-slate-200">{conversation.inboundNumber}</td>
                  <td className="px-4 py-4">
                    <Link
                      href={`/admin/conversations/${conversation.id}`}
                      className="font-medium text-indigo-300 hover:text-indigo-200"
                    >
                      {conversation.userNumber}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-400">
                    {formatWhen(conversation.lastMessageAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
