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
import { mapTransactionError } from "./useSoroban";

describe("mapTransactionError", () => {
  describe("cancellation bucket", () => {
    it("maps 'User declined' messages to 'Transaction was cancelled.'", () => {
      expect(mapTransactionError(new Error("User declined access"))).toBe(
        "Transaction was cancelled."
      );
      expect(mapTransactionError("Error: User declined transaction")).toBe(
        "Transaction was cancelled."
      );
    });

    it("maps 'User rejected' messages to 'Transaction was cancelled.'", () => {
      expect(mapTransactionError(new Error("User rejected the request"))).toBe(
        "Transaction was cancelled."
      );
    });

    it("maps 'cancelled' messages to 'Transaction was cancelled.'", () => {
      expect(mapTransactionError(new Error("Request was cancelled by user"))).toBe(
        "Transaction was cancelled."
      );
      expect(mapTransactionError("cancelled")).toBe("Transaction was cancelled.");
    });

    it("maps 'Wallet error' messages to 'Transaction was cancelled.'", () => {
      expect(mapTransactionError(new Error("Wallet error: user closed popup"))).toBe(
        "Transaction was cancelled."
      );
    });
  });

  describe("network error bucket", () => {
    it("maps 'Network Error' messages to 'Network error. Please try again.'", () => {
      expect(mapTransactionError(new Error("Network Error: timeout"))).toBe(
        "Network error. Please try again."
      );
    });

    it("maps 'Failed to fetch' messages to 'Network error. Please try again.'", () => {
      expect(mapTransactionError(new Error("TypeError: Failed to fetch"))).toBe(
        "Network error. Please try again."
      );
    });

    it("maps 'Send failed' messages to 'Network error. Please try again.'", () => {
      expect(mapTransactionError(new Error("RPC Send failed"))).toBe(
        "Network error. Please try again."
      );
    });
  });

  describe("on-chain failure bucket", () => {
    it("maps 'Simulation failed' messages to 'Transaction failed on-chain.'", () => {
      expect(mapTransactionError(new Error("Simulation failed: host invocation error"))).toBe(
        "Transaction failed on-chain."
      );
    });

    it("maps 'Transaction failed' messages to 'Transaction failed on-chain.'", () => {
      expect(mapTransactionError(new Error("Transaction failed with status FAILED"))).toBe(
        "Transaction failed on-chain."
      );
    });
  });

  describe("generic fallback bucket", () => {
    it("maps unknown Error messages to 'Something went wrong. Please try again.'", () => {
      expect(mapTransactionError(new Error("Unknown unexpected error occurred"))).toBe(
        "Something went wrong. Please try again."
      );
    });

    it("maps arbitrary string errors to fallback", () => {
      expect(mapTransactionError("500 Internal Server Error")).toBe(
        "Something went wrong. Please try again."
      );
    });

    it("handles null and undefined gracefully with fallback", () => {
      expect(mapTransactionError(null)).toBe("Something went wrong. Please try again.");
      expect(mapTransactionError(undefined)).toBe("Something went wrong. Please try again.");
    });

    it("handles empty objects and non-string errors gracefully with fallback", () => {
      expect(mapTransactionError({})).toBe("Something went wrong. Please try again.");
      expect(mapTransactionError(12345)).toBe("Something went wrong. Please try again.");
    });
  });
});
