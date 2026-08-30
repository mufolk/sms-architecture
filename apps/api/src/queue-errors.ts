export function isQueueUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENOTFOUND") {
    return true;
  }

  return (
    error.message.includes("enableOfflineQueue") ||
    error.message.includes("Connection is closed") ||
    error.message.includes("Stream isn't writeable")
  );
}
