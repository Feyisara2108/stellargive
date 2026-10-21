import { test, expect, type Page } from "@playwright/test";
import { Address, Keypair, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";

// Deterministic test data matching the mock wallet defaults
const MOCK_ADDRESS = "GTEST7SRIEMJXLK3LXKLS5RQ7JLDUZQUDVFNLWIM6DEDCZM5WLPSERV";
const MOCK_TX_HASH = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

const CREATOR = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const TOKEN = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();

function sym(s: string) {
  return nativeToScVal(s, { type: "symbol" });
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

/** Build the `get_campaign` retval as a properly-typed ScVal map, including the
 *  `beneficiaries` vec the contract requires (the old `nativeToScVal` mock left
 *  it out, so `isNativeCampaign` rejected the campaign and the page never loaded). */
function campaignScVal(raised: bigint): string {
  const entries: [string, xdr.ScVal][] = [
    ["accepted_token", new Address(TOKEN).toScVal()],
    ["beneficiary", new Address(CREATOR).toScVal()],
    [
      "beneficiaries",
      xdr.ScVal.scvVec([
        xdr.ScVal.scvVec([
          new Address(CREATOR).toScVal(),
          nativeToScVal(10000, { type: "u32" }),
        ]),
      ]),
    ],
    ["category", nativeToScVal("relief", { type: "string" })],
    ["creator", new Address(CREATOR).toScVal()],
    ["deadline", nativeToScVal(BigInt(Math.floor(Date.now() / 1000) + 86_400), { type: "u64" })],
    ["description", nativeToScVal("Help the victims of the recent floods.", { type: "string" })],
    ["id", nativeToScVal(1n, { type: "u64" })],
    ["metadata_uri", nativeToScVal("", { type: "string" })],
    ["raised_amount", nativeToScVal(raised, { type: "i128" })],
    ["status", xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: sym("Active"), val: xdr.ScVal.scvVoid() })])],
    ["target_amount", nativeToScVal(100_000_000n, { type: "i128" })],
    ["title", nativeToScVal("Flood Relief 2024", { type: "string" })],
    ["twitter", nativeToScVal("", { type: "string" })],
    ["website", nativeToScVal("", { type: "string" })],
  ];
  return xdr.ScVal.scvMap(
    entries.map(([k, v]) => new xdr.ScMapEntry({ key: sym(k), val: v })),
  ).toXDR("base64");
}

/** Decode the invoked contract function + args from a simulateTransaction request. */
function decodeInvocation(txXdr: string): { fn: string; args: unknown[] } | null {
  try {
    const fromFn =
      (xdr.TransactionEnvelope as any).fromXDR ?? (xdr.TransactionEnvelope as any).fromXdr;
    const env = fromFn.call(xdr.TransactionEnvelope, txXdr, "base64");
    const v1 = typeof (env as any).v1 === "function" ? (env as any).v1() : (env as any).v1;
    const tx = v1 ? (typeof v1.tx === "function" ? v1.tx() : v1.tx) : null;
    const ops = tx ? (typeof tx.operations === "function" ? tx.operations() : tx.operations) : [];
    const op = ops?.[0];
    const opBody = op ? (typeof op.body === "function" ? op.body() : op.body) : null;
    const hostFnOp = opBody
      ? typeof opBody.invokeHostFunctionOp === "function"
        ? opBody.invokeHostFunctionOp()
        : opBody.invokeHostFunctionOp ?? opBody.value
      : null;
    const hostFn = hostFnOp
      ? typeof hostFnOp.hostFunction === "function"
        ? hostFnOp.hostFunction()
        : hostFnOp.hostFunction ?? hostFnOp.value
      : null;
    const ic = hostFn
      ? typeof hostFn.invokeContract === "function"
        ? hostFn.invokeContract()
        : hostFn.invokeContract ?? hostFn.value
      : null;
    if (!ic) return null;
    const fnNameVal = typeof ic.functionName === "function" ? ic.functionName() : ic.functionName;
    const fn = fnNameVal?.toString() ?? "";
    const argsVal = typeof ic.args === "function" ? ic.args() : ic.args;
    const args = Array.isArray(argsVal) ? argsVal.map((a: any) => scValToNative(a)) : [];
    return { fn, args };
  } catch {
    return null;
  }
}

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
      const call = decodeInvocation(body.params?.transaction ?? "");
      const fn = call?.fn ?? "";
      let retvalXdr: string;

      if (fn === "get_campaign") {
        retvalXdr = campaignScVal(raisedAmount);
      } else if (fn === "balance") {
        retvalXdr = nativeToScVal(1_000_000_000n, { type: "i128" }).toXDR("base64"); // 100 XLM
      } else if (fn === "get_total_campaigns") {
        retvalXdr = nativeToScVal(1, { type: "u32" }).toXDR("base64");
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
        body: JSON.stringify(simOk(body.id, retvalXdr)),
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
