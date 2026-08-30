const statusStyles: Record<string, string> = {
  received: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  processing: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  processed: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  failed: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  queued: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  sent: "bg-blue-500/15 text-blue-300 ring-blue-500/30",
  delivered: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  undelivered: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
};

export function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? "bg-slate-500/15 text-slate-300 ring-slate-500/30";

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>
      {status}
    </span>
  );
}
