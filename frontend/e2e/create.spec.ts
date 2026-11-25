import { test, expect, type Page } from "@playwright/test";
import { Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { type RpcRequestBody, decodeInvocation } from "./support/xdr";
import { campaignScVal, ok, type CampaignSeed } from "./support/rpc-mock";

const WALLET = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey();
const VALID_BENEFICIARY = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 4)).publicKey();
const MOCK_TX_HASH = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const NEW_CAMPAIGN_ID = 7;

const CREATED_CAMPAIGN: CampaignSeed = {
  id: NEW_CAMPAIGN_ID,
  title: "Flood Relief 2024",
  status: "Active",
  raised: 0n,
  target: 100_000_000n,
  description: "Emergency relief support for families affected by flooding.",
  creator: WALLET,
  beneficiaries: [{ address: VALID_BENEFICIARY, share: 10_000 }],
};

const CREATE_RETURN_XDR = nativeToScVal(BigInt(NEW_CAMPAIGN_ID), { type: "u64" }).toXDR("base64");

async function mockSorobanRPC(page: Page) {
  await page.route("**/soroban/rpc*", async (route) => {
    const request = route.request();
    let body: RpcRequestBody = {};
    try {
      body = JSON.parse(request.postData() || "{}");
    } catch {
      // not JSON, pass through
    }

    const method = body.method || "";
    const id = body.id ?? 0;

    if (method === "simulateTransaction") {
      const call = decodeInvocation(body.params?.transaction ?? "");
      const fn = call?.fn ?? "";

      let retvalXdr: string;
      if (fn === "create_campaign") {
        retvalXdr = CREATE_RETURN_XDR;
      } else if (fn === "get_campaign") {
        const wanted = Number(call?.args?.[0] ?? 0);
        retvalXdr =
          wanted === NEW_CAMPAIGN_ID
            ? campaignScVal(CREATED_CAMPAIGN)
            : xdr.ScVal.scvVoid().toXDR("base64");
      } else if (fn === "decimals") {
        retvalXdr = nativeToScVal(7, { type: "u32" }).toXDR("base64");
      } else if (fn === "name" || fn === "symbol") {
        retvalXdr = nativeToScVal("XLM", { type: "string" }).toXDR("base64");
      } else {
        retvalXdr = xdr.ScVal.scvVoid().toXDR("base64");
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(id, retvalXdr)),
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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            status: "PENDING",
            hash: MOCK_TX_HASH,
            latestLedger: 1000,
          },
        }),
      });
      return;
    }

    if (method === "getTransaction") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            status: "SUCCESS",
            latestLedger: 1001,
            resultMetaXdr: "AAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
            returnValue: CREATE_RETURN_XDR,
            hash: MOCK_TX_HASH,
          },
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

test.describe("Create Campaign flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((addr) => {
      window.__mockWalletAddress = addr;
    }, WALLET);
    await mockSorobanRPC(page);
  });

  test("walks the Details -> Funding -> Review wizard and submits a valid campaign", async ({
    page,
  }) => {
    await page.goto("/");

    await page
      .getByRole("button", { name: /Start a Campaign/i })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: /Create Relief Campaign/i })).toBeVisible();

    // Step 1: Details
    await expect(page.getByText(/Step 1 of 3/i)).toBeVisible();
    await page.getByLabel(/Campaign Title/i).fill("Flood Relief 2024");
    await page
      .getByLabel(/Campaign Description/i)
      .fill("Emergency relief support for families affected by flooding.");
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 2: Funding
    await expect(page.getByText(/Step 2 of 3/i)).toBeVisible();
    await page.getByLabel(/Beneficiary Address/i).fill(VALID_BENEFICIARY);
    await page.getByLabel("Target (XLM)", { exact: true }).fill("10");
    await page.getByLabel(/Duration/i).fill("30");
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 3: Review
    await expect(page.getByText(/Step 3 of 3/i)).toBeVisible();
    await page.getByRole("button", { name: /Launch Campaign/i }).click();

    await expect(page).toHaveURL(new RegExp(`/campaign/${NEW_CAMPAIGN_ID}$`));
    await expect(page.getByRole("heading", { name: "Flood Relief 2024" })).toBeVisible();
  });

  test("shows validation feedback for an invalid target amount on the funding step", async ({
    page,
  }) => {
    await page.goto("/");

    await page
      .getByRole("button", { name: /Start a Campaign/i })
      .first()
      .click();

    // Step 1: Details — fill the fields required to advance.
    await page.getByLabel(/Campaign Title/i).fill("Flood Relief 2024");
    await page
      .getByLabel(/Campaign Description/i)
      .fill("Emergency relief support for families affected by flooding.");
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 2: Funding — the target field (and its validation) lives here.
    await expect(page.getByText(/Step 2 of 3/i)).toBeVisible();
    await page.getByLabel(/Beneficiary Address/i).fill(VALID_BENEFICIARY);
    await page.getByLabel("Target (XLM)", { exact: true }).fill("0.5");

    await expect(page.getByText(/Target must be at least 1.0/i)).toBeVisible();

    // Invalid target keeps the wizard on the funding step instead of advancing.
    await page.getByRole("button", { name: /Continue/i }).click();
    await expect(page.getByText(/Step 2 of 3/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Launch Campaign/i })).toHaveCount(0);
  });
});
