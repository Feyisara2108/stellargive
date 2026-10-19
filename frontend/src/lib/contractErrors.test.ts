import { describe, it, expect } from "vitest";
import {
  CONTRACT_ERROR_CODES,
  getContractErrorCode,
  mapTransactionError,
} from "./contractErrors";

describe("getContractErrorCode", () => {
  it("extracts the code from a host error string", () => {
    expect(
      getContractErrorCode(new Error("Simulation failed: HostError: Error(Contract, #18)")),
    ).toBe(CONTRACT_ERROR_CODES.ExceedsDonorCap);
    expect(getContractErrorCode({ message: "Error(Contract, #12)" })).toBe(
      CONTRACT_ERROR_CODES.InvalidShares,
    );
  });

  describe("mapTransactionError", () => {
    it("maps every contract error code to a specific user-facing message", () => {
      for (const code of Object.values(CONTRACT_ERROR_CODES)) {
        expect(mapTransactionError(new Error(`Simulation failed: Error(Contract, #${code})`))).not.toBe(
          "Transaction failed on-chain.",
        );
      }
    });

    it("explains common donation and contract errors", () => {
      expect(mapTransactionError(new Error("Error(Contract, #18)"))).toContain(
        "maximum per donor",
      );
      expect(mapTransactionError(new Error("Error(Contract, #31)"))).toContain("not allowed");
      expect(mapTransactionError(new Error("Error(Contract, #33)"))).toContain("paused");
      expect(mapTransactionError(new Error("Error(Contract, #29)"))).toContain("comment is too long");
    });

    it("uses the generic on-chain fallback when the contract code is unknown", () => {
      expect(mapTransactionError(new Error("Simulation failed: host invocation error"))).toBe(
        "Transaction failed on-chain.",
      );
    });
  });

  it("returns null for non-contract errors", () => {
    expect(getContractErrorCode(new Error("Network Error"))).toBeNull();
    expect(getContractErrorCode("Error(WasmVm, InvalidAction)")).toBeNull();
  });
});
