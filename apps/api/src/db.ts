import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import type { Env } from "./env.js";

export function createPool(env: Env): pg.Pool {
  return new pg.Pool({ connectionString: env.DATABASE_URL });
}

export async function checkPostgres(pool: pg.Pool): Promise<boolean> {
  try {
    const db = drizzle(pool);
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}
