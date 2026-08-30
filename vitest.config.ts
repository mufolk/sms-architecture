import { defineConfig } from "vitest/config";

export default defineConfig({
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
      include: ["apps/api/src/**/*.ts", "packages/core/src/**/*.ts"],
      exclude: [
        "**/*.d.ts",
        "**/schema/**",
        "**/drizzle/**",
        // Process bootstraps and barrels: they only wire and listen, and the seam
        // imports the app instead of spawning them. Logic must not live here.
        "apps/api/src/server.ts",
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
