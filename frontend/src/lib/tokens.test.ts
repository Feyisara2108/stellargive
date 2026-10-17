import { describe, it, expect } from "vitest";
import { Networks, StrKey } from "@stellar/stellar-sdk";
import {
  PREDEFINED_USDC_CONTRACT_IDS,
  resolveUsdcContractId,
  NATIVE_XLM_CONTRACT_ID,
} from "./tokens";

describe("tokens", () => {
  it("derives valid SAC contract ID for native XLM", () => {
    expect(StrKey.isValidContract(NATIVE_XLM_CONTRACT_ID)).toBe(true);
  });

  it("ensures every predefined USDC contract address is a valid StrKey contract", () => {
    const predefinedList = Object.entries(PREDEFINED_USDC_CONTRACT_IDS);
    expect(predefinedList.length).toBeGreaterThan(0);

    for (const [network, contractId] of predefinedList) {
      expect(
        StrKey.isValidContract(contractId),
        `Expected contract ID for network "${network}" to be a valid StrKey contract, got: ${contractId}`,
      ).toBe(true);
    }
  });

  it("resolves predefined USDC contract address on Testnet", () => {
    const resolved = resolveUsdcContractId(Networks.TESTNET, undefined);
    expect(resolved).toBe(PREDEFINED_USDC_CONTRACT_IDS[Networks.TESTNET]);
    expect(resolved).not.toBeNull();
  });

  it("resolves predefined USDC contract address on Mainnet", () => {
    const resolved = resolveUsdcContractId(Networks.PUBLIC, undefined);
    expect(resolved).toBe(PREDEFINED_USDC_CONTRACT_IDS[Networks.PUBLIC]);
    expect(resolved).not.toBeNull();
  });

  it("returns null for networks without a predefined USDC issuer (e.g. Standalone) when no override is set", () => {
    const resolved = resolveUsdcContractId(Networks.STANDALONE, undefined);
    expect(resolved).toBeNull();
  });

  it("ensures the env override takes precedence over predefined network addresses", () => {
    const customContract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
    // Even on Testnet where a predefined address exists, env override wins
    const resolved = resolveUsdcContractId(Networks.TESTNET, customContract);
    expect(resolved).toBe(customContract);
  });

  it("ignores invalid env overrides and falls back to predefined address if available", () => {
    const invalidContract = "invalid-contract-id";
    const resolved = resolveUsdcContractId(Networks.TESTNET, invalidContract);
    expect(resolved).toBe(PREDEFINED_USDC_CONTRACT_IDS[Networks.TESTNET]);
  });
});
