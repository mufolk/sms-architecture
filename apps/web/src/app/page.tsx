import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Conversational SMS",
};

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Conversational SMS</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">Admin and reviewer tools</h1>
        <p className="mt-4 text-slate-300">
          Inspect conversations as the operator, or send messages from the dev handset to exercise
          the loop without Twilio.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin"
          className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition hover:border-indigo-500/40 hover:bg-slate-900"
        >
          <h2 className="text-lg font-medium text-white">Admin</h2>
          <p className="mt-2 text-sm text-slate-400">Conversation list and live thread view.</p>
        </Link>
        <Link
          href="/dev"
          className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition hover:border-indigo-500/40 hover:bg-slate-900"
        >
          <h2 className="text-lg font-medium text-white">Dev handset</h2>
          <p className="mt-2 text-sm text-slate-400">Send a message as any User Number.</p>
        </Link>
      </div>
    </main>
  );
}
