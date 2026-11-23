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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Address, nativeToScVal } from "@stellar/stellar-sdk";
import {
  cancelCampaign,
  claimFunds,
  claimRefund,
  createCampaign,
  donate,
  fundAccount,
  getCampaign,
  getEvents,
  initializeContract,
  Keypair,
  MIN_DONATION_STROOPS,
  pauseContract,
  refundExpired,
  unpauseContract,
  waitForRpc,
} from "./helpers";
import { CONTRACT_ID, RPC_URL, server, submitTransactionWithKeypair } from "@/lib/soroban";
import { getCampaignId, getEventField, getEventPayload } from "@/lib/eventData";
import {
  CONTRACT_ERROR_CODES,
  getContractErrorCode,
  mapTransactionError,
} from "@/lib/contractErrors";

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

  it("pays a funded campaign out through claim_funds", async () => {
    const target = 10_000_000n;
    const fundedId = await createCampaign(admin, {
      title: "Claim Integration Campaign",
      targetAmount: target,
    });
    await donate(donor, fundedId, target);
    expect((await getCampaign(fundedId)).status).toBe("Funded");

    const claimed = await claimFunds(admin, fundedId);
    expect(claimed).toBe(target);

    const after = await getCampaign(fundedId);
    expect(after.status).toBe("Claimed");
    expect(after.raised_amount).toBe(0n);

    // Give the RPC a moment to index the claim event.
    await new Promise((r) => setTimeout(r, 3000));
    const events = await getEvents(50);
    const claimEvent = events.find(
      (e) => e.topic === "claimed" && getCampaignId(e) === fundedId.toString(),
    );
    expect(claimEvent, "expected a claimed event for the funded campaign").toBeTruthy();
    expect(getEventPayload(claimEvent!)).not.toBeNull();
  }, 180_000);

  it("rejects claim_funds when campaign is Active and below target before deadline", async () => {
    const activeId = await createCampaign(admin, {
      title: "Unmet Target Campaign",
      targetAmount: 50_000_000_000n,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60),
    });
    await donate(donor, activeId, MIN_DONATION_STROOPS);

    let error: unknown;
    try {
      await submitTransactionWithKeypair(admin, "claim_funds", [
        new Address(admin.publicKey()).toScVal(),
        nativeToScVal(activeId, { type: "u64" }),
      ]);
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    expect(getContractErrorCode(error)).toBe(CONTRACT_ERROR_CODES.ClaimNotAllowed);
    expect(mapTransactionError(error)).toBe("Campaign funds cannot be claimed yet.");
  }, 180_000);

  it("rejects claim_funds signed by an unauthorized keypair", async () => {
    const unauthorized = Keypair.random();
    await fundAccount(unauthorized.publicKey());

    const target = 10_000_000n;
    const fundedId = await createCampaign(admin, {
      title: "Unauthorized Claim Campaign",
      targetAmount: target,
    });
    await donate(donor, fundedId, target);

    let error: unknown;
    try {
      await submitTransactionWithKeypair(unauthorized, "claim_funds", [
        new Address(unauthorized.publicKey()).toScVal(),
        nativeToScVal(fundedId, { type: "u64" }),
      ]);
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    expect(getContractErrorCode(error)).toBe(CONTRACT_ERROR_CODES.Unauthorized);
    expect(mapTransactionError(error)).toBe("You are not authorized to perform this action.");
  }, 180_000);

  it("rejects a second claim_funds on an already claimed campaign", async () => {
    const target = 10_000_000n;
    const fundedId = await createCampaign(admin, {
      title: "Already Claimed Campaign",
      targetAmount: target,
    });
    await donate(donor, fundedId, target);
    await submitTransactionWithKeypair(admin, "claim_funds", [
      new Address(admin.publicKey()).toScVal(),
      nativeToScVal(fundedId, { type: "u64" }),
    ]);

    let error: unknown;
    try {
      await submitTransactionWithKeypair(admin, "claim_funds", [
        new Address(admin.publicKey()).toScVal(),
        nativeToScVal(fundedId, { type: "u64" }),
      ]);
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    expect(getContractErrorCode(error)).toBe(CONTRACT_ERROR_CODES.AlreadyClaimed);
    expect(mapTransactionError(error)).toBe("The campaign funds have already been claimed.");
  }, 180_000);

  it("rejects cancel_campaign by non-creator and on an already cancelled campaign", async () => {
    const cancelId = await createCampaign(admin, {
      title: "Cancel Rejection Campaign",
    });

    // Non-creator attempt
    let unauthorizedError: unknown;
    try {
      await submitTransactionWithKeypair(donor, "cancel_campaign", [
        nativeToScVal(cancelId, { type: "u64" }),
      ]);
    } catch (err) {
      unauthorizedError = err;
    }
    expect(unauthorizedError).toBeDefined();
    expect(mapTransactionError(unauthorizedError)).toBe(
      "You are not authorized to perform this action.",
    );

    // Cancel properly by creator
    await submitTransactionWithKeypair(admin, "cancel_campaign", [
      nativeToScVal(cancelId, { type: "u64" }),
    ]);

    // Second cancel attempt on already cancelled campaign
    let inactiveError: unknown;
    try {
      await submitTransactionWithKeypair(admin, "cancel_campaign", [
        nativeToScVal(cancelId, { type: "u64" }),
      ]);
    } catch (err) {
      inactiveError = err;
    }
    expect(inactiveError).toBeDefined();
    expect(getContractErrorCode(inactiveError)).toBe(CONTRACT_ERROR_CODES.CampaignNotActive);
    expect(mapTransactionError(inactiveError)).toBe(
      "This campaign is no longer accepting donations.",
    );
  }, 180_000);

  it("refunds an expired campaign after deadline has passed", async () => {
    const latestLedger = await server.getLatestLedger();
    const currentLedgerTime = Number(latestLedger.closeTime) || Math.floor(Date.now() / 1000);
    const deadline = BigInt(currentLedgerTime + 20);
    const target = 100_000_000n;

    const expiredCampaignId = await createCampaign(admin, {
      title: "Expired Refund Campaign",
      targetAmount: target,
      deadline,
    });

    await donate(donor, expiredCampaignId, MIN_DONATION_STROOPS);

    // Assert refund rejects while campaign is still active (RefundNotAllowed, code 34)
    let activeRefundErr: unknown;
    try {
      await refundExpired(donor, expiredCampaignId);
    } catch (err) {
      activeRefundErr = err;
    }
    expect(activeRefundErr).toBeDefined();
    expect(getContractErrorCode(activeRefundErr)).toBe(CONTRACT_ERROR_CODES.RefundNotAllowed);
    expect(mapTransactionError(activeRefundErr)).toBe(
      "A refund is not available for this campaign yet.",
    );

    // Poll getLatestLedger close time until ledger time is past the deadline
    const pollStart = Date.now();
    while (Date.now() - pollStart < 120_000) {
      const latest = await server.getLatestLedger();
      const closeTime = BigInt(latest.closeTime);
      if (closeTime > deadline) {
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    const beforeRefund = await getCampaign(expiredCampaignId);
    expect(beforeRefund.raised_amount).toBe(MIN_DONATION_STROOPS);

    // Call refund
    await refundExpired(donor, expiredCampaignId);

    // Assert campaign's raised_amount drops by donated amount
    const afterRefund = await getCampaign(expiredCampaignId);
    expect(afterRefund.raised_amount).toBe(beforeRefund.raised_amount - MIN_DONATION_STROOPS);

    // Assert second refund by same donor rejects
    let secondRefundErr: unknown;
    try {
      await refundExpired(donor, expiredCampaignId);
    } catch (err) {
      secondRefundErr = err;
    }
    expect(secondRefundErr).toBeDefined();
    expect([CONTRACT_ERROR_CODES.NothingToClaim, CONTRACT_ERROR_CODES.NothingToRefund]).toContain(
      getContractErrorCode(secondRefundErr),
    );
  }, 240_000);
});

describe.skipIf(!RUN)("contract pause and unpause", () => {
  let admin: Keypair;
  let donor: Keypair;
  let campaignId: bigint;

  beforeAll(async () => {
    admin = Keypair.random();
    donor = Keypair.random();

    await waitForRpc();
    await fundAccount(admin.publicKey());
    await fundAccount(donor.publicKey());

    try {
      await initializeContract(admin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/AlreadyInitialized|already.?init/i.test(msg)) {
        throw err;
      }
    }

    campaignId = await createCampaign(admin, {
      title: "Pause Integration Campaign",
      targetAmount: 50_000_000_000n,
    });
  }, 180_000);

  afterAll(async () => {
    try {
      await unpauseContract(admin);
    } catch {
      // Contract may already be unpaused
    }
  }, 60_000);

  it("rejects pause when signed by non-admin", async () => {
    await expect(pauseContract(donor)).rejects.toThrow();
  }, 120_000);

  it("pauses contract, asserts createCampaign and donate reject with mapped error, then unpauses and verifies donation", async () => {
    await pauseContract(admin);

    try {
      let donateError: unknown;
      try {
        await donate(donor, campaignId, MIN_DONATION_STROOPS);
      } catch (err) {
        donateError = err;
      }
      expect(donateError).toBeDefined();
      expect(getContractErrorCode(donateError)).toBe(CONTRACT_ERROR_CODES.ContractPaused);
      expect(mapTransactionError(donateError)).toBe(
        "The contract is temporarily paused. Please try again later.",
      );

      let createError: unknown;
      try {
        await createCampaign(admin, { title: "Paused Campaign Attempt" });
      } catch (err) {
        createError = err;
      }
      expect(createError).toBeDefined();
      expect(getContractErrorCode(createError)).toBe(CONTRACT_ERROR_CODES.ContractPaused);
      expect(mapTransactionError(createError)).toBe(
        "The contract is temporarily paused. Please try again later.",
      );
    } finally {
      await unpauseContract(admin);
    }

    // After unpause, assert a donation succeeds again
    const before = await getCampaign(campaignId);
    await donate(donor, campaignId, MIN_DONATION_STROOPS);
    const after = await getCampaign(campaignId);
    expect(after.raised_amount).toBe(before.raised_amount + MIN_DONATION_STROOPS);
  }, 180_000);
});
