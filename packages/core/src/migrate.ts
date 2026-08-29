import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function runMigrations(pool: pg.Pool): Promise<void> {
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: join(packageRoot, "drizzle") });
}
