"use client";

import { useId, useState } from "react";

export function DevHandsetForm() {
  const messageSidHintId = useId();
  const [userNumber, setUserNumber] = useState("+15550001");
  const [inboundNumber, setInboundNumber] = useState("+15559999");
  const [messageSid, setMessageSid] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "duplicate" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setError(null);

    try {
      const payload: {
        userNumber: string;
        inboundNumber: string;
        body: string;
        messageSid?: string;
      } = { userNumber, inboundNumber, body };

      if (messageSid.trim()) {
        payload.messageSid = messageSid.trim();
      }

      const response = await fetch("/api/dev/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error ?? `Send failed (${response.status})`);
      }

      const result = (await response.json()) as { messageSid?: string; duplicate?: boolean };

      if (result.duplicate) {
        setStatus("duplicate");
        return;
      }

      setMessageSid("");
      setBody("");
      setStatus("sent");
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Send failed";
      setError(message);
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2 text-sm">
          <span className="text-slate-300">User Number</span>
          <input
            value={userNumber}
            onChange={(event) => setUserNumber(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-indigo-500/0 transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
            required
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span className="text-slate-300">Inbound Number</span>
          <input
            value={inboundNumber}
            onChange={(event) => setInboundNumber(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-indigo-500/0 transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
            required
          />
        </label>
      </div>

      <div className="block space-y-2 text-sm">
        <label htmlFor="dev-message-sid" className="text-slate-300">
          MessageSid
        </label>
        <input
          id="dev-message-sid"
          value={messageSid}
          onChange={(event) => setMessageSid(event.target.value)}
          placeholder="Leave blank for a new SID, or paste one to simulate redelivery"
          aria-describedby={messageSidHintId}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 outline-none ring-indigo-500/0 transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
        />
        <p id={messageSidHintId} className="text-xs text-slate-400">
          Leave blank for a new message. Paste a previous SID to test idempotency (ADR-0004).
        </p>
      </div>

      <label className="block space-y-2 text-sm">
        <span className="text-slate-300">Message</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-indigo-500/0 transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
        />
      </label>

      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Send SMS"}
      </button>

      <p
        role="status"
        aria-live="polite"
        className={
          status === "sent"
            ? "text-sm text-emerald-300"
            : status === "duplicate"
              ? "text-sm text-amber-300"
              : "text-sm"
        }
      >
        {status === "sent"
          ? "Message sent. Watch the admin thread update on its own."
          : status === "duplicate"
            ? "SID already seen — nothing was processed (ADR-0004). Your message was not sent."
            : ""}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-rose-300">{error}</p>
      ) : null}
    </form>
  );
}
