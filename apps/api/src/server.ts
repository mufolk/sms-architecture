import { runMigrations } from "@conversational-sms/core";
import { loadEnv } from "./env.js";
import { createPool } from "./db.js";
import { startServer } from "./index.js";

async function main() {
  const env = loadEnv();
  const pool = createPool(env);

  await runMigrations(pool);
  await pool.end();

  await startServer();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
