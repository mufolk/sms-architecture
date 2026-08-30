/** UTC timestamps — same output on server and client (avoids hydration mismatch). */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}
