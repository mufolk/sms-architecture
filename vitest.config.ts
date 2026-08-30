import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const coreSrc = path.resolve(rootDir, "packages/core/src");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@conversational-sms\/core\/(.+)$/,
        replacement: `${coreSrc}/$1`,
      },
      {
        find: "@conversational-sms/core",
        replacement: path.resolve(coreSrc, "index.ts"),
      },
    ],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // apps/web is out of the seam: ADR-0011 observes through the admin REST,
      // and browser tests are in the spec's Out of Scope list.
      include: [
        "apps/api/src/**/*.ts",
        "apps/worker/src/**/*.ts",
        "packages/core/src/**/*.ts",
      ],
      exclude: [
        "**/*.d.ts",
        "**/schema/**",
        "**/drizzle/**",
        "**/domain/types.ts",
        "**/ports/**",
        "apps/api/src/deps.ts",
        // Process bootstraps and barrels: they only wire and listen, and the seam
        // imports the app instead of spawning them. Logic must not live here.
        "apps/api/src/server.ts",
        "apps/worker/src/index.ts",
        "packages/core/src/index.ts",
      ],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
    },
  },
});
