import { describe, it, expect } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { isValidAccountAddress, isValidContractAddress } from "@/lib/strkey";

describe("isValidAccountAddress", () => {
  it("accepts real account addresses", () => {
    for (let i = 0; i < 25; i++) {
      expect(isValidAccountAddress(Keypair.random().publicKey())).toBe(true);
    }
    expect(isValidAccountAddress("GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ")).toBe(
      true,
    );
  });

  it("agrees with the SDK on corrupted addresses", () => {
    const valid = Keypair.random().publicKey();
    for (let i = 1; i < valid.length; i++) {
      const swapped = valid[i] === "A" ? "B" : "A";
      const corrupted = valid.slice(0, i) + swapped + valid.slice(i + 1);
      expect(isValidAccountAddress(corrupted)).toBe(StrKey.isValidEd25519PublicKey(corrupted));
    }
  });

  it("rejects malformed input and non-account strkeys", () => {
    expect(isValidAccountAddress("")).toBe(false);
    expect(isValidAccountAddress("G123")).toBe(false);
    expect(isValidAccountAddress(Keypair.random().publicKey().toLowerCase())).toBe(false);
    // Secret seed and contract addresses are valid strkeys, but not accounts.
    expect(isValidAccountAddress(Keypair.random().secret())).toBe(false);
    expect(isValidAccountAddress("CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC")).toBe(
      false,
    );
  });
});

describe("isValidContractAddress", () => {
  const CONTRACT = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

  it("accepts contract addresses and agrees with the SDK on corruptions", () => {
    expect(isValidContractAddress(CONTRACT)).toBe(true);
    for (let i = 1; i < CONTRACT.length; i++) {
      const swapped = CONTRACT[i] === "A" ? "B" : "A";
      const corrupted = CONTRACT.slice(0, i) + swapped + CONTRACT.slice(i + 1);
      expect(isValidContractAddress(corrupted)).toBe(StrKey.isValidContract(corrupted));
    }
  });

  it("rejects account addresses and junk", () => {
    expect(isValidContractAddress(Keypair.random().publicKey())).toBe(false);
    expect(isValidContractAddress("invalid-contract-id")).toBe(false);
  });
});
