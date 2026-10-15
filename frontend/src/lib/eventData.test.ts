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
  MISSING_FIELD,
  formatEventAmount,
  formatTxHash,
  getAmountStroops,
  getCampaignId,
  getEventField,
  getEventPayload,
  parseBigInt,
} from "@/lib/eventData";
import {
  makeClaimedEvent,
  makeCreatedEvent,
  makeDonationEvent,
} from "@/test/factories";

describe("getEventPayload", () => {
  it("returns the struct payload for a well-formed event", () => {
    const event = makeDonationEvent("e1", "GABC", 500n);
    expect(getEventPayload(event)).toEqual(event.data);
  });

  it("returns null for array or missing data", () => {
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
    expect(formatEventAmount(makeCreatedEvent("c2", { target_amount: 15_000_000n }), "target_amount")).toBe(
      "1.5 XLM",
    );
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
