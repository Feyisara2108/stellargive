import { test, expect, type Page } from "@playwright/test";
import { Address, Keypair, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";

/**
 * E2E: beneficiary claim of a funded, past-deadline campaign (`claim_funds`).
 *
 * `ClaimButton` is rendered by `CampaignCard`, so this drives the control from
 * the Explore listing (the "All" tab, since a funded campaign is filtered out
 * of the default "Active" tab) against fully mocked Soroban RPC:
 *   - the claim control is visible and enabled for the beneficiary,
 *   - submitting reaches the confirmed-transaction surface with an explorer
 *     link built from the tx hash (the app confirms via toast, not a dialog),
 *   - the control is disabled and relabelled "Claimed" afterwards.
 */

const MOCK_TX_HASH = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
// The connected mock wallet — also the campaign creator/beneficiary, which is
// what `ClaimButton` gates on. Injected via `__mockWalletAddress`.
const WALLET = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 5)).publicKey();
const TOKEN = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();

const FUNDED_CAMPAIGN = {
  id: 1,
  title: "Funded Wells Project",
  status: "Funded" as const,
  raised: 100_000_000n,
  target: 100_000_000n,
  // Past deadline, so the campaign is over and the funds are claimable.
  deadline: 1_700_000_000n,
};

function sym(s: string) {
  return nativeToScVal(s, { type: "symbol" });
}

function campaignScVal(): string {
  const c = FUNDED_CAMPAIGN;
  const entries: [string, xdr.ScVal][] = [
    ["accepted_token", new Address(TOKEN).toScVal()],
    ["beneficiary", new Address(WALLET).toScVal()],
    ["category", nativeToScVal("Disaster", { type: "string" })],
    ["creator", new Address(WALLET).toScVal()],
    ["deadline", nativeToScVal(c.deadline, { type: "u64" })],
    ["description", nativeToScVal("A fully funded campaign past its deadline", { type: "string" })],
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
    const fromFn = (xdr.TransactionEnvelope as any).fromXDR ?? (xdr.TransactionEnvelope as any).fromXdr;
    const env = fromFn.call(xdr.TransactionEnvelope, txXdr, "base64");
    const v1 = typeof (env as any).v1 === "function" ? (env as any).v1() : (env as any).v1;
    const tx = v1 ? (typeof v1.tx === "function" ? v1.tx() : v1.tx) : null;
    const ops = tx ? (typeof tx.operations === "function" ? tx.operations() : tx.operations) : [];
    const op = ops?.[0];
    const opBody = op ? (typeof op.body === "function" ? op.body() : op.body) : null;
    const hostFnOp = opBody ? (typeof opBody.invokeHostFunctionOp === "function" ? opBody.invokeHostFunctionOp() : (opBody.invokeHostFunctionOp ?? opBody.value)) : null;
    const hostFn = hostFnOp ? (typeof hostFnOp.hostFunction === "function" ? hostFnOp.hostFunction() : (hostFnOp.hostFunction ?? hostFnOp.value)) : null;
    const ic = hostFn ? (typeof hostFn.invokeContract === "function" ? hostFn.invokeContract() : (hostFn.invokeContract ?? hostFn.value)) : null;
    if (!ic) return null;
    const fnNameVal = typeof ic.functionName === "function" ? ic.functionName() : ic.functionName;
    const fn = fnNameVal?.toString() ?? "";
    const argsVal = typeof ic.args === "function" ? ic.args() : ic.args;
    const args = Array.isArray(argsVal) ? argsVal.map((a: any) => scValToNative(a)) : [];
    return {
      fn,
      args,
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

async function mockSorobanRPC(page: Page) {
  await page.route("**/soroban/rpc*", async (route) => {
    let body: any = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
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
          result: { id: WALLET, sequence: "100" },
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
            wanted === FUNDED_CAMPAIGN.id
              ? simOk(id, campaignScVal())
              : simError(id, "Campaign not found"),
          ),
        });
        return;
      }

      if (fn === "get_total_campaigns") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(simOk(id, nativeToScVal(1, { type: "u32" }).toXDR("base64"))),
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

      // `claim_funds` and any other read simulate cleanly.
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

const claimControl = (page: Page) => page.getByRole("button", { name: /Claim Funds/i });

test.describe("Claim funds on a funded campaign", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((addr) => {
      (window as any).__mockWalletAddress = addr;
    }, WALLET);
    await mockSorobanRPC(page);
  });

  test("the beneficiary can claim and the control locks afterwards", async ({ page }) => {
    await page.goto("/explore");

    // A funded campaign is excluded from the default "Active" tab.
    await page.getByRole("tab", { name: /^All/i }).click();
    await expect(page.getByText(FUNDED_CAMPAIGN.title)).toBeVisible({ timeout: 15_000 });

    await expect(claimControl(page)).toBeVisible();
    await expect(claimControl(page)).toBeEnabled();

    await claimControl(page).click();

    // Success is surfaced as a confirmed-transaction toast carrying an
    // explorer action built from the tx hash.
    await expect(page.getByText(/Transaction confirmed/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /View Explorer/i })).toBeVisible();

    // The control no longer offers a second claim.
    await expect(claimControl(page)).toHaveCount(0);
    const claimed = page.getByRole("button", { name: /^Claimed$/i });
    await expect(claimed).toBeVisible();
    await expect(claimed).toBeDisabled();
  });
});
