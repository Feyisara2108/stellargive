import { describe, it, expect } from "vitest";
import {
  formatStroop,
  formatAddress,
  formatXLM,
  formatTokenAmount,
  formatBasisPoints,
  toRawAmount,
  normalizeAddress,
  ZERO_ADDRESS,
} from "./format";

describe("format utils", () => {
  describe("formatStroop", () => {
    it("delegates to formatTokenAmount and trims trailing zeros", () => {
      expect(formatStroop(0n)).toBe("0");
      expect(formatStroop(1n)).toBe("0.0000001"); // dust
      expect(formatStroop(10_000_000n)).toBe("1"); // 1 XLM
      expect(formatStroop(15_000_000n)).toBe("1.5");
      expect(formatStroop(100_000_000_000_000n)).toBe("10000000"); // large amount
    });

    it("produces the same output as formatTokenAmount(n, 7)", () => {
      const cases = [0n, 1n, 10_000_000n, 15_500_000n, 100_000_000_000_000n];
      for (const n of cases) {
        expect(formatStroop(n)).toBe(formatTokenAmount(n, 7));
      }
    });
  });

  describe("formatAddress", () => {
    it("should format addresses", () => {
      expect(formatAddress("GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890")).toBe("GABC...7890");
      expect(formatAddress("short")).toBe("short");
      expect(formatAddress("")).toBe("");
    });

    it("truncates right at the 10-character boundary, leaves shorter strings untouched", () => {
      // 9 chars: below the threshold, returned as-is.
      expect(formatAddress("123456789")).toBe("123456789");
      // 10 chars: at the threshold, gets truncated.
      expect(formatAddress("1234567890")).toBe("1234...7890");
    });
  });

  describe("formatXLM", () => {
    it("should trim zeros and format XLM", () => {
      expect(formatXLM(1.5)).toBe("1.5");
      expect(formatXLM(1.0)).toBe("1");
      expect(formatXLM(0.0000001)).toBe("0.0000001");
      expect(formatXLM(0)).toBe("0");
    });
  });

  describe("formatTokenAmount", () => {
    it("should format decimals dynamically", () => {
      expect(formatTokenAmount(1000000n, 6)).toBe("1");
      expect(formatTokenAmount(1500000n, 6)).toBe("1.5");
      expect(formatTokenAmount(1n, 7)).toBe("0.0000001");
      expect(formatTokenAmount(0n, 7)).toBe("0");
    });

    it("should handle non-XLM decimals (Issue #276 requirement)", () => {
      expect(formatTokenAmount(1234n, 2)).toBe("12.34");
      expect(formatTokenAmount(123456n, 0)).toBe("123456");
      // Test very large 18 decimal token (like ETH representation on stellar if bridged)
      expect(formatTokenAmount(1500000000000000000n, 18)).toBe("1.5");
    });

    it("should handle negative inputs gracefully", () => {
      expect(formatTokenAmount(-1500000n, 6)).toBe("-1.5");
      expect(formatTokenAmount(-500000n, 6)).toBe("-0.5");
      expect(formatTokenAmount(-0n, 7)).toBe("0");
    });

    it("should accept string and number inputs", () => {
      expect(formatTokenAmount("10000000", 7)).toBe("1");
      expect(formatTokenAmount(10000000, 7)).toBe("1");
    });

    it("is consistent with formatStroop for 7-decimal values", () => {
      // The canonical formatter and the stroop convenience wrapper must
      // always agree — this is the key cross-formatter consistency check.
      const stroopValues = [0n, 1n, 10_000_000n, 15_500_000n, 999_999_999n];
      for (const v of stroopValues) {
        expect(formatTokenAmount(v, 7)).toBe(formatStroop(v));
      }
    });

    it("handles large stroop values without float precision drift", () => {
      // Number(9_007_199_254_740_993n) loses precision in JS float arithmetic.
      // formatTokenAmount uses pure bigint so the result is exact.
      const large = 9_007_199_254_740_993n; // > Number.MAX_SAFE_INTEGER
      expect(formatTokenAmount(large, 7)).toBe("900719925.4740993");
      // The old Number()-based formatStroop would have returned "900719925.4740992"
      // (the nearest float). Verify the new delegation path is exact:
      expect(formatStroop(large)).toBe("900719925.4740993");
    });

    it("formats a 0-decimal token cleanly (no fractional part is ever produced)", () => {
      expect(formatTokenAmount(0n, 0)).toBe("0");
      expect(formatTokenAmount(42n, 0)).toBe("42");
      expect(formatTokenAmount(-42n, 0)).toBe("-42");
    });

    it("formats a 14-decimal token, trimming trailing zeros correctly", () => {
      // Whole amount: all 14 fractional digits are zero and get stripped.
      expect(formatTokenAmount(100_000_000_000_000n, 14)).toBe("1");
      // Fractional amount with trailing zeros to strip.
      expect(formatTokenAmount(150_000_000_000_000n, 14)).toBe("1.5");
      // Single unit of the smallest denomination — dust at 14 decimals.
      expect(formatTokenAmount(1n, 14)).toBe("0.00000000000001");
      // Value with a non-zero digit in every fractional place.
      expect(formatTokenAmount(123_456_789_012_345n, 14)).toBe("1.23456789012345");
    });
  });

  describe("toRawAmount", () => {
    it("should convert correctly with various decimals", () => {
      expect(toRawAmount("1.5", 6)).toBe(1500000n);
      expect(toRawAmount("0.0000001", 7)).toBe(1n);
      expect(toRawAmount("12", 2)).toBe(1200n);
      expect(toRawAmount("0", 7)).toBe(0n);
    });

    it("should accept number inputs", () => {
      expect(toRawAmount(1.5, 6)).toBe(1500000n);
      expect(toRawAmount(12, 2)).toBe(1200n);
    });

    it("should handle negative inputs", () => {
      expect(toRawAmount("-1.5", 6)).toBe(-1500000n);
      expect(toRawAmount(-0.5, 6)).toBe(-500000n);
    });

    it("should reject invalid inputs gracefully", () => {
      expect(() => toRawAmount("abc", 7)).toThrow("Invalid amount: not a number");
      expect(() => toRawAmount("1.123", 2)).toThrow("Invalid amount: exceeds 2 decimal places");
      expect(() => toRawAmount("", 7)).toThrow("Invalid amount: not a number");
    });

    it("should handle .5 and 5. edge cases", () => {
      expect(toRawAmount(".5", 7)).toBe(5000000n);
      expect(toRawAmount("5.", 7)).toBe(50000000n);
      expect(toRawAmount(".5", 1)).toBe(5n);
      expect(toRawAmount("5.", 1)).toBe(50n);
    });

    it("should reject over-precision inputs", () => {
      expect(() => toRawAmount("1.12345678", 7)).toThrow(
        "Invalid amount: exceeds 7 decimal places",
      );
      expect(() => toRawAmount("0.1234567890", 9)).toThrow(
        "Invalid amount: exceeds 9 decimal places",
      );
    });

    it("should handle negative inputs with various decimals", () => {
      expect(toRawAmount("-5.", 7)).toBe(-50000000n);
      expect(toRawAmount("-.5", 7)).toBe(-5000000n);
      expect(toRawAmount("-12.34", 2)).toBe(-1234n);
    });

    it("should handle 0-decimal tokens, rejecting any fractional part", () => {
      expect(toRawAmount("5", 0)).toBe(5n);
      expect(toRawAmount("0", 0)).toBe(0n);
      expect(() => toRawAmount("5.5", 0)).toThrow("Invalid amount: exceeds 0 decimal places");
    });

    it("should normalize negative zero to plain zero", () => {
      expect(toRawAmount("-0", 7)).toBe(0n);
      expect(toRawAmount("-0.0", 7)).toBe(0n);
    });

    it("should convert sub-stroop precision exactly, with no float rounding drift", () => {
      // 0.1 cannot be represented exactly as a binary float; the bigint path
      // must still produce the exact integer amount at every decimal count.
      expect(toRawAmount("0.1", 7)).toBe(1_000_000n);
      // Smallest possible unit at the target precision.
      expect(toRawAmount("0.0000001", 7)).toBe(1n);
      // Round-trips through formatTokenAmount without drift.
      expect(formatTokenAmount(toRawAmount("123.4567891", 7), 7)).toBe("123.4567891");
    });

    it("should reject non-finite and empty numeric-looking inputs", () => {
      expect(() => toRawAmount("NaN", 7)).toThrow("Invalid amount: not a number");
      expect(() => toRawAmount("Infinity", 7)).toThrow("Invalid amount: not a number");
      expect(() => toRawAmount(".", 7)).toThrow("Invalid amount: not a number");
    });
  });

  describe("formatBasisPoints", () => {
    it("should format integer percentages", () => {
      expect(formatBasisPoints(100)).toBe("1%");
      expect(formatBasisPoints(500)).toBe("5%");
      expect(formatBasisPoints(0)).toBe("0%");
      expect(formatBasisPoints(10000)).toBe("100%");
    });

    it("should format fractional percentages with two decimals", () => {
      expect(formatBasisPoints(150)).toBe("1.50%");
      expect(formatBasisPoints(33)).toBe("0.33%");
      expect(formatBasisPoints(67)).toBe("0.67%");
      expect(formatBasisPoints(1234)).toBe("12.34%");
    });
  });

  describe("normalizeAddress", () => {
    it("returns null for the zero-address placeholder", () => {
      expect(normalizeAddress(ZERO_ADDRESS)).toBeNull();
    });

    it("returns null for falsy values", () => {
      expect(normalizeAddress(null)).toBeNull();
      expect(normalizeAddress(undefined)).toBeNull();
      expect(normalizeAddress("")).toBeNull();
      expect(normalizeAddress(0)).toBeNull();
    });

    it("returns null for strings that are not valid G-addresses", () => {
      // Too short
      expect(normalizeAddress("GABC")).toBeNull();
      // Wrong prefix
      expect(
        normalizeAddress("XAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"),
      ).toBeNull();
      // Correct length but wrong prefix
      expect(
        normalizeAddress("BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"),
      ).toBeNull();
    });

    it("returns the address string for a valid 56-char G-address", () => {
      const valid = "GBWMCCC3NHSKLAOJDBKKYW7SSH2PFTTNVFKWKPKQZT4QDKXV4STPEQAA";
      expect(normalizeAddress(valid)).toBe(valid);
    });

    it("coerces non-string inputs via toString before validating", () => {
      const valid = "GBWMCCC3NHSKLAOJDBKKYW7SSH2PFTTNVFKWKPKQZT4QDKXV4STPEQAA";
      const wrapper = { toString: () => valid };
      expect(normalizeAddress(wrapper)).toBe(valid);
    });

    it("returns null when toString produces the zero-address", () => {
      const wrapper = { toString: () => ZERO_ADDRESS };
      expect(normalizeAddress(wrapper)).toBeNull();
    });

    it("returns null for a non-zero numeric value coerced to a non-G string", () => {
      // Truthy, non-zero-address, but toString() won't be a valid G-address.
      expect(normalizeAddress(12345)).toBeNull();
    });
  });
});
