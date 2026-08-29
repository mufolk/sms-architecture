export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  // `next build` has no runtime env; validation runs when the server starts.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  const { loadEnv } = await import("./env");
  loadEnv();
}
