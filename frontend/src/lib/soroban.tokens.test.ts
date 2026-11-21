import { describe, it, expect, vi, beforeEach } from "vitest";
import { nativeToScVal, Keypair, Address } from "@stellar/stellar-sdk";

const mocks = vi.hoisted(() => ({
  simulateTransaction: vi.fn(),
  getAccount: vi.fn(),
  prepareTransaction: vi.fn(),
  sendTransaction: vi.fn(),
  getTransaction: vi.fn(),
  getLedgerEntries: vi.fn(),
}));

vi.mock("@stellar/stellar-sdk", async (importActual) => {
  const actual = await importActual<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn(function () {
        return mocks;
      }),
    },
  };
});

import { getSACBalance, getTokenMetadata } from "@/lib/soroban";
import { decodeInvocation } from "../../e2e/support/xdr";

const CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

describe("getSACBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns retval of i128 as bigint and asserts transaction invokes balance", async () => {
    const userAddress = Keypair.random().publicKey();
    const expectedBalance = 5_000_000_000n;

    mocks.simulateTransaction.mockResolvedValueOnce({
      result: {
        retval: nativeToScVal(expectedBalance, { type: "i128" }),
      },
    });

    const balance = await getSACBalance(CONTRACT_ID, userAddress);
    expect(balance).toBe(expectedBalance);

    expect(mocks.simulateTransaction).toHaveBeenCalledTimes(1);
    const tx = mocks.simulateTransaction.mock.calls[0][0];
    const op = tx.operations[0];
    expect(Address.fromScAddress(op.func.invokeContract.contractAddress).toString()).toBe(
      CONTRACT_ID,
    );

    const invocation = decodeInvocation(tx.toXDR());
    expect(invocation).toEqual({
      fn: "balance",
      args: [userAddress],
    });
  });

  it("throws with simulation error message when simulation fails", async () => {
    const userAddress = Keypair.random().publicKey();
    mocks.simulateTransaction.mockResolvedValueOnce({
      error: "HostError: Error(Contract, #1)",
    });

    await expect(getSACBalance(CONTRACT_ID, userAddress)).rejects.toThrow(
      "Simulation failed: HostError: Error(Contract, #1)",
    );
  });

  it("throws when simulation result is missing", async () => {
    const userAddress = Keypair.random().publicKey();
    mocks.simulateTransaction.mockResolvedValueOnce({});

    await expect(getSACBalance(CONTRACT_ID, userAddress)).rejects.toThrow(
      "Failed to get balance: no result",
    );
  });

  it("returns 0n when balance is 0", async () => {
    const userAddress = Keypair.random().publicKey();
    mocks.simulateTransaction.mockResolvedValueOnce({
      result: {
        retval: nativeToScVal(0n, { type: "i128" }),
      },
    });

    const balance = await getSACBalance(CONTRACT_ID, userAddress);
    expect(balance).toBe(0n);
  });
});

describe("getTokenMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns symbol and decimals and validates contract invocations", async () => {
    mocks.simulateTransaction
      .mockResolvedValueOnce({
        result: {
          retval: nativeToScVal("USDC", { type: "string" }),
        },
      })
      .mockResolvedValueOnce({
        result: {
          retval: nativeToScVal(7, { type: "u32" }),
        },
      });

    const metadata = await getTokenMetadata(CONTRACT_ID);
    expect(metadata).toEqual({
      symbol: "USDC",
      decimals: 7,
    });

    expect(mocks.simulateTransaction).toHaveBeenCalledTimes(2);

    const txSymbol = mocks.simulateTransaction.mock.calls[0][0];
    const opSymbol = txSymbol.operations[0];
    expect(Address.fromScAddress(opSymbol.func.invokeContract.contractAddress).toString()).toBe(
      CONTRACT_ID,
    );
    expect(decodeInvocation(txSymbol.toXDR())).toEqual({
      fn: "symbol",
      args: [],
    });

    const txDecimals = mocks.simulateTransaction.mock.calls[1][0];
    const opDecimals = txDecimals.operations[0];
    expect(Address.fromScAddress(opDecimals.func.invokeContract.contractAddress).toString()).toBe(
      CONTRACT_ID,
    );
    expect(decodeInvocation(txDecimals.toXDR())).toEqual({
      fn: "decimals",
      args: [],
    });
  });

  it("throws expected error when symbol simulation has an error", async () => {
    mocks.simulateTransaction.mockResolvedValueOnce({
      error: "Symbol call failed",
    });

    await expect(getTokenMetadata(CONTRACT_ID)).rejects.toThrow(
      "Failed to fetch symbol or not a valid SAC/Token contract",
    );
  });

  it("throws expected error when symbol simulation result is missing", async () => {
    mocks.simulateTransaction.mockResolvedValueOnce({});

    await expect(getTokenMetadata(CONTRACT_ID)).rejects.toThrow(
      "Failed to fetch symbol or not a valid SAC/Token contract",
    );
  });

  it("throws expected error when decimals simulation has an error", async () => {
    mocks.simulateTransaction
      .mockResolvedValueOnce({
        result: {
          retval: nativeToScVal("TEST", { type: "string" }),
        },
      })
      .mockResolvedValueOnce({
        error: "Decimals call failed",
      });

    await expect(getTokenMetadata(CONTRACT_ID)).rejects.toThrow(
      "Failed to fetch decimals or not a valid SAC/Token contract",
    );
  });

  it("throws expected error when decimals simulation result is missing", async () => {
    mocks.simulateTransaction
      .mockResolvedValueOnce({
        result: {
          retval: nativeToScVal("TEST", { type: "string" }),
        },
      })
      .mockResolvedValueOnce({});

    await expect(getTokenMetadata(CONTRACT_ID)).rejects.toThrow(
      "Failed to fetch decimals or not a valid SAC/Token contract",
    );
  });
});
