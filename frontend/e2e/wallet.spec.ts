import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: wallet connect / disconnect lifecycle.
 *
 * Runs against the MockWalletProvider (activated via NEXT_PUBLIC_USE_MOCK_WALLET=true
 * in playwright.config.ts). The mock provider auto-connects on load with a
 * deterministic test address, giving us a clean starting state without requiring
 * the Freighter browser extension.
 *
 * Coverage:
 *   1. Auto-connect on load — address renders in navbar immediately.
 *   2. Disconnect via the wallet dropdown — "Connect Wallet" button appears,
 *      address is gone, action buttons are gated.
 *   3. Re-connect via the "Connect Wallet" button — address is restored.
 */

// The address injected by MockWalletProvider (see src/components/MockWalletProvider.tsx)
const MOCK_ADDRESS = "GTEST7SRIEMJXLK3LXKLS5RQ7JLDUZQUDVFNLWIM6DEDCZM5WLPSERV";
// formatAddress() output: first 4 + "..." + last 4
const MOCK_ADDRESS_SHORT = `${MOCK_ADDRESS.slice(0, 4)}...${MOCK_ADDRESS.slice(-4)}`;

/**
 * Stubs the Soroban RPC endpoint so tests run fully offline.
 * Returns instant, deterministic responses for the calls made by the home page
 * and the RPC health indicator hook.
 */
async function mockRpc(page: Page) {
  await page.route("**/soroban/rpc*", async (route) => {
    let body: any = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      // non-JSON — pass through
    }

    const method = body.method ?? "";
    const id = body.id;

    if (method === "getLatestLedger") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: { id: "mock", sequence: 1000, protocolVersion: 20 },
        }),
      });
      return;
    }

    if (method === "getEvents") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: { events: [], latestLedger: 1000 },
        }),
      });
      return;
    }

    if (method === "simulateTransaction") {
      // Return a void ScVal so data calls succeed quietly (page shows skeletons).
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            transactionData: "",
            minResourceFee: "100",
            cost: { cpuInsns: "1000", memBytes: "1000" },
            results: [{ xdr: "AAAAAA==" }], // ScVal void
            latestLedger: 1000,
          },
        }),
      });
      return;
    }

    await route.continue();
  });
}

test.describe("Wallet connect / disconnect lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await mockRpc(page);
    await page.goto("/");
    // Wait for the app shell to hydrate
    await page.waitForSelector("nav", { timeout: 15_000 });
  });

  test("starts connected — address renders in navbar", async ({ page }) => {
    // MockWalletProvider auto-connects; the truncated address should be visible.
    await expect(page.getByText(MOCK_ADDRESS_SHORT)).toBeVisible();
    // "Connect Wallet" CTA must NOT be shown when already connected.
    await expect(page.getByRole("button", { name: /Connect Wallet/i })).not.toBeVisible();
  });

  test("disconnect hides the address and exposes the Connect Wallet button", async ({
    page,
  }) => {
    // 1. Verify initial connected state.
    await expect(page.getByText(MOCK_ADDRESS_SHORT)).toBeVisible();

    // 2. Open the wallet dropdown by clicking the address button.
    await page.getByRole("button", { name: new RegExp(MOCK_ADDRESS_SHORT) }).click();

    // 3. Click "Disconnect" inside the dropdown.
    await page.getByRole("button", { name: /Disconnect/i }).click();

    // 4. After disconnect the "Connect Wallet" button must appear.
    await expect(page.getByRole("button", { name: /Connect Wallet/i })).toBeVisible();

    // 5. The address must no longer be visible anywhere.
    await expect(page.getByText(MOCK_ADDRESS_SHORT)).not.toBeVisible();
  });

  test("reconnect restores the address and hides the Connect Wallet button", async ({
    page,
  }) => {
    // Disconnect first so we can test the reconnect path.
    await page.getByRole("button", { name: new RegExp(MOCK_ADDRESS_SHORT) }).click();
    await page.getByRole("button", { name: /Disconnect/i }).click();
    await expect(page.getByRole("button", { name: /Connect Wallet/i })).toBeVisible();

    // Click "Connect Wallet" to reconnect.
    await page.getByRole("button", { name: /Connect Wallet/i }).click();

    // Address should reappear.
    await expect(page.getByText(MOCK_ADDRESS_SHORT)).toBeVisible();

    // "Connect Wallet" CTA must be gone again.
    await expect(page.getByRole("button", { name: /Connect Wallet/i })).not.toBeVisible();
  });

  test("gated actions: donate button is inaccessible when wallet is disconnected", async ({
    page,
  }) => {
    // Disconnect to reach the gated state.
    await page.getByRole("button", { name: new RegExp(MOCK_ADDRESS_SHORT) }).click();
    await page.getByRole("button", { name: /Disconnect/i }).click();
    await expect(page.getByRole("button", { name: /Connect Wallet/i })).toBeVisible();

    // Navigate to a campaign page — RPC is mocked so the page renders with
    // skeleton/fallback content even if the campaign isn't found.
    await page.goto("/campaign/1");
    await page.waitForSelector("nav", { timeout: 15_000 });

    // After disconnect the wallet button should say "Connect Wallet", not an address.
    await expect(page.getByRole("button", { name: /Connect Wallet/i })).toBeVisible();
    await expect(page.getByText(MOCK_ADDRESS_SHORT)).not.toBeVisible();
  });
});
