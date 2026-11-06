import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

const merged = mergeConfig(
  base,
  defineConfig({
    test: {
      environment: "node",
      include: ["src/__tests__/integration/**/*.test.ts"],
      // Live network calls need more headroom than unit tests.
      testTimeout: 180_000,
      hookTimeout: 180_000,
      fileParallelism: false,
    },
  }),
);

export default defineConfig({
  ...merged,
  test: {
    ...merged.test,
    // mergeConfig concatenates arrays, so merging would keep the unit-test exclusion of this
    // directory (and nothing would match `include`). Set both lists explicitly instead.
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    // The unit-test setup file stubs browser globals (window, matchMedia) and mocks Next.js
    // modules; the live-network suite runs in plain node and needs none of it.
    setupFiles: [],
  },
});
