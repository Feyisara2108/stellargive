import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for StellarGive E2E tests.
 *
 * Launches the Next.js dev server with `NEXT_PUBLIC_USE_MOCK_WALLET=true`
 * so the MockWalletProvider is activated automatically.
 */
export default defineConfig({
  testDir: "../e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 60_000,

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "NEXT_PUBLIC_USE_MOCK_WALLET=true npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_USE_MOCK_WALLET: "true",
    },
  },
});
