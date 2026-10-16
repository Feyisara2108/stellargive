import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

export default mergeConfig(
  base,
  defineConfig({
    test: {
      environment: "node",
      // Override the unit-test exclusion of this directory.
      exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
      include: ["src/__tests__/integration/**/*.test.ts"],
      // Live network calls need more headroom than unit tests.
      testTimeout: 180_000,
      hookTimeout: 180_000,
      fileParallelism: false,
    },
  }),
);
