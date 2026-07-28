import { defineConfig, devices } from "@playwright/test";
import path from "path";
import fs from "fs";

const systemChrome = fs.existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined;

export default defineConfig({
  testDir: path.join(__dirname, "frontend/e2e"),
  testMatch: "**/*.spec.ts",
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
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        ...(systemChrome ? { channel: "chrome" } : {}),
      },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    cwd: "frontend",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_USE_MOCK_WALLET: "true",
      NEXT_PUBLIC_CONTRACT_ID:
        process.env.NEXT_PUBLIC_CONTRACT_ID ??
        "CB6HVHRQYILGNKW7RBB66BC6TDBIEWADOA2YUUV4I22RXRLA6DY6OAKT",
      NEXT_PUBLIC_SOROBAN_RPC_URL:
        process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ??
        "https://soroban-testnet.stellar.org",
      NEXT_PUBLIC_NETWORK_PASSPHRASE:
        process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ??
        "Test SDF Network ; September 2015",
    },
  },
});
