import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../packages/core/src/migrate.js";
import { buildApp } from "../apps/api/src/index.js";
import { loadEnv } from "../apps/api/src/env.js";
import { baseEnv, startTestInfrastructure, type TestInfrastructure } from "./helpers/infrastructure.js";

describe("walking skeleton", () => {
  describe("GET /health", () => {
    it("returns 200 while the API process is alive", async () => {
      const infra = await startTestInfrastructure();

      try {
        const { app } = await buildApp({ env: baseEnv(infra) });
        const response = await app.inject({ method: "GET", url: "/health" });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: "ok" });
        await app.close();
      } finally {
        await infra.stop();
      }
    });
  });

  describe("GET /ready", () => {
    let infra: TestInfrastructure;

    beforeAll(async () => {
      infra = await startTestInfrastructure();
      const pool = new pg.Pool({ connectionString: infra.databaseUrl });
      await runMigrations(pool);
      await pool.end();
    }, 120_000);

    afterAll(async () => {
      await infra.stop();
    }, 30_000);

    it("returns 200 when Postgres and Redis both answer a real query", async () => {
      const { app } = await buildApp({ env: baseEnv(infra) });
      const response = await app.inject({ method: "GET", url: "/ready" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: "ready",
        postgres: true,
        redis: true,
      });

      await app.close();
    });

    it("returns 503 when Redis is down", async () => {
      const { app } = await buildApp({
        env: {
          ...baseEnv(infra),
          REDIS_URL: "redis://127.0.0.1:59999",
        },
      });
      const response = await app.inject({ method: "GET", url: "/ready" });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        status: "not ready",
        postgres: true,
        redis: false,
      });

      await app.close();
    });

    it("returns 503 when Postgres is down", async () => {
      const { app } = await buildApp({
        env: {
          ...baseEnv(infra),
          DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:59998/conversational_sms",
        },
      });
      const response = await app.inject({ method: "GET", url: "/ready" });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        status: "not ready",
        postgres: false,
        redis: true,
      });

      await app.close();
    });
  });

  describe("environment validation", () => {
    it("refuses to boot on a missing variable, naming the offending variable", () => {
      const exit = vi.spyOn(process, "exit").mockImplementation((() => {
        throw new Error("process.exit");
      }) as typeof process.exit);
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() =>
        loadEnv({
          REDIS_URL: "redis://127.0.0.1:6379",
        }),
      ).toThrow("process.exit");

      expect(stderr).toHaveBeenCalledWith("Invalid environment variable DATABASE_URL: Required");

      exit.mockRestore();
      stderr.mockRestore();
    });

    it("refuses to boot on a malformed value, naming the offending variable", () => {
      const exit = vi.spyOn(process, "exit").mockImplementation((() => {
        throw new Error("process.exit");
      }) as typeof process.exit);
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() =>
        loadEnv({
          DATABASE_URL: "not-a-url",
          REDIS_URL: "redis://127.0.0.1:6379",
        }),
      ).toThrow("process.exit");

      expect(stderr).toHaveBeenCalledWith("Invalid environment variable DATABASE_URL: Invalid url");

      exit.mockRestore();
      stderr.mockRestore();
    });

    it("loads valid api environment", () => {
      expect(
        loadEnv({
          DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/conversational_sms",
          REDIS_URL: "redis://127.0.0.1:6379",
        }),
      ).toMatchObject({
        PORT: 3000,
      });
    });
  });
});
