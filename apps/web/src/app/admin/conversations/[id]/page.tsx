import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThreadView } from "../../../../components/ThreadView";
import { fetchConversation, fetchThreadMessages } from "../../../../lib/api";
import { formatLoadError } from "../../../../lib/format-load-error";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("(404)");
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Conversation ${id} — Conversational SMS` };
}

export default async function ConversationThreadPage({ params }: PageProps) {
  const { id } = await params;

  let loadError: string | null = null;
  let conversation: Awaited<ReturnType<typeof fetchConversation>> | undefined;
  let messages: Awaited<ReturnType<typeof fetchThreadMessages>> = [];

  try {
    const [threadMessages, conversationResult] = await Promise.all([
      fetchThreadMessages(id),
      fetchConversation(id),
    ]);
    messages = threadMessages;
    conversation = conversationResult;
  } catch (loadErrorCandidate) {
    if (isNotFoundError(loadErrorCandidate)) {
      notFound();
    }
    loadError = formatLoadError(loadErrorCandidate);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <Link href="/admin" className="text-sm text-indigo-300 hover:text-indigo-200">
          ← Back to conversations
        </Link>
        <h1 className="mt-4 text-3xl font-semibold text-white">Conversation</h1>
        {conversation ? (
          <p className="mt-2 text-sm text-slate-400">
            {conversation.userNumber} texting {conversation.inboundNumber}
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-400">Conversation {id}</p>
        )}
      </div>

      {loadError ? (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {loadError}
        </p>
      ) : null}

      {!loadError ? <ThreadView conversationId={id} initialMessages={messages} /> : null}
    </main>
  );
}
