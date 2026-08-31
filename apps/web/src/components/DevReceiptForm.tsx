"use client";

import { useId, useState } from "react";

type ReceiptStatus = "delivered" | "undelivered" | "failed";

export function DevReceiptForm() {
  const sidHintId = useId();
  const [providerMessageSid, setProviderMessageSid] = useState("");
  const [errorCode, setErrorCode] = useState("30003");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function emitReceipt(receiptStatus: ReceiptStatus) {
    if (!providerMessageSid.trim()) {
      setError("Provider Message SID is required.");
      setStatus("error");
      return;
    }

    setStatus("sending");
    setError(null);

    try {
      const payload: {
        providerMessageSid: string;
        status: ReceiptStatus;
        errorCode?: string;
      } = {
        providerMessageSid: providerMessageSid.trim(),
        status: receiptStatus,
      };

      if (receiptStatus !== "delivered" && errorCode.trim()) {
        payload.errorCode = errorCode.trim();
      }

      const response = await fetch("/api/dev/receipt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error ?? `Receipt failed (${response.status})`);
      }

      setStatus("sent");
    } catch (receiptError) {
      const message = receiptError instanceof Error ? receiptError.message : "Receipt failed";
      setError(message);
      setStatus("error");
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void emitReceipt("delivered");
      }}
    >
      <div className="block space-y-2 text-sm">
        <label htmlFor="provider-message-sid" className="text-slate-300">
          Outbound Provider Message SID
        </label>
        <input
          id="provider-message-sid"
          value={providerMessageSid}
          onChange={(event) => setProviderMessageSid(event.target.value)}
          placeholder="FAKE… from the admin thread outbound row"
          aria-describedby={sidHintId}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 outline-none ring-indigo-500/0 transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
        />
        <p id={sidHintId} className="text-xs text-slate-400">
          Paste the outbound Provider Message SID after the reply is sent. This simulates Twilio&apos;s
          delivery receipt webhook.
        </p>
      </div>

      <label className="block space-y-2 text-sm">
        <span className="text-slate-300">Error code (undelivered / failed)</span>
        <input
          value={errorCode}
          onChange={(event) => setErrorCode(event.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 outline-none ring-indigo-500/0 transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Emit delivered
        </button>
        <button
          type="button"
          disabled={status === "sending"}
          onClick={() => void emitReceipt("undelivered")}
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Emit undelivered
        </button>
        <button
          type="button"
          disabled={status === "sending"}
          onClick={() => void emitReceipt("failed")}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Emit failed
        </button>
      </div>

      <p role="status" aria-live="polite" className={status === "sent" ? "text-sm text-emerald-300" : "text-sm"}>
        {status === "sent" ? "Delivery receipt sent. Watch the admin thread update on its own." : ""}
      </p>
      {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
    </form>
  );
}
