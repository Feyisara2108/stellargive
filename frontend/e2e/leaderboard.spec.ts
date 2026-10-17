import fs from "fs";
import { test, expect, type Page } from "@playwright/test";
import { Address, Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";

/**
 * E2E: donor leaderboard (#1158).
 *
 * `/leaderboard` aggregates `received` contract events into one row per donor.
 * Soroban RPC is fully mocked with a fixed set of donations whose timestamps are
 * set relative to "now", so the three time ranges each produce a different
 * ranking:
 *
 *   donor   90d ago   15d ago   2d ago   | all    monthly  weekly
 *   ALICE   100 XLM      -         -     | 100      -        -
 *   BOB        -       30 XLM    20 XLM  |  50     50       20
 *   CAROL      -         -       40 XLM  |  40     40       40
 *   DAVE       -         -        5 XLM  |   5      5        5
 *
 * plus a large anonymous (zero address) donation that must never be ranked.
 */

const ALICE = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 21)).publicKey();
const BOB = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 22)).publicKey();
const CAROL = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 23)).publicKey();
const DAVE = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 24)).publicKey();
const ZERO_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const XLM = 10_000_000n;
const DAY_MS = 24 * 60 * 60 * 1000;

const DONATIONS: { donor: string; xlm: bigint; campaignId: number; daysAgo: number }[] = [
  { donor: ALICE, xlm: 100n, campaignId: 1, daysAgo: 90 },
  { donor: BOB, xlm: 30n, campaignId: 1, daysAgo: 15 },
  { donor: BOB, xlm: 20n, campaignId: 2, daysAgo: 2 },
  { donor: CAROL, xlm: 40n, campaignId: 3, daysAgo: 2 },
  { donor: DAVE, xlm: 5n, campaignId: 1, daysAgo: 2 },
  { donor: ZERO_ADDRESS, xlm: 500n, campaignId: 1, daysAgo: 2 },
];

function sym(s: string) {
  return nativeToScVal(s, { type: "symbol" });
}

function struct(fields: [string, xdr.ScVal][]): xdr.ScVal {
  return xdr.ScVal.scvMap(fields.map(([k, v]) => new xdr.ScMapEntry({ key: sym(k), val: v })));
}

/** A `donation`/`received` event as returned by the raw `getEvents` RPC method. */
function receivedEvent(index: number, d: (typeof DONATIONS)[number]) {
  const value = struct([
    ["campaign_id", nativeToScVal(BigInt(d.campaignId), { type: "u64" })],
    ["donor", new Address(d.donor).toScVal()],
    ["amount", nativeToScVal(d.xlm * XLM, { type: "i128" })],
  ]);

  return {
    id: String(index + 1).padStart(10, "0"),
    type: "contract",
    ledger: 1000 + index,
    ledgerClosedAt: new Date(Date.now() - d.daysAgo * DAY_MS).toISOString(),
    transactionIndex: 0,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: `${"ab".repeat(31)}${String(index).padStart(2, "0")}`,
    // Empty string so the SDK skips constructing a Contract from it.
    contractId: "",
    topic: [sym("donation").toXDR("base64"), sym("received").toXDR("base64")],
    value: value.toXDR("base64"),
  };
}

async function mockSorobanRPC(page: Page, options: { failEvents?: boolean } = {}) {
  // Donor rows try to resolve a display name via Stellar Expert; keep it offline.
  await page.route("**/api.stellar.expert/**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );

  await page.route("**/soroban/rpc*", async (route) => {
    let body: any = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      // not JSON
    }
    const { method, id } = body;
    const respond = (result: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jsonrpc: "2.0", id, result }),
      });

    if (method === "getLatestLedger") {
      return respond({ id: "latest", protocolVersion: 22, sequence: 1000 });
    }

    if (method === "getEvents") {
      if (options.failEvents) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: "Internal error" },
          }),
        });
      }
      return respond({
        events: DONATIONS.map((d, i) => receivedEvent(i, d)),
        latestLedger: 1000,
        oldestLedger: 0,
        latestLedgerCloseTime: String(Math.floor(Date.now() / 1000)),
        oldestLedgerCloseTime: "0",
        cursor: "",
      });
    }

    return route.continue();
  });
}

/** Full addresses of the ranked donors, top to bottom (each row's link carries it as its title). */
async function rankedDonors(page: Page): Promise<string[]> {
  return page
    .getByRole("list", { name: "Donor leaderboard" })
    .locator("li a[title]")
    .evaluateAll((links) => links.map((a) => a.getAttribute("title") ?? ""));
}

async function expectRanking(page: Page, expected: string[]) {
  await expect.poll(() => rankedDonors(page), { timeout: 15_000 }).toEqual(expected);
}

test.describe("Leaderboard (/leaderboard)", () => {
  test("ranks donors by total donated, highest first, excluding anonymous donations", async ({
    page,
  }) => {
    await mockSorobanRPC(page);
    await page.goto("/leaderboard");

    await expect(page.getByRole("heading", { name: "Donor Leaderboard" })).toBeVisible();
    await expectRanking(page, [ALICE, BOB, CAROL, DAVE]);

    // Anonymous (zero-address) giving is never ranked, even though it is the largest.
    expect(await rankedDonors(page)).not.toContain(ZERO_ADDRESS);

    const rows = page.getByRole("list", { name: "Donor leaderboard" }).getByRole("listitem");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText("100 XLM");
    await expect(rows.nth(0)).toContainText("1 donation · 1 campaign");
    await expect(rows.nth(1)).toContainText("50 XLM");
    await expect(rows.nth(1)).toContainText("2 donations · 2 campaigns");
    await expect(rows.nth(2)).toContainText("40 XLM");
    await expect(rows.nth(3)).toContainText("5 XLM");

    // Rank badges follow the order.
    for (const rank of [1, 2, 3, 4]) {
      await expect(page.getByLabel(`Rank ${rank}`)).toBeVisible();
    }

    // Summary stats cover only the ranked donors: 100 + 50 + 40 + 5.
    await expect(page.getByText("Donors ranked")).toBeVisible();
    await expect(page.getByText("195 XLM", { exact: true })).toBeVisible();
  });

  test("monthly range drops donations older than 30 days and re-ranks", async ({ page }) => {
    await mockSorobanRPC(page);
    await page.goto("/leaderboard");
    await expectRanking(page, [ALICE, BOB, CAROL, DAVE]);

    await page.getByRole("button", { name: "Monthly" }).click();

    await expect(page).toHaveURL(/\/leaderboard\?range=monthly/);
    await expectRanking(page, [BOB, CAROL, DAVE]);
    const rows = page.getByRole("list", { name: "Donor leaderboard" }).getByRole("listitem");
    await expect(rows.nth(0)).toContainText("50 XLM");
  });

  test("weekly range keeps only the last 7 days, changing the order", async ({ page }) => {
    await mockSorobanRPC(page);
    await page.goto("/leaderboard");
    await expectRanking(page, [ALICE, BOB, CAROL, DAVE]);

    await page.getByRole("button", { name: "Weekly" }).click();

    await expect(page).toHaveURL(/\/leaderboard\?range=weekly/);
    // BOB's 15-day-old gift is out, so CAROL (40) now outranks BOB (20).
    await expectRanking(page, [CAROL, BOB, DAVE]);
    const rows = page.getByRole("list", { name: "Donor leaderboard" }).getByRole("listitem");
    await expect(rows.nth(1)).toContainText("20 XLM");
    await expect(rows.nth(1)).toContainText("1 donation · 1 campaign");

    // Returning to All Time restores the full ranking.
    await page.getByRole("button", { name: "All Time" }).click();
    await expect(page).toHaveURL(/\/leaderboard\?range=all/);
    await expectRanking(page, [ALICE, BOB, CAROL, DAVE]);
  });

  test("opens directly on a range from the URL", async ({ page }) => {
    await mockSorobanRPC(page);
    await page.goto("/leaderboard?range=weekly");

    await expectRanking(page, [CAROL, BOB, DAVE]);
  });

  test("exports the ranked donors as a CSV for the active range", async ({ page }) => {
    await mockSorobanRPC(page);
    await page.goto("/leaderboard?range=weekly");
    await expectRanking(page, [CAROL, BOB, DAVE]);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export CSV/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(
      /^stellargive-leaderboard-weekly-\d{4}-\d{2}-\d{2}\.csv$/,
    );

    const csv = fs.readFileSync((await download.path())!, "utf-8");
    expect(csv.split("\r\n")).toEqual([
      "Rank,Donor Address,Total Donated (XLM),Donations,Campaigns",
      `1,${CAROL},40,1,1`,
      `2,${BOB},20,1,1`,
      `3,${DAVE},5,1,1`,
    ]);
  });

  test("exports the full all-time ranking in rank order", async ({ page }) => {
    await mockSorobanRPC(page);
    await page.goto("/leaderboard");
    await expectRanking(page, [ALICE, BOB, CAROL, DAVE]);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export CSV/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^stellargive-leaderboard-all-/);
    const csv = fs.readFileSync((await download.path())!, "utf-8");
    expect(csv.split("\r\n")).toEqual([
      "Rank,Donor Address,Total Donated (XLM),Donations,Campaigns",
      `1,${ALICE},100,1,1`,
      `2,${BOB},50,2,2`,
      `3,${CAROL},40,1,1`,
      `4,${DAVE},5,1,1`,
    ]);
  });

  test("highlights the connected wallet and shows its rank", async ({ page }) => {
    await page.addInitScript((addr) => {
      (window as any).__mockWalletAddress = addr;
    }, CAROL);
    await mockSorobanRPC(page);
    await page.goto("/leaderboard");

    await expect(page.getByRole("button", { name: /My Rank \(#3\)/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("#rank-3")).toContainText("(You)");
  });

  test("shows an error state when the events cannot be loaded", async ({ page }) => {
    await mockSorobanRPC(page, { failEvents: true });
    await page.goto("/leaderboard");

    await expect(page.getByText("Unable to load on-chain events.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: /Export CSV/i })).toHaveCount(0);
  });
});
