import { describe, it, expect, vi } from "vitest";
import type { SorobanEvent } from "@/lib/soroban";

vi.mock("@/lib/soroban", () => ({
  fromStroops: (stroops: bigint | string | number): string => BigInt(stroops).toString(),
}));

vi.mock("@/lib/tokens", () => ({
  NATIVE_XLM_CONTRACT_ID: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
}));

import { aggregateDonorsByToken, pickLeaderboardToken } from "./aggregateDonors";

const XLM = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const USDC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const DONOR_A = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWAA";
const DONOR_B = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWBB";

function donation(donor: string, amount: bigint, token: string, campaignId = 1n): SorobanEvent {
  return {
    id: `${donor}-${amount}-${token}`,
    topic: "received",
    data: { campaign_id: campaignId, donor, amount, total_raised: 0n, accepted_token: token },
    createdAt: new Date().toISOString(),
  } as unknown as SorobanEvent;
}

describe("aggregateDonorsByToken", () => {
  it("keeps XLM and USDC donations in separate rankings", () => {
    const byToken = aggregateDonorsByToken(
      [
        donation(DONOR_A, 100_000_000n, XLM),
        donation(DONOR_B, 30_000_000n, XLM),
        donation(DONOR_B, 500_000_000n, USDC),
        donation(DONOR_A, 20_000_000n, XLM, 2n),
      ],
      "all",
    );

    expect(byToken.get(XLM)).toEqual([
      { donor: DONOR_A, total: 120_000_000n, donations: 2, campaigns: 2 },
      { donor: DONOR_B, total: 30_000_000n, donations: 1, campaigns: 1 },
    ]);
    expect(byToken.get(USDC)).toEqual([
      { donor: DONOR_B, total: 500_000_000n, donations: 1, campaigns: 1 },
    ]);
  });

  it("buckets donations with no readable token apart from every real token", () => {
    const byToken = aggregateDonorsByToken([donation(DONOR_A, 5n, "")], "all");
    expect(Array.from(byToken.keys())).toEqual([""]);
  });
});

describe("pickLeaderboardToken", () => {
  const byToken = aggregateDonorsByToken(
    [donation(DONOR_A, 1n, XLM), donation(DONOR_A, 1n, USDC), donation(DONOR_B, 1n, USDC)],
    "all",
  );

  it("honours a requested token that has donations", () => {
    expect(pickLeaderboardToken(byToken, XLM, XLM)).toBe(XLM);
  });

  it("falls back to the token with the most donors", () => {
    expect(pickLeaderboardToken(byToken, "CUNKNOWN", XLM)).toBe(USDC);
  });

  it("prefers native XLM on a tie", () => {
    const tied = aggregateDonorsByToken(
      [donation(DONOR_A, 1n, USDC), donation(DONOR_B, 1n, XLM)],
      "all",
    );
    expect(pickLeaderboardToken(tied, null, XLM)).toBe(XLM);
  });

  it("returns null when there are no donations", () => {
    expect(pickLeaderboardToken(new Map(), null, XLM)).toBeNull();
  });
});
