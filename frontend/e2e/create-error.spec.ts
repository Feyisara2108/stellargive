import { test, expect, type Page } from "@playwright/test";
import { Keypair } from "@stellar/stellar-sdk";
import type { RpcRequestBody } from "./support/xdr";

/**
 * E2E: create-campaign failure path.
 *
 * The happy path lives in `create.spec.ts`. This drives the same form against a
 * mocked RPC whose `sendTransaction` fails, and asserts the UI degrades safely:
 *   - the mapped error toast is surfaced,
 *   - the form keeps everything the user typed,
 *   - no navigation to a detail page and no explorer link is shown.
 *
 * `submitTransaction` turns a `status: "ERROR"` send response into a
 * `Send failed: ...` error, which `mapTransactionError` maps to the
 * "Network error. Please try again." copy asserted below.
 */

const WALLET = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey();
const VALID_BENEFICIARY = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 4)).publicKey();
const MOCK_TX_HASH = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

async function mockSorobanRPC(page: Page) {
  await page.route("**/soroban/rpc*", async (route) => {
    let body: RpcRequestBody = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      // not JSON, pass through
    }

    const method = body.method || "";
    const id = body.id ?? 0;

    if (method === "simulateTransaction") {
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
            results: [{ xdr: "AAAAEAAAAAEAAAACAAAADwAAAAV0aXRsZQAAAAAAAA0AAAA=" }],
            latestLedger: 1000,
          },
        }),
      });
      return;
    }

    if (method === "getAccount") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: { id: WALLET, sequence: "100" },
        }),
      });
      return;
    }

    if (method === "sendTransaction") {
      // The failure under test: the network rejects the submission outright.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            status: "ERROR",
            hash: MOCK_TX_HASH,
            errorResultXdr: "AAAAAAAAAGT////9AAAAAA==",
            latestLedger: 1000,
          },
        }),
      });
      return;
    }

    if (method === "getTransaction") {
      // Should never be reached — the send already failed.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: { status: "FAILED", latestLedger: 1001, hash: MOCK_TX_HASH },
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

    await route.continue();
  });
}

test.describe("Create Campaign — RPC failure path", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((addr) => {
      window.__mockWalletAddress = addr;
    }, WALLET);
    await mockSorobanRPC(page);
  });

  test("surfaces the mapped error and keeps the user on the review step", async ({ page }) => {
    await page.goto("/");

    await page
      .getByRole("button", { name: /Start a Campaign/i })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: /Create Relief Campaign/i })).toBeVisible();

    // Step 1: Details
    await page.getByLabel(/Campaign Title/i).fill("Flood Relief 2024");
    await page
      .getByLabel(/Campaign Description/i)
      .fill("Emergency relief support for families affected by flooding.");
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 2: Funding
    await expect(page.getByText(/Step 2 of 3/i)).toBeVisible();
    await page.getByLabel(/Beneficiary Address/i).fill(VALID_BENEFICIARY);
    await page.getByLabel(/Target/i).fill("10");
    await page.getByLabel(/Duration/i).fill("30");
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 3: Review — submit into the mocked RPC failure.
    await expect(page.getByText(/Step 3 of 3/i)).toBeVisible();
    await page.getByRole("button", { name: /Launch Campaign/i }).click();

    // The mapped send failure is surfaced as a toast.
    await expect(page.getByText(/Network error\. Please try again\./i)).toBeVisible({
      timeout: 15_000,
    });

    // No success navigation and no explorer affordance.
    await expect(page).toHaveURL("/");
    await expect(page).not.toHaveURL(/\/campaign\/\d+/);
    await expect(page.getByRole("button", { name: /View Explorer/i })).toHaveCount(0);
    await expect(page.locator('a[href*="stellar.expert"]')).toHaveCount(0);

    // The wizard stays on the review step with everything the user typed, so they can retry.
    await expect(page.getByText(/Step 3 of 3/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Launch Campaign/i })).toBeEnabled();

    await page.getByRole("button", { name: /Back/i }).click();
    await expect(page.getByLabel(/Beneficiary Address/i)).toHaveValue(VALID_BENEFICIARY);
    await expect(page.getByLabel(/Target/i)).toHaveValue("10");
    await expect(page.getByLabel(/Duration/i)).toHaveValue("30");

    await page.getByRole("button", { name: /Back/i }).click();
    await expect(page.getByLabel(/Campaign Title/i)).toHaveValue("Flood Relief 2024");
  });
});
