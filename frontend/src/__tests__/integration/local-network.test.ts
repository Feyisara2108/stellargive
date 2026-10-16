/**
 * Live integration suite against a local Stellar Quickstart node.
 *
 * Skipped unless RUN_LOCAL_STELLAR=1. Requires:
 *   - docker compose up -d stellar  (RPC at NEXT_PUBLIC_SOROBAN_RPC_URL)
 *   - NEXT_PUBLIC_CONTRACT_ID set to a freshly deployed contract
 *   - Friendbot reachable at FRIENDBOT_URL (default http://localhost:8000/friendbot)
 *
 * See docs/TESTING.md and scripts/deploy-local.sh.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  cancelCampaign,
  claimRefund,
  createCampaign,
  donate,
  fundAccount,
  getCampaign,
  getEvents,
  initializeContract,
  Keypair,
  MIN_DONATION_STROOPS,
  waitForRpc,
} from "./helpers";
import { CONTRACT_ID, RPC_URL } from "@/lib/soroban";
import { getCampaignId, getEventField, getEventPayload } from "@/lib/eventData";

const RUN = process.env.RUN_LOCAL_STELLAR === "1";

describe.skipIf(!RUN)("local Stellar network integration", () => {
  let admin: Keypair;
  let donor: Keypair;
  let campaignId: bigint;

  beforeAll(async () => {
    // Keypairs must be created inside beforeAll — `describe.skipIf` still
    // evaluates the suite body during collection, and jsdom's crypto breaks
    // Keypair.random() when the suite is skipped in the default unit run.
    admin = Keypair.random();
    donor = Keypair.random();

    expect(CONTRACT_ID, "NEXT_PUBLIC_CONTRACT_ID must be set").toBeTruthy();
    expect(RPC_URL).toMatch(/localhost|127\.0\.0\.1/);

    await waitForRpc();
    await fundAccount(admin.publicKey());
    await fundAccount(donor.publicKey());

    try {
      await initializeContract(admin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Redeploys are rare; an already-initialized contract is fine for the suite.
      if (!/AlreadyInitialized|already.?init/i.test(msg)) {
        throw err;
      }
    }
  }, 180_000);

  it("creates a campaign through lib/soroban submit path", async () => {
    campaignId = await createCampaign(admin, {
      title: "Local Integration Campaign",
      targetAmount: 50_000_000_000n,
    });
    expect(campaignId).toBeGreaterThan(0n);

    const campaign = await getCampaign(campaignId);
    expect(campaign.title).toBe("Local Integration Campaign");
    expect(campaign.status).toBe("Active");
    expect(campaign.creator).toBe(admin.publicKey());
  }, 120_000);

  it("rejects donations below the on-chain minimum", async () => {
    await expect(donate(donor, campaignId, MIN_DONATION_STROOPS - 1n)).rejects.toThrow();
  }, 120_000);

  it("donates at or above the minimum and raises the campaign", async () => {
    const before = await getCampaign(campaignId);
    await donate(donor, campaignId, MIN_DONATION_STROOPS, "integration hello");
    const after = await getCampaign(campaignId);
    expect(after.raised_amount).toBe(before.raised_amount + MIN_DONATION_STROOPS);
  }, 120_000);

  it("reads struct-shaped donation events via getEvents", async () => {
    // Give the RPC a moment to index the donation event.
    await new Promise((r) => setTimeout(r, 3000));

    const events = await getEvents(50);
    const donation = events.find(
      (e) =>
        e.topic === "received" &&
        getCampaignId(e) === campaignId.toString() &&
        getEventField(e, "donor") === donor.publicKey(),
    );

    expect(donation, "expected a DonationEvent for the test donation").toBeTruthy();
    const payload = getEventPayload(donation!);
    expect(payload).not.toBeNull();
    expect(Array.isArray(payload)).toBe(false);
    expect(payload).toMatchObject({
      campaign_id: campaignId,
      donor: donor.publicKey(),
      amount: MIN_DONATION_STROOPS,
    });
    expect(payload!.accepted_token).toBeTruthy();
  }, 120_000);

  it("cancels and refunds through claim_refund", async () => {
    const refundCampaignId = await createCampaign(admin, {
      title: "Refund Integration Campaign",
    });
    await donate(donor, refundCampaignId, MIN_DONATION_STROOPS);
    await cancelCampaign(admin, refundCampaignId);

    const refunded = await claimRefund(donor, refundCampaignId);
    expect(refunded).toBe(MIN_DONATION_STROOPS);

    const cancelled = await getCampaign(refundCampaignId);
    expect(cancelled.status).toBe("Cancelled");
  }, 180_000);
});
