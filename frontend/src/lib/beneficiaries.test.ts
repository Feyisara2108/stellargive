import { describe, it, expect } from "vitest";
import { percentToBps, validateBeneficiaries, TOTAL_SHARE_BPS } from "./beneficiaries";
import { CONTRACT_ID } from "./soroban";
import { INVALID_SHARES_MESSAGE } from "./contractErrors";

const A = "GCJIQPIC4TD33PSVHU42IOJS4FVPBBAQHWWOWHUDDMQDVZ2HVTD3OXKS";
const B = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

describe("percentToBps", () => {
  it.each([
    ["100", 10_000],
    ["50", 5_000],
    ["33.33", 3_333],
    ["0.01", 1],
    [" 12.5 ", 1_250],
  ])("converts %s%% to %i bps", (input, expected) => {
    expect(percentToBps(input)).toBe(expected);
  });

  it.each(["", "abc", "-5", "33.333", "1e2"])("rejects %j", (input) => {
    expect(percentToBps(input)).toBeNull();
  });
});

describe("validateBeneficiaries", () => {
  it("accepts a single beneficiary with the full share", () => {
    expect(validateBeneficiaries([{ address: A, share: TOTAL_SHARE_BPS }])).toBeNull();
  });

  it("accepts a split that totals 10000 bps", () => {
    expect(
      validateBeneficiaries([
        { address: A, share: 7_000 },
        { address: B, share: 3_000 },
      ]),
    ).toBeNull();
  });

  it("rejects totals other than 100%", () => {
    expect(
      validateBeneficiaries([
        { address: A, share: 6_000 },
        { address: B, share: 3_000 },
      ]),
    ).toBe(INVALID_SHARES_MESSAGE);
  });

  it("rejects an empty list, invalid or duplicate addresses, the contract and zero shares", () => {
    expect(validateBeneficiaries([])).toMatch(/at least one/i);
    expect(validateBeneficiaries([{ address: "GBAD", share: 10_000 }])).toMatch(/Invalid/);
    expect(
      validateBeneficiaries([
        { address: A, share: 5_000 },
        { address: A, share: 5_000 },
      ]),
    ).toMatch(/only be listed once/);
    expect(
      validateBeneficiaries([
        { address: A, share: 10_000 },
        { address: B, share: 0 },
      ]),
    ).toMatch(/greater than 0%/);
    expect(validateBeneficiaries([{ address: CONTRACT_ID, share: 10_000 }])).toBeTruthy();
  });
});
