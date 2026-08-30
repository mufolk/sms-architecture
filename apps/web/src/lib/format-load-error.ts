export function formatLoadError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Could not reach the API.";
  }

  if (
    error.message === "fetch failed" ||
    error.message === "Could not reach the API" ||
    /^Refresh failed \((502|503|504)\)$/.test(error.message)
  ) {
    return "Could not reach the API. Check that the API is running.";
  }

  if (error.message === "API_URL is not configured") {
    return "The web app is not configured to reach the API.";
  }

  return error.message;
}
