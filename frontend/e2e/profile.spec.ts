import { test, expect, type Page } from "@playwright/test";
import { Address, Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { type RpcRequestBody, decodeInvocation } from "./support/xdr";

/**
 * E2E: profile surfaces (#1160).
 *
 * The mock wallet auto-connects, so with a pinned account this drives the two
 * profile surfaces end-to-end against fully mocked Soroban RPC:
 *   - `/profile` renders the connected wallet's "My Campaigns" (created and
 *     supported) plus its donation history,
 *   - `/profile/[address]` renders the public profile view.
 */

// The connected mock wallet — creator of one campaign and the donor in the
// donation history. Injected via `__mockWalletAddress` because the provider's
// built-in default isn't a valid StrKey.
const WALLET = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 9)).publicKey();
const OTHER_CREATOR = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 10)).publicKey();
const BENEFICIARY = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 11)).publicKey();
const TOKEN = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();

const MOCK_TX_HASH = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

const XLM = 10_000_000n;

const MY_CAMPAIGN = {
  id: 1,
  creator: WALLET,
  beneficiary: BENEFICIARY,
  title: "My Clean Water Drive",
  status: "Active" as const,
  raised: 20n * XLM,
  target: 100n * XLM,
};

const SUPPORTED_CAMPAIGN = {
  id: 2,
  creator: OTHER_CREATOR,
  beneficiary: BENEFICIARY,
  title: "Community Food Bank",
  status: "Active" as const,
  raised: 10n * XLM,
  target: 50n * XLM,
};

// A `donation`/`received` event: value is [campaign_id, donor, amount] and the
// topic tail is `received`, which is what the profile page filters on.
const DONATION_AMOUNT = 5n * XLM;

function sym(s: string) {
  return nativeToScVal(s, { type: "symbol" });
}

function campaignScVal(c: {
  id: number;
  creator: string;
  beneficiary: string;
  title: string;
  status: string;
  raised: bigint;
  target: bigint;
}): xdr.ScVal {
  const entries: [string, xdr.ScVal][] = [
    ["accepted_token", new Address(TOKEN).toScVal()],
    ["beneficiary", new Address(c.beneficiary).toScVal()],
    ["category", nativeToScVal("relief", { type: "string" })],
    ["creator", new Address(c.creator).toScVal()],
    ["deadline", nativeToScVal(9_999_999_999n, { type: "u64" })],
    ["description", nativeToScVal("A campaign in the profile test", { type: "string" })],
    ["id", nativeToScVal(BigInt(c.id), { type: "u64" })],
    ["metadata_uri", nativeToScVal("", { type: "string" })],
    ["raised_amount", nativeToScVal(c.raised, { type: "i128" })],
    [
      "status",
      xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: sym(c.status), val: xdr.ScVal.scvVoid() })]),
    ],
    ["target_amount", nativeToScVal(c.target, { type: "i128" })],
    ["title", nativeToScVal(c.title, { type: "string" })],
    ["twitter", nativeToScVal("", { type: "string" })],
    ["website", nativeToScVal("", { type: "string" })],
  ];
  return xdr.ScVal.scvMap(entries.map(([k, v]) => new xdr.ScMapEntry({ key: sym(k), val: v })));
}

function simOk(id: number, retvalXdr: string) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      transactionData: "",
      minResourceFee: "100",
      cost: { cpuInsns: "1000", memBytes: "1000" },
      results: [{ xdr: retvalXdr }],
      latestLedger: 1000,
    },
  };
}

/** A contract event as returned by the raw `getEvents` RPC method. */
function receivedEvent() {
  const topic = [
    nativeToScVal("donation", { type: "symbol" }).toXDR("base64"),
    nativeToScVal("received", { type: "symbol" }).toXDR("base64"),
  ];
  const value = xdr.ScVal.scvVec([
    nativeToScVal(BigInt(SUPPORTED_CAMPAIGN.id), { type: "u64" }),
    new Address(WALLET).toScVal(),
    nativeToScVal(DONATION_AMOUNT, { type: "i128" }),
  ]).toXDR("base64");

  return {
    id: "0000000001",
    type: "contract",
    ledger: 1000,
    ledgerClosedAt: "2026-01-01T00:00:00Z",
    transactionIndex: 0,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: MOCK_TX_HASH,
    // Empty string so the SDK skips constructing a Contract from it.
    contractId: "",
    topic,
    value,
  };
}

async function mockSorobanRPC(page: Page) {
  await page.route("**/soroban/rpc*", async (route) => {
    let body: RpcRequestBody = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      // not JSON
    }
    const method = body.method || "";
    const id = body.id ?? 0;

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

    if (method === "simulateTransaction") {
      const call = decodeInvocation(body.params?.transaction ?? "");
      const fn = call?.fn ?? "";

      if (fn === "get_campaigns_paged") {
        const campaigns = xdr.ScVal.scvVec([
          campaignScVal(MY_CAMPAIGN),
          campaignScVal(SUPPORTED_CAMPAIGN),
        ]).toXDR("base64");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(simOk(id, campaigns)),
        });
        return;
      }

      if (fn === "get_campaign") {
        const wanted = Number(call?.args?.[0] ?? 0);
        const match = [MY_CAMPAIGN, SUPPORTED_CAMPAIGN].find((c) => c.id === wanted);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            match ? simOk(id, campaignScVal(match).toXDR("base64")) : simOk(id, "AAAAAA=="),
          ),
        });
        return;
      }

      if (fn === "decimals") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(simOk(id, nativeToScVal(7, { type: "u32" }).toXDR("base64"))),
        });
        return;
      }

      if (fn === "name" || fn === "symbol") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(simOk(id, nativeToScVal("XLM", { type: "string" }).toXDR("base64"))),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(simOk(id, xdr.ScVal.scvVoid().toXDR("base64"))),
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
          result: {
            events: [receivedEvent()],
            latestLedger: 1000,
            oldestLedger: 0,
            latestLedgerCloseTime: "2026-01-01T00:00:00Z",
            oldestLedgerCloseTime: "2026-01-01T00:00:00Z",
            cursor: "",
          },
        }),
      });
      return;
    }

    await route.continue();
  });
}

test.describe("Profile dashboard (/profile)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((addr) => {
      window.__mockWalletAddress = addr;
    }, WALLET);
    await mockSorobanRPC(page);
  });

  test("shows the connected wallet's campaigns under My Campaigns", async ({ page }) => {
    await page.goto("/profile");

    await expect(page.getByRole("heading", { name: "My Campaigns", level: 1 })).toBeVisible({
      timeout: 15_000,
    });

    // Summary cards reflect the created campaign and the donation history.
    await expect(page.getByText("Total Raised (created)")).toBeVisible();
    await expect(page.getByText("Total Donated")).toBeVisible();

    // Created vs. supported campaigns are split into their own sections.
    await expect(page.getByRole("heading", { name: "Campaigns I Created" })).toBeVisible();
    await expect(page.getByRole("link", { name: MY_CAMPAIGN.title })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByRole("heading", { name: "Campaigns I Supported" })).toBeVisible();
    await expect(page.getByRole("link", { name: SUPPORTED_CAMPAIGN.title })).toBeVisible();
  });

  test("shows the donation history in the My Donations tab", async ({ page }) => {
    await page.goto("/profile");

    await page.getByRole("tab", { name: "My Donations" }).click();

    await expect(page.getByText("5 XLM Donated")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: SUPPORTED_CAMPAIGN.title })).toBeVisible();
  });
});

test.describe("Public profile (/profile/[address])", () => {
  test("renders the public profile for an address", async ({ page }) => {
    await page.goto(`/profile/${WALLET}`);

    await expect(page.getByRole("heading", { name: "Public Profile" })).toBeVisible();
    await expect(page.getByText(WALLET)).toBeVisible();
    await expect(
      page.getByText("Public profile data will be loaded from on-chain events."),
    ).toBeVisible();
  });
});
