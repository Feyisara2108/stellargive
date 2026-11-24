import { test, expect, type Page } from "@playwright/test";
import { Address, Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import type { RpcRequestBody } from "./support/xdr";

/**
 * E2E: the activity feed (/activity).
 *
 * Soroban RPC `getEvents` is mocked with a fixed set of contract events so the
 * page's client-side behaviour can be asserted deterministically:
 *   - events render newest-first with a readable summary per event type,
 *   - the type tabs (All / Created / Donated / Claimed) filter the list,
 *   - the search box matches donor addresses and campaign ids, debounced, and
 *     stays in sync with the `?search=` URL parameter,
 *   - empty and error states, including recovering with Retry.
 *
 * The feed renders a table on desktop and cards on mobile, and these specs run
 * on both, so rows are located through their visible explorer tx links, which
 * exist exactly once per visible row in either layout.
 *
 *   ledger  topic     summary
 *   1006    claimed   10 XLM claimed by CAROL from Campaign #1
 *   1005    received  12 XLM donated by ALICE to Campaign #1
 *   1004    received  3 XLM donated by BOB to Campaign #8
 *   1003    created   New campaign #1 created with a target of 500 XLM
 */

const ALICE = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 31)).publicKey();
const BOB = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 32)).publicKey();
const CAROL = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 33)).publicKey();

const XLM = 10_000_000n;

/** A 64-char hex tx hash that is unique per `n`. */
const txHash = (n: number) => n.toString(16).padStart(2, "0").repeat(32);

const HASH = {
  claimed: txHash(6),
  aliceDonation: txHash(5),
  bobDonation: txHash(4),
  created: txHash(3),
};

function sym(s: string) {
  return nativeToScVal(s, { type: "symbol" });
}

function struct(fields: [string, xdr.ScVal][]): xdr.ScVal {
  return xdr.ScVal.scvMap(fields.map(([k, v]) => new xdr.ScMapEntry({ key: sym(k), val: v })));
}

const u64 = (n: number) => nativeToScVal(BigInt(n), { type: "u64" });

/** A contract event in the raw shape the `getEvents` RPC method returns. */
function rawEvent(opts: { ledger: number; hash: string; topic: xdr.ScVal[]; value: xdr.ScVal }) {
  return {
    id: String(opts.ledger).padStart(10, "0"),
    type: "contract",
    ledger: opts.ledger,
    ledgerClosedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, opts.ledger % 60)).toISOString(),
    transactionIndex: 0,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: opts.hash,
    // Empty string so the SDK skips constructing a Contract from it.
    contractId: "",
    topic: opts.topic.map((t) => t.toXDR("base64")),
    value: opts.value.toXDR("base64"),
  };
}

const received = (ledger: number, hash: string, donor: string, campaignId: number, xlm: bigint) =>
  rawEvent({
    ledger,
    hash,
    topic: [sym("donation"), sym("received")],
    value: struct([
      ["campaign_id", u64(campaignId)],
      ["donor", new Address(donor).toScVal()],
      ["amount", nativeToScVal(xlm * XLM, { type: "i128" })],
    ]),
  });

const created = (ledger: number, hash: string, campaignId: number, creator: string, xlm: bigint) =>
  rawEvent({
    ledger,
    hash,
    topic: [sym("created")],
    value: struct([
      ["id", u64(campaignId)],
      ["creator", new Address(creator).toScVal()],
      ["target_amount", nativeToScVal(xlm * XLM, { type: "i128" })],
    ]),
  });

const claimed = (ledger: number, hash: string, campaignId: number, who: string, xlm: bigint) =>
  rawEvent({
    ledger,
    hash,
    topic: [sym("claimed"), u64(campaignId)],
    value: struct([
      ["campaign_id", u64(campaignId)],
      ["beneficiary", new Address(who).toScVal()],
      ["amount", nativeToScVal(xlm * XLM, { type: "i128" })],
    ]),
  });

const ALL_EVENTS = [
  claimed(1006, HASH.claimed, 1, CAROL, 10n),
  received(1005, HASH.aliceDonation, ALICE, 1, 12n),
  received(1004, HASH.bobDonation, BOB, 8, 3n),
  created(1003, HASH.created, 1, CAROL, 500n),
];

interface MockActivityRpc {
  /** Flip to make `getEvents` fail (or recover) mid-test. */
  failEvents: boolean;
}

async function mockActivityRpc(
  page: Page,
  options: { events?: ReturnType<typeof rawEvent>[]; failEvents?: boolean } = {},
): Promise<MockActivityRpc> {
  const state: MockActivityRpc = { failEvents: options.failEvents ?? false };
  const events = options.events ?? ALL_EVENTS;

  // Donor/beneficiary rows try to resolve a display name via Stellar Expert; keep it offline.
  await page.route("**/api.stellar.expert/**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );

  await page.route("**/soroban/rpc*", async (route) => {
    let body: RpcRequestBody = {};
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

    if (method === "getHealth") {
      return respond({
        status: "healthy",
        latestLedger: 1010,
        oldestLedger: 1,
        ledgerRetentionWindow: 1010,
      });
    }

    if (method === "getLatestLedger") {
      return respond({ id: "latest", protocolVersion: 22, sequence: 1010 });
    }

    if (method === "getEvents") {
      if (state.failEvents) {
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
        events,
        latestLedger: 1010,
        oldestLedger: 1,
        latestLedgerCloseTime: "1767225600",
        oldestLedgerCloseTime: "1767225600",
        cursor: "",
      });
    }

    return route.continue();
  });

  return state;
}

// ─── locators ────────────────────────────────────────────────────────────────

/** One visible explorer tx link per visible row, in either the table or card layout. */
const visibleTxLinks = (page: Page) => page.locator('a[href*="/explorer/testnet/tx/"]:visible');

/** Tx hashes of the visible rows, top to bottom. */
async function visibleHashes(page: Page): Promise<string[]> {
  return visibleTxLinks(page).evaluateAll((links) =>
    links.map((a) => (a.getAttribute("href") ?? "").split("/tx/")[1] ?? ""),
  );
}

async function expectRows(page: Page, expected: string[]) {
  await expect.poll(() => visibleHashes(page), { timeout: 15_000 }).toEqual(expected);
}

/** A visible piece of row text (table cell or card paragraph) matching `text`. */
const rowText = (page: Page, text: string | RegExp) =>
  page.locator("td:visible, p:visible").filter({ hasText: text });

const searchBox = (page: Page) => page.getByLabel("Search activity by donor address or campaign ID");
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

const NEWEST_FIRST = [HASH.claimed, HASH.aliceDonation, HASH.bobDonation, HASH.created];

test.describe("Activity feed (/activity)", () => {
  test("lists events newest first with a summary for each event type", async ({ page }) => {
    await mockActivityRpc(page);
    await page.goto("/activity");

    await expect(page.getByRole("heading", { name: "Transaction History" })).toBeVisible();
    await expectRows(page, NEWEST_FIRST);

    await expect(rowText(page, /10 XLM claimed/).filter({ hasText: /Campaign #1/ })).toBeVisible();
    await expect(
      rowText(page, /12 XLM donated/).filter({ hasText: /Campaign #1/ }),
    ).toBeVisible();
    await expect(rowText(page, /3 XLM donated/).filter({ hasText: /Campaign #8/ })).toBeVisible();
    await expect(
      rowText(page, /New campaign #1 created with a target of 500 XLM/),
    ).toBeVisible();

    // The donor's full address is exposed on its link.
    await expect(page.locator(`a[title="${ALICE}"]:visible`)).toHaveCount(1);
  });

  test("type tabs filter the list and report the selected tab", async ({ page }) => {
    await mockActivityRpc(page);
    await page.goto("/activity");
    await expectRows(page, NEWEST_FIRST);
    await expect(tab(page, "All")).toHaveAttribute("aria-selected", "true");

    await tab(page, "Donated").click();
    await expect(tab(page, "Donated")).toHaveAttribute("aria-selected", "true");
    await expect(tab(page, "All")).toHaveAttribute("aria-selected", "false");
    await expectRows(page, [HASH.aliceDonation, HASH.bobDonation]);

    await tab(page, "Created").click();
    await expectRows(page, [HASH.created]);

    await tab(page, "Claimed").click();
    await expectRows(page, [HASH.claimed]);

    await tab(page, "All").click();
    await expectRows(page, NEWEST_FIRST);
  });

  test("search matches a donor address, debounced, and mirrors the URL", async ({ page }) => {
    await mockActivityRpc(page);
    await page.goto("/activity");
    await expectRows(page, NEWEST_FIRST);

    await searchBox(page).fill(ALICE);

    // The filter waits for typing to pause (300ms debounce), so right after the
    // input changes every row is still listed...
    await expect(visibleTxLinks(page)).toHaveCount(4, { timeout: 100 });
    // ...and only then narrows to the donor's single donation.
    await expectRows(page, [HASH.aliceDonation]);

    await expect(page).toHaveURL(new RegExp(`[?&]search=${ALICE}`));

    // The clear button empties the box, restores the list and drops the URL param.
    await page.getByRole("button", { name: "Clear search input" }).click();
    await expect(searchBox(page)).toHaveValue("");
    await expectRows(page, NEWEST_FIRST);
    await expect(page).not.toHaveURL(/search=/);
  });

  test("search is case-insensitive and also matches a campaign id", async ({ page }) => {
    await mockActivityRpc(page);
    await page.goto("/activity");
    await expectRows(page, NEWEST_FIRST);

    await searchBox(page).fill(BOB.toLowerCase());
    await expectRows(page, [HASH.bobDonation]);

    // Campaign #8 only has Bob's donation.
    await searchBox(page).fill("8");
    await expectRows(page, [HASH.bobDonation]);

    // Campaign #1 has the claim, Alice's donation and the creation.
    // (Campaign ids 1 and 8 are used because base32 addresses never contain those digits.)
    await searchBox(page).fill("1");
    await expectRows(page, [HASH.claimed, HASH.aliceDonation, HASH.created]);
  });

  test("search combines with the type tabs", async ({ page }) => {
    await mockActivityRpc(page);
    await page.goto("/activity");
    await expectRows(page, NEWEST_FIRST);

    await searchBox(page).fill("1");
    await expectRows(page, [HASH.claimed, HASH.aliceDonation, HASH.created]);

    await tab(page, "Donated").click();
    await expectRows(page, [HASH.aliceDonation]);

    await tab(page, "Created").click();
    await expectRows(page, [HASH.created]);

    // The only created event is for campaign #1, so searching "8" leaves nothing.
    await searchBox(page).fill("8");
    await expect(page.getByText("No activity matches your search.")).toBeVisible();
    await expect(visibleTxLinks(page)).toHaveCount(0);
  });

  test("opens with the search from the ?search= URL parameter applied", async ({ page }) => {
    await mockActivityRpc(page);
    await page.goto(`/activity?search=${BOB}`);

    await expect(searchBox(page)).toHaveValue(BOB);
    await expectRows(page, [HASH.bobDonation]);
  });

  test("shows a no-results state for a search with no match and can clear it", async ({ page }) => {
    await mockActivityRpc(page);
    await page.goto("/activity");
    await expectRows(page, NEWEST_FIRST);

    await searchBox(page).fill("no-such-donor");

    await expect(page.getByText("No activity matches your search.")).toBeVisible();
    await expect(visibleTxLinks(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Clear search", exact: true }).click();

    await expect(searchBox(page)).toHaveValue("");
    await expectRows(page, NEWEST_FIRST);
  });

  test("shows the empty state when the contract has no events", async ({ page }) => {
    await mockActivityRpc(page, { events: [] });
    await page.goto("/activity");

    await expect(page.getByText(/No\s+events found yet\./)).toBeVisible({ timeout: 15_000 });
    await expect(visibleTxLinks(page)).toHaveCount(0);
    await expect(page.getByText("Unable to load activity")).toHaveCount(0);
  });

  test("shows a per-type empty state when a tab has no events", async ({ page }) => {
    await mockActivityRpc(page, {
      events: [received(1005, HASH.aliceDonation, ALICE, 1, 12n)],
    });
    await page.goto("/activity");
    await expectRows(page, [HASH.aliceDonation]);

    await tab(page, "Created").click();

    await expect(page.getByText("No created events found yet.")).toBeVisible();
    await expect(visibleTxLinks(page)).toHaveCount(0);

    // Switching back brings the donation back.
    await tab(page, "All").click();
    await expectRows(page, [HASH.aliceDonation]);
  });

  test("shows an error state when events fail to load and recovers on Retry", async ({ page }) => {
    const rpc = await mockActivityRpc(page, { failEvents: true });
    await page.goto("/activity");

    // The query retries once with back-off before surfacing the error.
    const alert = page.getByRole("alert").filter({ hasText: "Unable to load activity" });
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(visibleTxLinks(page)).toHaveCount(0);

    rpc.failEvents = false;
    await alert.getByRole("button", { name: "Retry" }).click();

    await expectRows(page, NEWEST_FIRST);
    await expect(page.getByText("Unable to load activity")).toHaveCount(0);
  });
});
