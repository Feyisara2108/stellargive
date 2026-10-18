import { test, expect, type Page } from "@playwright/test";
import { Address, Keypair, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";

/**
 * E2E: Explore category filter, search empty-state, and "Load more" pagination (#1133).
 *
 * The previous version of this file asserted against markup that never existed
 * (a `[data-test-id='category-filter']` dropdown, a `#explore-search` fill, a
 * "Load More" button) and so every test in it failed. This rewrite drives the
 * real Explore page — the desktop category tablist, the `#explore-search`
 * input, and the "Load more" button — against a seeded catalogue served
 * through mocked Soroban RPC, mirroring the approach in explore.spec.ts (which
 * already covers status tabs, free-text search, and URL persistence, so this
 * file sticks to what that one doesn't: category filtering, the no-results
 * empty state, and pagination).
 */

const CREATOR = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey();
const TOKEN = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 4)).publicKey();

type Seed = {
  id: number;
  title: string;
  category: string;
  raised: bigint;
  target: bigint;
};

// 11 active campaigns: 9 fit on the first page, 2 spill onto "Load more".
// Categories are split so the category tablist narrows the visible count.
const CAMPAIGNS: Seed[] = [
  ...Array.from({ length: 3 }, (_, i) => ({
    id: i + 1,
    title: `Medical Fund ${i + 1}`,
    category: "Medical",
    raised: 10_000_000n,
    target: 100_000_000n,
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    id: i + 10,
    title: `Food Drive ${i + 1}`,
    category: "Food",
    raised: 10_000_000n,
    target: 100_000_000n,
  })),
  ...Array.from({ length: 1 }, (_, i) => ({
    id: i + 20,
    title: `School Supplies ${i + 1}`,
    category: "Education",
    raised: 10_000_000n,
    target: 100_000_000n,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: i + 30,
    title: `Relief Effort ${i + 1}`,
    category: "Relief",
    raised: 10_000_000n,
    target: 100_000_000n,
  })),
];

function sym(s: string) {
  return nativeToScVal(s, { type: "symbol" });
}

function campaignMap(c: Seed): xdr.ScVal {
  const entries: [string, xdr.ScVal][] = [
    ["accepted_token", new Address(TOKEN).toScVal()],
    ["beneficiary", new Address(CREATOR).toScVal()],
    ["category", nativeToScVal(c.category, { type: "string" })],
    ["creator", new Address(CREATOR).toScVal()],
    ["deadline", nativeToScVal(9_999_999_999n, { type: "u64" })],
    ["description", nativeToScVal("Seeded campaign", { type: "string" })],
    ["id", nativeToScVal(BigInt(c.id), { type: "u64" })],
    ["metadata_uri", nativeToScVal("", { type: "string" })],
    ["raised_amount", nativeToScVal(c.raised, { type: "i128" })],
    [
      "status",
      xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: sym("Active"), val: xdr.ScVal.scvVoid() })]),
    ],
    ["target_amount", nativeToScVal(c.target, { type: "i128" })],
    ["title", nativeToScVal(c.title, { type: "string" })],
    ["twitter", nativeToScVal("", { type: "string" })],
    ["website", nativeToScVal("", { type: "string" })],
  ];
  return xdr.ScVal.scvMap(entries.map(([k, v]) => new xdr.ScMapEntry({ key: sym(k), val: v })));
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

      if (fn === "get_campaigns_paged") {
        const offset = Number(call?.args?.[0] ?? 0);
        const limit = Number(call?.args?.[1] ?? 0);
        const page_ = CAMPAIGNS.slice(offset, offset + limit);
        const vec = xdr.ScVal.scvVec(page_.map(campaignMap));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(ok(id, vec.toXDR("base64"))),
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

      // Unknown read (e.g. get_total_campaigns from other page chrome) —
      // return an empty void result rather than erroring the whole page.
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

test.describe("Explore — category filter, empty state, and pagination", () => {
  // Force a desktop viewport so the (hidden md:flex) category tablist is
  // present on every browser project, including the mobile ones.
  test.use({ viewport: { width: 1280, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await mockSorobanRPC(page);
  });

  test("category tab narrows the visible campaign count", async ({ page }) => {
    await page.goto("/explore");
    await expect(cards(page)).toHaveCount(9); // first page, hasMore still true

    const categoryTabs = page.getByRole("tablist", { name: "Category tabs" });
    await categoryTabs.getByRole("tab", { name: /^Medical/i }).click();

    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByText("Medical Fund 1")).toBeVisible();
    await expect(page.getByText("Food Drive 1")).not.toBeVisible();
  });

  test("a search with no matches shows the empty state", async ({ page }) => {
    await page.goto("/explore");
    await expect(cards(page)).toHaveCount(9);

    await page.getByPlaceholder(/Search by title or creator/i).fill("zzz-nonexistent-zzz");

    await expect(page.getByText("No campaigns match your search.")).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
  });

  test("'Load more' reveals the rest of the catalogue and then disappears", async ({ page }) => {
    await page.goto("/explore");
    await expect(cards(page)).toHaveCount(9);

    const loadMore = page.getByRole("button", { name: /^Load more$/i });
    await expect(loadMore).toBeVisible();

    await loadMore.click();

    await expect(cards(page)).toHaveCount(CAMPAIGNS.length);
    await expect(loadMore).toBeHidden();
  });
});
