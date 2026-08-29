import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Env } from "./env.js";

export function createPool(env: Env): pg.Pool {
  return new pg.Pool({ connectionString: env.DATABASE_URL });
}

export function createDb(pool: pg.Pool) {
  return drizzle(pool);
}

export async function checkPostgres(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
