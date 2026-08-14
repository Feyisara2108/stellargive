import { describe, it, expect, vi } from "vitest";

// ─── Mocks (prevent transitive import issues) ───────────────────────────────
vi.mock("@/lib/WalletProvider", () => ({
  useWallet: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@stellar/freighter-api", () => ({
  signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: "mock_xdr" }),
}));

// ─── Imports ────────────────────────────────────────────────────────────────
import { getCrossedMilestones } from "./useSoroban";

describe("getCrossedMilestones", () => {
  describe("multi-cross behavior", () => {
    it("returns [25, 50] when crossing from 0 to target/2", () => {
      const target = 1000n;
      const before = 0n;
      const after = 500n; // 50%
      expect(getCrossedMilestones(before, after, target)).toEqual([25, 50]);
    });

    it("returns all milestones [25, 50, 75, 100] when spanning 20% to 100%", () => {
      const target = 1000n;
      const before = 200n; // 20%
      const after = 1000n; // 100%
      expect(getCrossedMilestones(before, after, target)).toEqual([25, 50, 75, 100]);
    });

    it("returns intermediate milestones [50, 75] when spanning 30% to 80%", () => {
      const target = 1000n;
      const before = 300n; // 30%
      const after = 800n; // 80%
      expect(getCrossedMilestones(before, after, target)).toEqual([50, 75]);
    });
  });

  describe("exact-threshold landing & re-crossing", () => {
    it("includes threshold when landing exactly on 25% (e.g. 24% to 25%)", () => {
      const target = 1000n;
      const before = 240n; // 24%
      const after = 250n; // 25%
      expect(getCrossedMilestones(before, after, target)).toEqual([25]);
    });

    it("includes threshold when landing exactly on 50%, 75%, and 100%", () => {
      const target = 1000n;
      expect(getCrossedMilestones(490n, 500n, target)).toEqual([50]);
      expect(getCrossedMilestones(740n, 750n, target)).toEqual([75]);
      expect(getCrossedMilestones(990n, 1000n, target)).toEqual([100]);
    });

    it("does not re-emit starting threshold when starting exactly on 25% and ending on 50%", () => {
      const target = 1000n;
      const before = 250n; // 25%
      const after = 500n; // 50%
      expect(getCrossedMilestones(before, after, target)).toEqual([50]);
    });

    it("returns [] when moving between amounts above an already-passed threshold without crossing a new one", () => {
      const target = 1000n;
      // Both amounts are between 25% and 50%
      expect(getCrossedMilestones(250n, 300n, target)).toEqual([]);
      expect(getCrossedMilestones(300n, 400n, target)).toEqual([]);
      // Both amounts are above 100%
      expect(getCrossedMilestones(1000n, 1200n, target)).toEqual([]);
    });
  });

  describe("zero and negative target handling", () => {
    it("returns [] when targetStroops is 0n", () => {
      expect(getCrossedMilestones(0n, 500n, 0n)).toEqual([]);
    });

    it("returns [] when targetStroops is negative (< 0n)", () => {
      expect(getCrossedMilestones(0n, 500n, -100n)).toEqual([]);
    });
  });

  describe("scaled bigint math & precision", () => {
    it("correctly handles realistic 7-decimal stroop amounts", () => {
      // Target: 10,000 XLM = 100,000,000,000 stroops
      const target = 100_000_000_000n;
      // 24.999% -> 25.000%
      const before = 24_999_000_000n;
      const after = 25_000_000_000n;
      expect(getCrossedMilestones(before, after, target)).toEqual([25]);
    });

    it("correctly calculates multi-cross with realistic 7-decimal stroop values", () => {
      const target = 50_000_000_000n; // 5,000 XLM
      const before = 10_000_000_000n; // 20%
      const after = 40_000_000_000n; // 80%
      expect(getCrossedMilestones(before, after, target)).toEqual([25, 50, 75]);
    });

    it("returns [100] when crossing 100% and landing above target (overfunding)", () => {
      const target = 1000n;
      const before = 900n; // 90%
      const after = 1500n; // 150%
      expect(getCrossedMilestones(before, after, target)).toEqual([100]);
    });
  });
});
