import type { Metadata } from "next";
import { DevHandsetForm } from "../../components/DevHandsetForm";

export const metadata: Metadata = {
  title: "Dev handset — Conversational SMS",
};

export default function DevPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Reviewer</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Dev handset</h1>
        <p className="mt-2 text-sm text-slate-400">
          Send an inbound SMS through the webhook without Twilio. Open the admin thread in another
          tab to watch statuses update.
        </p>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <DevHandsetForm />
      </section>
    </main>
  );
}
