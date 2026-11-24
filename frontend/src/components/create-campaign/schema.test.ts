import { describe, it, expect } from "vitest";
import { ZERO_ADDRESS } from "@/utils/format";
import { buildPreviewCampaign, DEFAULT_VALUES } from "./schema";

describe("buildPreviewCampaign", () => {
  it("converts a fractional target to stroops without floating point error", () => {
    const preview = buildPreviewCampaign(
      { ...DEFAULT_VALUES, targetAmount: "0.1234567" },
      [],
      "",
    );
    expect(preview.target_amount).toBe(1_234_567n);
  });

  it("converts a large target above Number.MAX_SAFE_INTEGER / 1e7 without rounding error", () => {
    const preview = buildPreviewCampaign(
      { ...DEFAULT_VALUES, targetAmount: "900719925.4740993" },
      [],
      "",
    );
    expect(preview.target_amount).toBe(9_007_199_254_740_993n);
  });

  it("falls back to 0n for exponential-notation input", () => {
    const preview = buildPreviewCampaign({ ...DEFAULT_VALUES, targetAmount: "1e3" }, [], "");
    expect(preview.target_amount).toBe(0n);
  });

  it("falls back to 0n for an empty target", () => {
    const preview = buildPreviewCampaign({ ...DEFAULT_VALUES, targetAmount: "" }, [], "");
    expect(preview.target_amount).toBe(0n);
  });

  it("respects the selected token's decimals when provided", () => {
    const preview = buildPreviewCampaign(
      { ...DEFAULT_VALUES, targetAmount: "1.23" },
      [],
      "",
      2,
    );
    expect(preview.target_amount).toBe(123n);
  });

  it("falls back to the zero address placeholder when no wallet or beneficiary is set", () => {
    const preview = buildPreviewCampaign({ ...DEFAULT_VALUES, beneficiary: "" }, [], "");
    expect(preview.creator).toBe(ZERO_ADDRESS);
    expect(preview.beneficiary).toBe(ZERO_ADDRESS);
  });
});
