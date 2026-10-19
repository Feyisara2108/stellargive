import { describe, it, expect, vi } from "vitest";

const XLM = vi.hoisted(() => "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC");
const USDC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

vi.mock("@/lib/tokens", () => ({ NATIVE_XLM_CONTRACT_ID: XLM }));

import {
  describeToken,
  formatTokenTotals,
  parseTokenTotals,
  tokensNeedingMetadata,
  UNKNOWN_TOKEN,
} from "./tokenTotals";

describe("describeToken", () => {
  it("knows native XLM without metadata", () => {
    expect(describeToken(XLM)).toEqual({ symbol: "XLM", decimals: 7 });
  });

  it("uses on-chain metadata for other tokens", () => {
    expect(describeToken(USDC, { symbol: "USDC", decimals: 6 })).toEqual({
      symbol: "USDC",
      decimals: 6,
    });
  });

  it("never labels an unloaded token as XLM", () => {
    expect(describeToken(USDC).symbol).toBe("CBIE…DAMA");
    expect(describeToken(UNKNOWN_TOKEN).symbol).toBe("unknown token");
  });
});

describe("formatTokenTotals", () => {
  it("formats XLM and USDC separately with each token's decimals", () => {
    const totals = new Map([
      [XLM, 125_000_000n], // 12.5 XLM at 7 decimals
      [USDC, 2_500_000n], // 2.5 USDC at 6 decimals
    ]);

    expect(formatTokenTotals(totals, { [USDC]: { symbol: "USDC", decimals: 6 } })).toEqual([
      "12.5 XLM",
      "2.5 USDC",
    ]);
  });

  it("drops tokens with nothing raised", () => {
    expect(
      formatTokenTotals(
        new Map([
          [XLM, 10_000_000n],
          [USDC, 0n],
        ]),
      ),
    ).toEqual(["1 XLM"]);
  });
});

describe("parseTokenTotals", () => {
  it("reads string totals back into bigints and skips corrupt entries", () => {
    const parsed = parseTokenTotals({ [XLM]: "10000000000000000001", [USDC]: "not-a-number" });
    expect(parsed.get(XLM)).toBe(10_000_000_000_000_000_001n);
    expect(parsed.has(USDC)).toBe(false);
  });

  it("treats a missing payload (e.g. a cache entry from before per-token totals) as empty", () => {
    expect(parseTokenTotals(undefined).size).toBe(0);
  });
});

describe("tokensNeedingMetadata", () => {
  it("skips native XLM and the unknown-token bucket", () => {
    expect(tokensNeedingMetadata([XLM, USDC, UNKNOWN_TOKEN])).toEqual([USDC]);
  });
});
