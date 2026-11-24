import { test, expect, type Page } from "@playwright/test";
import { Address, Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { type CampaignSeed, campaignsPagedScVal, decodeInvocation, ok } from "./support/rpc-mock";
import type { RpcRequestBody } from "./support/xdr";

/**
 * E2E: the /admin panel.
 *
 * Covers, against a mocked Soroban RPC and the mock wallet:
 *   - access gating for no wallet, a connected non-owner, and the contract owner,
 *   - the pause confirmation flow (type-to-confirm, cancel, confirm),
 *   - posting a campaign update from the campaign owner's panel.
 *
 * The wallet account is pinned per test with the `__mockWalletAddress` /
 * `__mockWalletDisconnected` init-script overrides. Contract ownership is
 * modelled by what the mocked `get_owner` read returns, and campaign ownership
 * by which campaigns `get_campaigns_by_creator` returns for the wallet.
 */

const MOCK_TX_HASH = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

const OWNER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7)).publicKey();
const OUTSIDER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 8)).publicKey();
const CAMPAIGN_CREATOR = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 9)).publicKey();

const OWNED_CAMPAIGN: CampaignSeed = {
  id: 1,
  title: "Admin Relief Drive",
  status: "Active",
  raised: 20_000_000n,
  target: 100_000_000n,
  creator: CAMPAIGN_CREATOR,
};

interface SentCall {
  fn: string;
  args: unknown[];
}

interface MockAdminRpc {
  /** Contract calls that reached `sendTransaction`, in order. */
  sent: SentCall[];
}

function rpcResult(id: number, result: unknown) {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

/**
 * Routes the reads the admin page makes (`get_owner`, `get_total_campaigns`,
 * `get_campaigns_by_creator`, `get_updates`) and the full write path
 * (`getAccount` → simulate → `sendTransaction` → `getTransaction`).
 */
async function mockAdminRpc(
  page: Page,
  options: { wallet: string; contractOwner: string; campaigns: CampaignSeed[] },
): Promise<MockAdminRpc> {
  const { wallet, contractOwner, campaigns } = options;
  const state: MockAdminRpc = { sent: [] };

  await page.route("**/soroban/rpc*", async (route) => {
    let body: RpcRequestBody = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      // not JSON — fall through to the default handling below
    }
    const method = body.method || "";
    const id = body.id ?? 0;
    const respond = (json: string) =>
      route.fulfill({ status: 200, contentType: "application/json", body: json });

    if (method === "getAccount") {
      await respond(rpcResult(id, { id: wallet, sequence: "100" }));
      return;
    }

    if (method === "simulateTransaction") {
      const call = decodeInvocation(body.params?.transaction ?? "");
      const fn = call?.fn ?? "";
      const retval = (scVal: xdr.ScVal) => respond(JSON.stringify(ok(id, scVal.toXDR("base64"))));

      switch (fn) {
        case "get_owner":
          await retval(new Address(contractOwner).toScVal());
          return;
        case "get_total_campaigns":
          await retval(nativeToScVal(campaigns.length, { type: "u32" }));
          return;
        case "get_campaigns_by_creator": {
          const mine = campaigns.filter((c) => c.creator === String(call?.args?.[0]));
          await respond(JSON.stringify(ok(id, campaignsPagedScVal(mine))));
          return;
        }
        case "get_updates":
          await retval(xdr.ScVal.scvVec([]));
          return;
        case "decimals":
          await retval(nativeToScVal(7, { type: "u32" }));
          return;
        case "name":
        case "symbol":
          await retval(nativeToScVal("XLM", { type: "string" }));
          return;
        default:
          // Writes (pause, add_update, …) and anything unknown simulate cleanly.
          await retval(xdr.ScVal.scvVoid());
          return;
      }
    }

    if (method === "sendTransaction") {
      const call = decodeInvocation(body.params?.transaction ?? "");
      if (call) state.sent.push(call);
      await respond(rpcResult(id, { status: "PENDING", hash: MOCK_TX_HASH, latestLedger: 1000 }));
      return;
    }

    if (method === "getTransaction") {
      await respond(
        rpcResult(id, {
          status: "SUCCESS",
          latestLedger: 1001,
          resultMetaXdr: "AAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
          hash: MOCK_TX_HASH,
        }),
      );
      return;
    }

    if (method === "getEvents") {
      await respond(rpcResult(id, { events: [], latestLedger: 1000 }));
      return;
    }

    await route.continue();
  });

  return state;
}

/** Pins the mock wallet to `address`, or starts it signed out when `null`. */
async function useWalletAccount(page: Page, address: string | null) {
  await page.addInitScript((addr) => {
    if (addr === null) {
      window.__mockWalletDisconnected = true;
    } else {
      window.__mockWalletAddress = addr;
    }
  }, address);
}

const heading = (page: Page, name: string | RegExp) => page.getByRole("heading", { name });

test.describe("Admin panel access gating", () => {
  test("a visitor with no wallet is asked to connect and sees no admin controls", async ({
    page,
  }) => {
    await useWalletAccount(page, null);
    await mockAdminRpc(page, { wallet: OUTSIDER, contractOwner: OWNER, campaigns: [] });

    await page.goto("/admin");

    await expect(heading(page, "Wallet Not Connected")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/connect your Stellar wallet/i)).toBeVisible();

    await expect(heading(page, "Contract Controls")).toHaveCount(0);
    await expect(heading(page, "Campaign Management")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pause Contract" })).toHaveCount(0);
  });

  test("a connected non-owner with no campaigns is denied access", async ({ page }) => {
    await useWalletAccount(page, OUTSIDER);
    await mockAdminRpc(page, { wallet: OUTSIDER, contractOwner: OWNER, campaigns: [] });

    await page.goto("/admin");

    await expect(heading(page, "Access Denied")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/do not currently own any campaigns/i)).toBeVisible();

    await expect(heading(page, "Contract Controls")).toHaveCount(0);
    await expect(heading(page, "Transfer Ownership")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pause Contract" })).toHaveCount(0);
  });

  test("a campaign owner who is not the contract owner gets campaign tools but no contract controls", async ({
    page,
  }) => {
    await useWalletAccount(page, CAMPAIGN_CREATOR);
    await mockAdminRpc(page, {
      wallet: CAMPAIGN_CREATOR,
      contractOwner: OWNER,
      campaigns: [OWNED_CAMPAIGN],
    });

    await page.goto("/admin");

    await expect(heading(page, "Campaign Management")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(OWNED_CAMPAIGN.title).first()).toBeVisible();

    // Pause/unpause and ownership transfer are reserved for the contract owner.
    await expect(heading(page, "Platform Configuration")).toBeVisible();
    await expect(heading(page, "Contract Controls")).toHaveCount(0);
    await expect(heading(page, "Transfer Ownership")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pause Contract" })).toHaveCount(0);
  });

  test("the contract owner sees the contract controls even without campaigns", async ({ page }) => {
    await useWalletAccount(page, OWNER);
    await mockAdminRpc(page, { wallet: OWNER, contractOwner: OWNER, campaigns: [] });

    await page.goto("/admin");

    await expect(heading(page, "Contract Controls")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Pause Contract" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Unpause Contract" })).toBeEnabled();
    await expect(heading(page, "Transfer Ownership")).toBeVisible();

    // No campaigns, so the campaign tools stay hidden and access is not denied.
    await expect(heading(page, "Campaign Management")).toHaveCount(0);
    await expect(heading(page, "Access Denied")).toHaveCount(0);
  });
});

test.describe("Pause confirmation flow", () => {
  const pauseDialog = (page: Page) => page.getByRole("dialog", { name: "Pause Contract?" });

  test.beforeEach(async ({ page }) => {
    await useWalletAccount(page, OWNER);
  });

  test("requires typing PAUSE and can be cancelled without sending a transaction", async ({
    page,
  }) => {
    const rpc = await mockAdminRpc(page, { wallet: OWNER, contractOwner: OWNER, campaigns: [] });
    await page.goto("/admin");

    await page.getByRole("button", { name: "Pause Contract" }).click({ timeout: 15_000 });

    const dialog = pauseDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/disable all donations and campaign creation/i)).toBeVisible();

    const confirm = dialog.getByRole("button", { name: "Pause Contract", exact: true });
    const phrase = dialog.getByPlaceholder("PAUSE");

    // Disabled until the exact, case-sensitive phrase is typed.
    await expect(confirm).toBeDisabled();
    await phrase.fill("pause");
    await expect(confirm).toBeDisabled();
    await phrase.fill("PAUSE");
    await expect(confirm).toBeEnabled();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    // Re-opening starts from a cleared confirmation field.
    await page.getByRole("button", { name: "Pause Contract" }).click();
    await expect(pauseDialog(page).getByPlaceholder("PAUSE")).toHaveValue("");

    expect(rpc.sent).toEqual([]);
  });

  test("confirming pauses the contract and closes the dialog", async ({ page }) => {
    const rpc = await mockAdminRpc(page, { wallet: OWNER, contractOwner: OWNER, campaigns: [] });
    await page.goto("/admin");

    await page.getByRole("button", { name: "Pause Contract" }).click({ timeout: 15_000 });

    const dialog = pauseDialog(page);
    await dialog.getByPlaceholder("PAUSE").fill("PAUSE");
    await dialog.getByRole("button", { name: "Pause Contract", exact: true }).click();

    await expect(page.getByText("Contract paused", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog).toHaveCount(0);

    expect(rpc.sent.map((c) => c.fn)).toEqual(["pause"]);
  });

  test("unpausing needs a single confirmation and submits unpause", async ({ page }) => {
    const rpc = await mockAdminRpc(page, { wallet: OWNER, contractOwner: OWNER, campaigns: [] });
    await page.goto("/admin");

    await page.getByRole("button", { name: "Unpause Contract" }).click({ timeout: 15_000 });

    const dialog = page.getByRole("dialog", { name: "Unpause Contract?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Unpause Contract", exact: true }).click();

    await expect(page.getByText("Contract unpaused", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog).toHaveCount(0);

    expect(rpc.sent.map((c) => c.fn)).toEqual(["unpause"]);
  });
});

test.describe("Posting a campaign update", () => {
  test("a campaign owner can post an update to their campaign", async ({ page }) => {
    await useWalletAccount(page, CAMPAIGN_CREATOR);
    const rpc = await mockAdminRpc(page, {
      wallet: CAMPAIGN_CREATOR,
      contractOwner: OWNER,
      campaigns: [OWNED_CAMPAIGN],
    });
    await page.goto("/admin");

    await page.getByRole("button", { name: "Post Update" }).click({ timeout: 15_000 });

    const dialog = page.getByRole("dialog", {
      name: new RegExp(`Post Update for ${OWNED_CAMPAIGN.title}`),
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("update-count")).toHaveText(/0 of 10 updates used/);

    const content = dialog.getByLabel("Campaign update content");
    const submit = dialog.getByRole("button", { name: "Post Update", exact: true });

    // Nothing to post yet.
    await expect(submit).toBeDisabled();

    const message = "We have reached our first milestone, thank you all!";
    await content.fill(message);
    await expect(dialog.getByText(`${280 - message.length} characters remaining`)).toBeVisible();
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText("Transaction confirmed", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog).toHaveCount(0);

    // Exactly one add_update went out, for this campaign, carrying the typed text.
    expect(rpc.sent).toHaveLength(1);
    expect(rpc.sent[0].fn).toBe("add_update");
    expect(Number(rpc.sent[0].args[0])).toBe(OWNED_CAMPAIGN.id);
    expect(rpc.sent[0].args[1]).toBe(message);
  });
});
