import { describe, expect, it } from "vitest";
import { fromStroops, STROOP_PRECISION, toStroops } from "./amounts";

describe("toStroops", () => {
  it("converts valid whole and fractional amounts", () => {
    expect(toStroops("1")).toBe(10_000_000n);
    expect(toStroops("0.5")).toBe(5_000_000n);
    expect(toStroops("0.0000001")).toBe(1n);
    expect(toStroops("1234.5678901")).toBe(12_345_678_901n);
  });

  it("accepts exactly 7 decimal places", () => {
    expect(STROOP_PRECISION).toBe(7);
    expect(toStroops("0.1234567")).toBe(1_234_567n);
  });

  it("rejects more than 7 decimal places", () => {
    expect(() => toStroops("0.12345678")).toThrow("Invalid amount: exceeds 7 decimal places");
  });

  it("rejects negative values", () => {
    expect(() => toStroops("-1")).toThrow("Invalid amount: negative values not allowed");
    expect(() => toStroops("-0.5")).toThrow("Invalid amount: negative values not allowed");
  });

  it("rejects empty and non-numeric values", () => {
    expect(() => toStroops("")).toThrow("Invalid amount: not a number");
    expect(() => toStroops("   ")).toThrow("Invalid amount: not a number");
    expect(() => toStroops("abc")).toThrow("Invalid amount: not a number");
    expect(() => toStroops("1.2.3")).toThrow("Invalid amount: not a number");
  });

  it("accepts leading zeros", () => {
    expect(toStroops("007")).toBe(70_000_000n);
    expect(toStroops("000.5")).toBe(5_000_000n);
    expect(toStroops("0000000.0000001")).toBe(1n);
  });
});

describe("fromStroops", () => {
  it("returns '0' for zero", () => {
    expect(fromStroops(0n)).toBe("0");
    expect(fromStroops("0")).toBe("0");
    expect(fromStroops(0)).toBe("0");
  });

  it("formats whole values", () => {
    expect(fromStroops(10_000_000n)).toBe("1");
    expect(fromStroops(100_000_000n)).toBe("10");
    expect(fromStroops(1_000_000_000n)).toBe("100");
  });

  it("trims trailing zeros from the fractional part", () => {
    expect(fromStroops(5_000_000n)).toBe("0.5");
    expect(fromStroops(10_100_000n)).toBe("1.01");
    expect(fromStroops(15_000_000n)).toBe("1.5");
  });

  it("formats negative values", () => {
    expect(fromStroops(-1n)).toBe("-0.0000001");
    expect(fromStroops(-15_000_000n)).toBe("-1.5");
    expect(fromStroops(-10_000_000n)).toBe("-1");
    expect(fromStroops(-50_000n)).toBe("-0.005");
  });

  it("accepts bigint, string and number inputs", () => {
    expect(fromStroops(1_234_567n)).toBe("0.1234567");
    expect(fromStroops("1234567")).toBe("0.1234567");
    expect(fromStroops(1_234_567)).toBe("0.1234567");
    expect(fromStroops("-15000000")).toBe("-1.5");
  });

  it("rejects non-integer number input with a clear error", () => {
    expect(() => fromStroops(1.5)).toThrow("Invalid stroops: value must be an integer");
    expect(() => fromStroops(Number.NaN)).toThrow("Invalid stroops: value must be an integer");
  });
});

describe("round trip", () => {
  it("preserves amounts through toStroops and fromStroops", () => {
    const amounts = ["0.0000001", "0.05", "0.5", "1", "100", "1234.5678901"];
    for (const amount of amounts) {
      expect(fromStroops(toStroops(amount))).toBe(amount);
    }
  });
});
