import { describe, it, expect, vi } from "vitest";

// soroban.ts does `new rpc.Server(...)` at module scope; stub it so importing
// fromStroops (used by eventData) is safe under jsdom.
vi.mock("@stellar/stellar-sdk", async (importActual) => {
  const actual = await importActual<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn(function () {
        return {};
      }),
    },
  };
});

import {
  ANONYMOUS_DONOR,
  MISSING_FIELD,
  formatEventAmount,
  formatEventWindow,
  formatStroops,
  formatTxHash,
  getAmountStroops,
  getCampaignId,
  getEventField,
  getEventPayload,
  parseBigInt,
  parseClaimEvent,
  parseCreatedEvent,
  parseDonationEvent,
} from "@/lib/eventData";
import {
  NATIVE_TOKEN_ADDRESS,
  WALLET_ADDRESS,
  makeAutoClaimedEvent,
  makeClaimedEvent,
  makeCreatedEvent,
  makeDonationEvent,
  makeFundsClaimedEvent,
} from "@/test/factories";

describe("getEventPayload", () => {
  it("returns the struct payload for a well-formed event", () => {
    const event = makeDonationEvent("e1", "GABC", 500n);
    expect(getEventPayload(event)).toEqual(event.data);
  });

  it("maps a known tuple event onto named fields", () => {
    expect(getEventPayload(makeFundsClaimedEvent("c1", { campaign_id: 4n, amount: 9n }))).toEqual({
      campaign_id: 4n,
      beneficiary: WALLET_ADDRESS,
      amount: 9n,
      accepted_token: NATIVE_TOKEN_ADDRESS,
    });
  });

  it("returns null for tuples with no known layout, or missing data", () => {
    expect(getEventPayload({ topic: "received", data: ["1", "GABC"] })).toBeNull();
    expect(getEventPayload({ data: ["1", "GABC"] })).toBeNull();
    expect(getEventPayload({})).toBeNull();
    expect(getEventPayload(null)).toBeNull();
  });
});

describe("getEventField", () => {
  it("reads a named field from a struct event", () => {
    const event = makeDonationEvent("e1", "GABC", 500n);
    expect(getEventField(event, "amount")).toBe(500n);
    expect(getEventField(event, "donor")).toBe("GABC");
  });

  it("returns undefined for missing fields or non-struct data", () => {
    expect(getEventField(makeDonationEvent("e1", "GABC", 500n), "missing")).toBeUndefined();
    expect(getEventField({ data: ["1"] }, "amount")).toBeUndefined();
    expect(getEventField({}, "amount")).toBeUndefined();
    expect(getEventField(null, "amount")).toBeUndefined();
  });
});

describe("parseBigInt", () => {
  it("parses bigints, numbers, and numeric strings", () => {
    expect(parseBigInt(42n)).toBe(42n);
    expect(parseBigInt(42)).toBe(42n);
    expect(parseBigInt("42")).toBe(42n);
  });

  it("returns null for missing or garbage values", () => {
    expect(parseBigInt(undefined)).toBeNull();
    expect(parseBigInt(null)).toBeNull();
    expect(parseBigInt("")).toBeNull();
    expect(parseBigInt("not-a-number")).toBeNull();
    expect(parseBigInt(1.5)).toBeNull();
    expect(parseBigInt({})).toBeNull();
    expect(parseBigInt([1, 2])).toBeNull();
  });
});

describe("getCampaignId", () => {
  it("reads campaign_id from donation events", () => {
    expect(getCampaignId(makeDonationEvent("e1", "GABC", 1n, 7n))).toBe("7");
  });

  it("reads id from created events", () => {
    expect(getCampaignId(makeCreatedEvent("e2", { id: 9n }))).toBe("9");
  });

  it("returns null for undersized or garbage payloads", () => {
    expect(getCampaignId({ data: {} })).toBeNull();
    expect(getCampaignId({ data: { campaign_id: "oops" } })).toBeNull();
    expect(getCampaignId({})).toBeNull();
    expect(getCampaignId(null)).toBeNull();
  });
});

describe("getAmountStroops", () => {
  it("returns the parsed amount from the named field", () => {
    expect(getAmountStroops(makeDonationEvent("e1", "GABC", 15_000_000n))).toBe(15_000_000n);
    expect(getAmountStroops(makeCreatedEvent("e2", { target_amount: 100n }), "target_amount")).toBe(
      100n,
    );
  });

  it("falls back to 0n so aggregations never throw", () => {
    expect(getAmountStroops({ data: {} })).toBe(0n);
    expect(getAmountStroops({ data: { amount: "junk" } })).toBe(0n);
    expect(getAmountStroops(undefined)).toBe(0n);
  });
});

describe("formatEventAmount", () => {
  it("formats a valid stroop amount", () => {
    expect(formatEventAmount(makeDonationEvent("e1", "GABC", 15_000_000n))).toBe("1.5 XLM");
  });

  it("returns the placeholder when the field is missing or malformed", () => {
    expect(formatEventAmount({ data: {} })).toBe(MISSING_FIELD);
    expect(formatEventAmount({ data: { amount: "junk" } })).toBe(MISSING_FIELD);
    expect(formatEventAmount({})).toBe(MISSING_FIELD);
    expect(formatEventAmount(null)).toBe(MISSING_FIELD);
  });

  it("formats claimed and created amounts via field name", () => {
    expect(formatEventAmount(makeClaimedEvent("c1", { amount: 15_000_000n }))).toBe("1.5 XLM");
    expect(
      formatEventAmount(makeCreatedEvent("c2", { target_amount: 15_000_000n }), "target_amount"),
    ).toBe("1.5 XLM");
  });
});

describe("formatTxHash", () => {
  it("shortens a full hash", () => {
    const hash = "a".repeat(60) + "bcde";
    expect(formatTxHash(hash)).toBe("aaaaaaaa...bcde");
  });

  it("returns null for missing or too-short hashes", () => {
    expect(formatTxHash(undefined)).toBeNull();
    expect(formatTxHash(null)).toBeNull();
    expect(formatTxHash(123)).toBeNull();
    expect(formatTxHash("abc")).toBeNull();
  });
});

const DONOR = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";

describe("parseDonationEvent", () => {
  it("reads every DonationEvent field by name", () => {
    const event = makeDonationEvent("d1", DONOR, 25_000_000n, 3n, 100, {
      total_raised: 75_000_000n,
      comment: "For the shelter",
    });
    expect(parseDonationEvent(event)).toEqual({
      campaignId: "3",
      donor: DONOR,
      amount: 25_000_000n,
      totalRaised: 75_000_000n,
      acceptedToken: NATIVE_TOKEN_ADDRESS,
      comment: "For the shelter",
    });
  });

  it("treats the zero placeholder as an anonymous donor", () => {
    expect(parseDonationEvent(makeDonationEvent("d2", ANONYMOUS_DONOR, 1n))?.donor).toBeNull();
  });

  it("returns null for other topics and never throws on junk", () => {
    expect(parseDonationEvent(makeCreatedEvent("c1"))).toBeNull();
    expect(parseDonationEvent({ topic: "received", data: "junk" })).toEqual({
      campaignId: null,
      donor: null,
      amount: null,
      totalRaised: null,
      acceptedToken: null,
      comment: null,
    });
    expect(parseDonationEvent(null)).toBeNull();
  });
});

describe("parseCreatedEvent", () => {
  it("reads CreatedEvent { id, creator, target_amount }", () => {
    expect(parseCreatedEvent(makeCreatedEvent("c1", { id: 8n, target_amount: 5n }))).toEqual({
      campaignId: "8",
      creator: WALLET_ADDRESS,
      targetAmount: 5n,
    });
  });

  it("returns null for other topics", () => {
    expect(parseCreatedEvent(makeDonationEvent("d1", DONOR, 1n))).toBeNull();
  });
});

describe("parseClaimEvent", () => {
  const expected = { campaignId: "2", beneficiary: WALLET_ADDRESS, amount: 40n };

  it("reads the (funds, claimed) tuple", () => {
    expect(parseClaimEvent(makeFundsClaimedEvent("c1", { campaign_id: 2n, amount: 40n }))).toEqual({
      ...expected,
      acceptedToken: NATIVE_TOKEN_ADDRESS,
    });
  });

  it("reads the ClaimedEvent struct", () => {
    expect(parseClaimEvent(makeClaimedEvent("c2", { campaign_id: 2n, amount: 40n }))).toEqual({
      ...expected,
      acceptedToken: null,
    });
  });

  it("uses total_raised as the amount for AutoClaimedEvent", () => {
    expect(
      parseClaimEvent(makeAutoClaimedEvent("c3", { campaign_id: 2n, total_raised: 40n })),
    ).toEqual({ ...expected, acceptedToken: null });
  });

  it("returns null for other topics", () => {
    expect(parseClaimEvent(makeDonationEvent("d1", DONOR, 1n))).toBeNull();
  });
});

describe("formatStroops", () => {
  it("formats amounts and falls back to the placeholder", () => {
    expect(formatStroops(15_000_000n)).toBe("1.5 XLM");
    expect(formatStroops(null)).toBe(MISSING_FIELD);
  });
});

describe("formatEventWindow", () => {
  it("formats a start–end range", () => {
    expect(formatEventWindow("2026-10-12T12:00:00Z", "2026-10-19T12:00:00Z")).toBe(
      "Oct 12, 2026 – Oct 19, 2026",
    );
  });

  it("collapses a single-day window and handles missing bounds", () => {
    expect(formatEventWindow("2026-10-19T01:00:00Z", "2026-10-19T12:00:00Z")).toBe("Oct 19, 2026");
    expect(formatEventWindow("2026-10-12T12:00:00Z", null)).toBe("since Oct 12, 2026");
    expect(formatEventWindow(null, null)).toBe("the RPC's event retention window");
  });
});
