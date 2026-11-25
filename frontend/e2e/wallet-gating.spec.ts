import { test, expect, type Page } from "@playwright/test";
import { Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { type RpcRequestBody, decodeInvocation } from "./support/xdr";
import { campaignScVal, ok, simError, type CampaignSeed } from "./support/rpc-mock";

/**
 * E2E: action gating while no wallet is connected.
 *
 * The mock wallet auto-connects for E2E, so this spec starts it signed out via
 * the `__mockWalletDisconnected` init-script override and asserts that:
 *   - the campaign page prompts for a connection instead of offering donate,
 *   - the donate CTA is blocked (disabled, with a connect-your-wallet hint),
 *   - connecting through the real UI unblocks the donate flow.
 */

// The account the mock wallet connects as once the user clicks "Connect Wallet".
const WALLET = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 6)).publicKey();

const ACTIVE_CAMPAIGN: CampaignSeed = {
  id: 1,
  title: "Open Relief Drive",
  status: "Active",
  raised: 20_000_000n,
  target: 100_000_000n,
  description: "An open campaign accepting donations",
};

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

      if (fn === "get_campaign") {
        const wanted = Number(call?.args?.[0] ?? 0);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            wanted === ACTIVE_CAMPAIGN.id
              ? ok(id, campaignScVal(ACTIVE_CAMPAIGN))
              : simError(id, "Campaign not found"),
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

// The Navbar renders `WalletConnect` twice (header + always-mounted mobile
// drawer), so scope to the header instance.
const connectButton = (page: Page) => page.getByRole("button", { name: /Connect Wallet/i }).first();
const donateButton = (page: Page) => page.getByRole("button", { name: /^Donate Now$/i });
// The mobile drawer is also a `role="dialog"`; match the donate modal by name.
const donateDialog = (page: Page) => page.getByRole("dialog", { name: /Donate to/i });

test.describe("Action gating with no wallet connected", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((addr) => {
      window.__mockWalletDisconnected = true;
      window.__mockWalletAddress = addr;
    }, WALLET);
    await mockSorobanRPC(page);
  });

  test("prompts to connect and blocks donate until a wallet is connected", async ({ page }) => {
    await page.goto(`/campaign/${ACTIVE_CAMPAIGN.id}`);

    await expect(page.getByRole("heading", { name: ACTIVE_CAMPAIGN.title })).toBeVisible({
      timeout: 15_000,
    });

    // The connect prompt is the only wallet affordance offered.
    await expect(connectButton(page)).toBeVisible();

    // Donate is blocked rather than submitting into a "Wallet not connected" error.
    await expect(donateButton(page)).toBeVisible();
    await expect(donateButton(page)).toBeDisabled();
    // The disabled reason is exposed via aria-describedby (the donate button
    // points at the "Connect your wallet to donate" tooltip) rather than a title.
    await expect(donateButton(page)).toHaveAttribute("aria-describedby", "donate-disabled-reason");

    // Nothing opened, so no amount field is reachable.
    await expect(donateDialog(page)).toHaveCount(0);

    // Connecting through the real UI unblocks the flow.
    await connectButton(page).click();
    // Target the visible Sonner toast (not the toaster’s polite live region).
    await expect(page.locator("[data-sonner-toast]").getByText(/Wallet connected!/i)).toBeVisible({
      timeout: 15_000,
    });

    await expect(donateButton(page)).toBeEnabled();
    await donateButton(page).click();

    await expect(donateDialog(page)).toBeVisible();
    await expect(donateDialog(page).getByLabel(/Amount/i)).toBeVisible();
  });
});
