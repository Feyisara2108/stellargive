import { test, expect, type Page } from "@playwright/test";
import { Address, Keypair, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";

/**
 * E2E: claim-refund on a cancelled campaign (#270 — covers #211).
 *
 * The donor refund path is high-trust, so this drives it end-to-end against a
 * cancelled campaign served through mocked Soroban RPC and the mock wallet:
 *   - a prior donor sees the refund control and can claim a refund successfully,
 *   - a non-donor never sees the control.
 *
 * Donor eligibility is modelled by whether the `claim_refund` simulation
 * succeeds (the app gates the control on a successful fee estimate).
 */

const MOCK_TX_HASH = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const CREATOR = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const TOKEN = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();
// Matches MockWalletProvider's DEFAULT_MOCK_ADDRESS.
const MOCK_ADDRESS = "GTEST7SRIEMJXLK3LXKLS5RQ7JLDUZQUDVFNLWIM6DEDCZM5WLPSERV";

const CANCELLED_CAMPAIGN = {
  id: 1,
  title: "Cancelled Relief Drive",
  status: "Cancelled" as const,
  raised: 40_000_000n,
  target: 100_000_000n,
};

function sym(s: string) {
  return nativeToScVal(s, { type: "symbol" });
}

function campaignScVal(): string {
  const c = CANCELLED_CAMPAIGN;
  const entries: [string, xdr.ScVal][] = [
    ["accepted_token", new Address(TOKEN).toScVal()],
    ["beneficiary", new Address(CREATOR).toScVal()],
    ["category", nativeToScVal("Disaster", { type: "string" })],
    ["creator", new Address(CREATOR).toScVal()],
    ["deadline", nativeToScVal(9_999_999_999n, { type: "u64" })],
    ["description", nativeToScVal("A cancelled campaign open for refunds", { type: "string" })],
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
  return xdr.ScVal.scvMap(
    entries.map(([k, v]) => new xdr.ScMapEntry({ key: sym(k), val: v })),
  ).toXDR("base64");
}

function decodeInvocation(txXdr: string): { fn: string; args: unknown[] } | null {
  try {
    const env = xdr.TransactionEnvelope.fromXDR(txXdr, "base64");
    const op = env.v1().tx().operations()[0];
    const ic = op.body().invokeHostFunctionOp().hostFunction().invokeContract();
    return {
      fn: ic.functionName().toString(),
      args: ic.args().map((a) => scValToNative(a)),
    };
  } catch {
    return null;
  }
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

function simError(id: number, message: string) {
  return { jsonrpc: "2.0", id, result: { error: message, events: [], latestLedger: 1000 } };
}

/**
 * @param isDonor when false, `claim_refund` simulation fails so the app treats
 *   the connected wallet as a non-donor and hides the refund control.
 */
async function mockSorobanRPC(page: Page, isDonor: boolean) {
  await page.route("**/soroban/rpc*", async (route) => {
    const request = route.request();
    let body: any = {};
    try {
      body = JSON.parse(request.postData() || "{}");
    } catch {
      // not JSON
    }
    const method = body.method || "";
    const id = body.id;

    if (method === "getAccount") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: { id: MOCK_ADDRESS, sequence: "100" },
        }),
      });
      return;
    }

    if (method === "simulateTransaction") {
      const call = decodeInvocation(body.params?.transaction ?? "");
      const fn = call?.fn ?? "";

      if (fn === "get_campaign") {
        const wanted = Number(call?.args?.[0] ?? 0);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            wanted === CANCELLED_CAMPAIGN.id
              ? simOk(id, campaignScVal())
              : simError(id, "Campaign not found"),
          ),
        });
        return;
      }

      if (fn === "claim_refund") {
        // Eligibility + the actual claim both simulate this function.
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            isDonor ? simOk(id, xdr.ScVal.scvVoid().toXDR("base64")) : simError(id, "NotADonor"),
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

    if (method === "sendTransaction") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: { status: "PENDING", hash: MOCK_TX_HASH, latestLedger: 1000 },
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

const refundControl = (page: Page) => page.getByRole("button", { name: /Claim refund/i });

test.describe("Claim refund on a cancelled campaign", () => {
  test("a prior donor can claim a refund successfully", async ({ page }) => {
    await mockSorobanRPC(page, /* isDonor */ true);
    await page.goto(`/campaign/${CANCELLED_CAMPAIGN.id}`);

    // The refund control is shown for an eligible donor on a cancelled campaign.
    await expect(refundControl(page)).toBeVisible({ timeout: 15_000 });

    await refundControl(page).click();

    // Success is surfaced via a toast, and the control is hidden afterwards.
    await expect(page.getByText(/Refund claimed successfully/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(refundControl(page)).toHaveCount(0);
  });

  test("a non-donor never sees the refund control", async ({ page }) => {
    await mockSorobanRPC(page, /* isDonor */ false);
    await page.goto(`/campaign/${CANCELLED_CAMPAIGN.id}`);

    // The campaign loads, but the refund control must not appear.
    await expect(page.getByText(CANCELLED_CAMPAIGN.title)).toBeVisible({ timeout: 15_000 });
    await expect(refundControl(page)).toHaveCount(0);
  });
});
