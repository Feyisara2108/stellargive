import { test, expect, type Page } from "@playwright/test";

const VALID_BENEFICIARY = "G" + "A".repeat(55);
const MOCK_TX_HASH = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6";

async function mockSorobanRPC(page: Page) {
  await page.route("**/soroban/rpc*", async (route) => {
    const request = route.request();
    let body: any = {};
    try {
      body = JSON.parse(request.postData() || "{}");
    } catch {
      // not JSON, pass through
    }

    const method = body.method || "";

    if (method === "simulateTransaction") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            transactionData: "",
            minResourceFee: "100",
            cost: { cpuInsns: "1000", memBytes: "1000" },
            results: [{ xdr: "AAAAEAAAAAEAAAACAAAADwAAAAV0aXRsZQAAAAAAAA0AAAA=" }],
            latestLedger: 1000,
          },
        }),
      });
    } else if (method === "getAccount") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            id: VALID_BENEFICIARY,
            sequence: "100",
          },
        }),
      });
    } else if (method === "sendTransaction") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            status: "PENDING",
            hash: MOCK_TX_HASH,
            latestLedger: 1000,
          },
        }),
      });
    } else if (method === "getTransaction") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            status: "SUCCESS",
            latestLedger: 1001,
            resultMetaXdr: "AAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
            hash: MOCK_TX_HASH,
          },
        }),
      });
    } else if (method === "getEvents") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: { events: [], latestLedger: 1000 },
        }),
      });
    } else {
      await route.continue();
    }
  });
}

test.describe("Create Campaign flow", () => {
  test.beforeEach(async ({ page }) => {
    await mockSorobanRPC(page);
  });

  test("submits a valid campaign and navigates to the detail page", async ({ page }) => {
    await page.goto("/create");

    await expect(page.getByRole("heading", { name: /Create a New Campaign/i })).toBeVisible();

    await page.getByLabel(/Campaign Title/i).fill("Flood Relief 2024");
    await page.getByLabel(/Beneficiary Address/i).fill(VALID_BENEFICIARY);
    await page.getByLabel(/Target/i).fill("10");
    await page.getByLabel(/Duration/i).fill("30");

    await page.getByRole("button", { name: /Launch Campaign/i }).click();

    await expect(page).toHaveURL(/\/campaign\/\d+/);
    await expect(page.getByText(/Campaign #/)).toBeVisible();
  });

  test("shows validation feedback for an invalid target amount", async ({ page }) => {
    await page.goto("/create");

    await page.getByLabel(/Campaign Title/i).fill("Flood Relief 2024");
    await page.getByLabel(/Beneficiary Address/i).fill(VALID_BENEFICIARY);
    await page.getByLabel(/Target/i).fill("0.5");

    await expect(page.getByText(/Target must be at least 1.0/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Launch Campaign/i })).toBeDisabled();
  });
});
