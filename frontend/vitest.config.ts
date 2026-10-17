import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // jsdom + axe audits and full integration flows exceed the 5s default when the
    // suite runs in parallel (and on slower CI runners), causing load-dependent flakes.
    testTimeout: 20_000,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/e2e/**",
      // Live Quickstart suite — run via `npm run test:integration` with RUN_LOCAL_STELLAR=1
      "**/__tests__/integration/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/e2e/**",
        "src/test/**",
        "**/*.config.*",
        "**/*.d.ts",
        "**/stories/**",
      ],
      thresholds: {
        // #1142 — ratcheted to just below current coverage (80/72/74/83)
        // rounded down to nearest 5%. Raise these as coverage improves.
        statements: 75,
        branches: 70,
        functions: 70,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
