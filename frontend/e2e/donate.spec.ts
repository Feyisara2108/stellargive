import { test, expect, type Page } from "@playwright/test";
import { nativeToScVal } from "@stellar/stellar-sdk";

// Deterministic test data matching the mock wallet defaults
const MOCK_ADDRESS = "GTEST7SRIEMJXLK3LXKLS5RQ7JLDUZQUDVFNLWIM6DEDCZM5WLPSERV";
const MOCK_TX_HASH = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

/**
 * Intercept all Soroban RPC JSON-RPC calls and return mock responses.
 * This makes the E2E test fully offline — no live testnet required.
 */
async function mockSorobanRPC(page: Page) {
  let raisedAmount = 20000000n; // Starts at 2 XLM (20,000,000 stroops)

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
      const xdrString = body.params?.[0] || "";
      const buffer = Buffer.from(xdrString, "base64");

      let retval: any;
      if (buffer.includes("get_campaign")) {
        const mockCampaign = {
          id: 1n,
          creator: "GDQP2QSYCDKUFGBAHQVHQVHQVHQVHQVHQVHQVHQVHQVHQVHQVHQVHQVH",
          beneficiary: "GDQP2QSYCDKUFGBAHQVHQVHQVHQVHQVHQVHQVHQVHQVHQVHQVHQVHQVH",
          title: "Flood Relief 2024",
          description: "Help the victims of the recent floods.",
          category: "relief",
          target_amount: 100000000n, // 10 XLM
          raised_amount: raisedAmount,
          deadline: BigInt(Math.floor(Date.now() / 1000) + 86400), // active for 1 day
          accepted_token: "CDLZFC3SYJYDTIW67FYOFNPZNR2BAZZB54JZWJZWJZWJZWJZWJZWJZWZ",
          status: { Active: null },
          metadata_uri: "https://example.com/metadata",
          website: "https://example.com",
          twitter: "https://twitter.com/example",
        };
        retval = nativeToScVal(mockCampaign);
      } else if (buffer.includes("balance")) {
        retval = nativeToScVal(1000000000n, { type: "i128" }); // 100 XLM
      } else if (buffer.includes("get_total_campaigns")) {
        retval = nativeToScVal(1n, { type: "u64" });
      } else {
        retval = nativeToScVal(null);
      }

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
            results: [
              {
                xdr: retval.toXDR("base64"),
              },
            ],
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
            id: MOCK_ADDRESS,
            sequence: "100",
          },
        }),
      });
    } else if (method === "sendTransaction") {
      // Update the raised amount by 5.0 XLM (50,000,000 stroops)
      raisedAmount += 50000000n;

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

test.describe("Donation Happy Path (Mock Wallet & RPC)", () => {
  test.beforeEach(async ({ page }) => {
    await mockSorobanRPC(page);
  });

  test("successfully completes the donation flow and updates campaign progress", async ({
    page,
  }) => {
    // 1. Navigate to the campaign detail page directly
    await page.goto("/campaign/1");
    await page.waitForLoadState("networkidle");

    // Verify campaign details are loaded correctly from mock RPC
    await expect(page.getByRole("heading", { name: "Flood Relief 2024" })).toBeVisible();
    await expect(page.getByText("2 XLM", { exact: true })).toBeVisible();
    await expect(page.getByText("10 XLM", { exact: true })).toBeVisible();

    const progressBar = page.getByRole("progressbar");
    await expect(progressBar).toBeVisible();
    await expect(progressBar).toHaveAttribute("aria-valuenow", "20");

    // 2. Open the DonateModal
    const donateButton = page.getByRole("button", { name: "Donate Now" });
    await expect(donateButton).toBeVisible();
    await donateButton.click();

    // Verify modal is open
    const modalTitle = page.getByRole("heading", { name: "Donate to Flood Relief 2024" });
    await expect(modalTitle).toBeVisible();

    // 3. Enter a valid amount
    const amountInput = page.locator("input#amount");
    await expect(amountInput).toBeVisible();
    await amountInput.fill("5.0");

    // Verify "Confirm Donation" is enabled
    const confirmButton = page.getByRole("button", { name: "Confirm Donation" });
    await expect(confirmButton).toBeEnabled();

    // 4. Submit donation
    await confirmButton.click();

    // 5. Verify success dialog
    const successTitle = page.getByRole("heading", { name: "Donation Successful!" });
    await expect(successTitle).toBeVisible({ timeout: 10_000 });

    // Verify correct amount and transaction hash in the success dialog
    await expect(page.getByText("5.0 XLM")).toBeVisible();
    await expect(page.getByText(MOCK_TX_HASH)).toBeVisible();

    // 6. Close the success dialog
    const closeButton = page.getByRole("button", { name: "Close" });
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    // Verify success dialog is gone
    await expect(successTitle).not.toBeVisible();

    // 7. Verify updated progress on the campaign page
    // Raised amount should now be 7 XLM (2 XLM + 5.0 XLM)
    await expect(page.getByText("7 XLM", { exact: true })).toBeVisible({ timeout: 5_000 });
    // Progress bar should now be 70%
    await expect(progressBar).toHaveAttribute("aria-valuenow", "70");
  });
});
