import { runMigrations } from "@conversational-sms/core";
import { buildApp } from "./index.js";

async function main() {
  const { app, env, pool } = await buildApp();

  await runMigrations(pool);
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
