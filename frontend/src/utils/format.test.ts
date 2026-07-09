import { describe, it, expect } from "vitest";
import { formatStroop, formatAddress, formatXLM, formatTokenAmount, toRawAmount } from "./format";

describe("format utils", () => {
  describe("formatStroop", () => {
    it("should format stroop boundaries correctly", () => {
      const cases = [
        { input: 0n, expected: "0.0000000" },
        { input: 1n, expected: "0.0000001" }, // dust
        { input: 10000000n, expected: "1.0000000" }, // 1 XLM
        { input: 100000000000000n, expected: "10000000.0000000" }, // large amount
      ];
      cases.forEach(({ input, expected }) => {
        expect(formatStroop(input)).toBe(expected);
      });
    });
  });

  describe("formatAddress", () => {
    it("should format addresses", () => {
      expect(formatAddress("GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890")).toBe("GABC...7890");
      expect(formatAddress("short")).toBe("short");
      expect(formatAddress("")).toBe("");
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
  });
});
