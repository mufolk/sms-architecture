import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  PROCESSING_DELAY_MS: z.coerce.number().int().nonnegative().default(3000),
  REAPER_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  REAPER_RECEIVED_THRESHOLD_MS: z.coerce.number().int().positive().default(30_000),
  REAPER_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  REAPER_SEND_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const name = String(firstIssue?.path[0] ?? "unknown");
    console.error(`Invalid environment variable ${name}: ${firstIssue?.message}`);
    process.exit(1);
  }

  return result.data;
}
