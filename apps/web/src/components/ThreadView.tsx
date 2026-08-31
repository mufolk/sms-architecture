"use client";

import { useEffect, useRef, useState } from "react";
import { formatLoadError } from "../lib/format-load-error";
import { formatWhen } from "../lib/format-when";
import type { ThreadMessage } from "../lib/types";
import { StatusBadge } from "./StatusBadge";

const POLL_INTERVAL_MS = 3_000;
const ANNOUNCEMENT_CLEAR_MS = 5_000;

export function ThreadView({
  conversationId,
  initialMessages,
}: {
  conversationId: string;
  initialMessages: ThreadMessage[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const prevCountRef = useRef(initialMessages.length);
  const prevStatusesRef = useRef(
    new Map(initialMessages.map((message) => [message.id, message.status])),
  );

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch(`/api/admin/conversations/${conversationId}/messages`, {
          cache: "no-store",
        });
        if (!response.ok) {
          const detail = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(detail?.error ?? `Refresh failed (${response.status})`);
        }
        const data = (await response.json()) as { messages: ThreadMessage[] };
        if (!cancelled) {
          setMessages(data.messages);
          setError(null);
        }
      } catch (refreshError) {
        if (!cancelled) {
          setError(formatLoadError(refreshError));
        }
      }
    }

    if (paused) {
      return () => {
        cancelled = true;
      };
    }

    function shouldPoll(): boolean {
      return document.visibilityState === "visible";
    }

    const timer = window.setInterval(() => {
      if (shouldPoll()) {
        void refresh();
      }
    }, POLL_INTERVAL_MS);

    function handleVisibilityChange() {
      if (shouldPoll()) {
        void refresh();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [conversationId, paused]);

  useEffect(() => {
    if (paused) {
      return;
    }

    const prevCount = prevCountRef.current;
    const prevStatuses = prevStatusesRef.current;
    const announcements: string[] = [];

    if (messages.length > prevCount) {
      const newCount = messages.length - prevCount;
      announcements.push(
        `${newCount} new message${newCount === 1 ? "" : "s"} — ${messages.length} messages in this conversation.`,
      );
    }

    for (const message of messages) {
      const priorStatus = prevStatuses.get(message.id);
      if (priorStatus && priorStatus !== message.status) {
        announcements.push(
          `${message.direction} message status changed from ${priorStatus} to ${message.status}.`,
        );
      }
      prevStatuses.set(message.id, message.status);
    }

    if (announcements.length > 0) {
      setAnnouncement(announcements.join(" "));
    }

    prevCountRef.current = messages.length;
  }, [messages, paused]);

  useEffect(() => {
    if (!announcement) {
      return;
    }

    const timer = window.setTimeout(() => {
      setAnnouncement("");
    }, ANNOUNCEMENT_CLEAR_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [announcement]);

  return (
    <div className="space-y-4">
      <p role="status" aria-live="polite" className="text-sm text-slate-400">
        {announcement}
      </p>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-400">No messages in this conversation yet.</p>
        ) : null}
        {messages.map((message) => {
          const isInbound = message.direction === "inbound";

          return (
            <article
              key={message.id}
              className={`min-w-0 rounded-xl border p-4 ${
                isInbound
                  ? "border-slate-700 bg-slate-900/70"
                  : "ml-8 border-indigo-500/30 bg-indigo-500/10"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
                <span>{isInbound ? "Inbound" : "Outbound"}</span>
                <StatusBadge status={message.status} />
                <span className="text-slate-400">{formatWhen(message.createdAt)} UTC</span>
              </div>
              {message.body ? (
                <p className="mt-3 break-words whitespace-pre-wrap text-sm leading-6 text-slate-100">
                  {message.body}
                </p>
              ) : (
                <p className="mt-3 text-sm italic text-slate-400">(empty)</p>
              )}
              {!isInbound && message.inReplyTo ? (
                <p className="mt-3 text-xs text-slate-400">Answers message {message.inReplyTo}</p>
              ) : null}
              {!isInbound && message.status !== "queued" ? (
                <p className="mt-3 break-all font-mono text-xs text-slate-400">
                  Provider Message SID: {message.providerMessageSid}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-slate-400">
          {paused
            ? "Auto-refresh paused."
            : "Refreshes every 3 seconds while this page is open and visible."}
        </p>
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-600 hover:text-white"
        >
          {paused ? "Resume auto-refresh" : "Pause auto-refresh"}
        </button>
      </div>
    </div>
  );
}
