import { test, expect, type Page } from "@playwright/test";
import { Address, Keypair, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";

/**
 * E2E: Explore search, status filters, and sort (#272 — covers #225/#230).
 *
 * Discovery is a top-of-funnel surface, so this drives the real Explore page
 * against a seeded set of campaigns served entirely through mocked Soroban RPC
 * (no live testnet). It asserts that:
 *   - the default "Active" filter shows only active campaigns,
 *   - search narrows the result set,
 *   - the status filters change the result set,
 *   - filter/sort state is reflected in the URL and survives a reload.
 */

const CREATOR = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey();
const TOKEN = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey();

type Seed = {
  id: number;
  title: string;
  status: "Active" | "Funded";
  raised: bigint;
  target: bigint;
};

// A deterministic, seeded catalogue. Four are "active" (raised < target,
// status Active); one is fully "funded".
const CAMPAIGNS: Seed[] = [
  {
    id: 1,
    title: "Flood Relief Kenya",
    status: "Active",
    raised: 20_000_000n,
    target: 100_000_000n,
  },
  {
    id: 2,
    title: "Earthquake Aid Nepal",
    status: "Active",
    raised: 50_000_000n,
    target: 100_000_000n,
  },
  {
    id: 3,
    title: "School Rebuild Project",
    status: "Active",
    raised: 10_000_000n,
    target: 100_000_000n,
  },
  {
    id: 4,
    title: "Clean Water Wells",
    status: "Active",
    raised: 80_000_000n,
    target: 100_000_000n,
  },
  {
    id: 5,
    title: "Medical Fund Complete",
    status: "Funded",
    raised: 100_000_000n,
    target: 100_000_000n,
  },
];

const ACTIVE_COUNT = CAMPAIGNS.filter((c) => c.status === "Active" && c.raised < c.target).length;

function sym(s: string) {
  return nativeToScVal(s, { type: "symbol" });
}

function campaignScVal(c: Seed): string {
  const entries: [string, xdr.ScVal][] = [
    ["accepted_token", new Address(TOKEN).toScVal()],
    ["beneficiary", new Address(CREATOR).toScVal()],
    ["category", nativeToScVal("Disaster", { type: "string" })],
    ["creator", new Address(CREATOR).toScVal()],
    ["deadline", nativeToScVal(9_999_999_999n, { type: "u64" })],
    ["description", nativeToScVal("Seeded campaign", { type: "string" })],
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
  const map = xdr.ScVal.scvMap(
    entries.map(([k, v]) => new xdr.ScMapEntry({ key: sym(k), val: v })),
  );
  return map.toXDR("base64");
}

/** Decode the contract function + args from a simulateTransaction request. */
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

function ok(id: number, retvalXdr: string) {
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
  return {
    jsonrpc: "2.0",
    id,
    result: { error: message, events: [], latestLedger: 1000 },
  };
}

async function mockSorobanRPC(page: Page) {
  await page.route("**/soroban/rpc*", async (route) => {
    const request = route.request();
    let body: any = {};
    try {
      body = JSON.parse(request.postData() || "{}");
    } catch {
      // not JSON — pass through
    }
    const method = body.method || "";
    const id = body.id;

    if (method === "simulateTransaction") {
      const txXdr = body.params?.transaction ?? "";
      const call = decodeInvocation(txXdr);
      const fn = call?.fn ?? "";

      if (fn === "get_campaign") {
        const wanted = Number(call?.args?.[0] ?? 0);
        const seed = CAMPAIGNS.find((c) => c.id === wanted);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            seed ? ok(id, campaignScVal(seed)) : simError(id, "Campaign not found"),
          ),
        });
        return;
      }

      if (fn === "get_total_campaigns") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            ok(id, nativeToScVal(CAMPAIGNS.length, { type: "u32" }).toXDR("base64")),
          ),
        });
        return;
      }

      if (fn === "decimals") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(ok(id, nativeToScVal(7, { type: "u32" }).toXDR("base64"))),
        });
        return;
      }

      if (fn === "name" || fn === "symbol") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(ok(id, nativeToScVal("XLM", { type: "string" }).toXDR("base64"))),
        });
        return;
      }

      // Unknown read — return an empty void result.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ok(id, xdr.ScVal.scvVoid().toXDR("base64"))),
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

// A campaign card links to its detail page, so count those anchors.
const cards = (page: Page) => page.locator('a[href^="/campaign/"]');

test.describe("Explore — search, filters, and sort", () => {
  test.beforeEach(async ({ page }) => {
    await mockSorobanRPC(page);
  });

  test("default Active filter shows only active campaigns", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByRole("heading", { name: /Explore Campaigns/i })).toBeVisible();
    await expect(cards(page)).toHaveCount(ACTIVE_COUNT);
  });

  test("search narrows the result set", async ({ page }) => {
    await page.goto("/explore");
    await expect(cards(page)).toHaveCount(ACTIVE_COUNT);

    await page.getByPlaceholder(/Search by title or creator/i).fill("Flood");
    // Debounced search (300ms) then a single matching card.
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByText("Flood Relief Kenya")).toBeVisible();
  });

  test("status filters change the result set", async ({ page }) => {
    await page.goto("/explore");
    await expect(cards(page)).toHaveCount(ACTIVE_COUNT);

    await page.getByRole("tab", { name: /^All/i }).click();
    await expect(cards(page)).toHaveCount(CAMPAIGNS.length);

    await page.getByRole("tab", { name: /^Funded/i }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByText("Medical Fund Complete")).toBeVisible();
  });

  test("filter and sort state persists in the URL across reload", async ({ page }) => {
    await page.goto("/explore");

    await page.getByRole("tab", { name: /^Funded/i }).click();
    await page.getByRole("tab", { name: /Ending Soon/i }).click();

    await expect(page).toHaveURL(/status=funded/);
    await expect(page).toHaveURL(/sort=ending-soon/);

    await page.reload();

    // State restored from the URL after reload.
    await expect(page).toHaveURL(/status=funded/);
    await expect(page).toHaveURL(/sort=ending-soon/);
    await expect(page.getByRole("tab", { name: /^Funded/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(cards(page)).toHaveCount(1);
  });
});
