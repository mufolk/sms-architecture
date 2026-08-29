import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  API_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const variable = firstIssue?.path[0];
    const name = typeof variable === "string" ? variable : "unknown";
    console.error(`Invalid environment variable ${name}: ${firstIssue?.message ?? "invalid value"}`);
    process.exit(1);
  }

  return result.data;
}
