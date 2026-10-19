import { describe, it, expect } from "vitest";
import { CONTRACT_ERROR_CODES, getContractErrorCode } from "./contractErrors";

describe("getContractErrorCode", () => {
  it("extracts the code from a host error string", () => {
    expect(
      getContractErrorCode(new Error("Simulation failed: HostError: Error(Contract, #18)")),
    ).toBe(CONTRACT_ERROR_CODES.ExceedsDonorCap);
    expect(getContractErrorCode({ message: "Error(Contract, #12)" })).toBe(
      CONTRACT_ERROR_CODES.InvalidShares,
    );
  });

  it("returns null for non-contract errors", () => {
    expect(getContractErrorCode(new Error("Network Error"))).toBeNull();
    expect(getContractErrorCode("Error(WasmVm, InvalidAction)")).toBeNull();
  });
});
