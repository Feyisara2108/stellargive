import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Account, Keypair } from "@stellar/stellar-sdk";

const mocks = vi.hoisted(() => ({
  getAccount: vi.fn(),
  simulateTransaction: vi.fn(),
  prepareTransaction: vi.fn(),
  sendTransaction: vi.fn(),
  getTransaction: vi.fn(),
}));

// `soroban.ts` constructs its RPC client at module load, so the fake server
// has to exist before the import below. Everything except the server is the
// real SDK, which keeps transaction building and signing realistic.
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

import {
  submitTransactionWithKeypair,
  TRANSACTION_CONFIRMATION_MARGIN_MS,
  TransactionTimeoutError,
} from "@/lib/soroban";

let keypair: Keypair;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

  keypair = Keypair.random();
  mocks.getAccount.mockResolvedValue(new Account(keypair.publicKey(), "0"));
  mocks.simulateTransaction.mockResolvedValue({ minResourceFee: "0" });
  mocks.prepareTransaction.mockImplementation(async (tx: unknown) => tx);
  mocks.sendTransaction.mockResolvedValue({ status: "PENDING", hash: "timeout-test-hash" });
  mocks.getTransaction.mockResolvedValue({ status: "NOT_FOUND" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("submitTransaction confirmation polling (#1054)", () => {
  it("stops after the transaction's time bound plus margin when the RPC never returns SUCCESS", async () => {
    let caught: unknown;
    const submission = submitTransactionWithKeypair(keypair, "donate", []).catch((error) => {
      caught = error;
    });

    // Let account loading, simulation and signing finish before the polling
    // loop schedules its first one-second wait.
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.sendTransaction).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(31_000 + TRANSACTION_CONFIRMATION_MARGIN_MS);
    await submission;

    expect(caught).toBeInstanceOf(TransactionTimeoutError);
    expect((caught as Error).message).toMatch(/timed out/i);
    expect(mocks.getTransaction).toHaveBeenCalled();
  });

  it("returns as soon as a successful transaction has its result metadata", async () => {
    mocks.getTransaction
      .mockResolvedValueOnce({ status: "NOT_FOUND" })
      .mockResolvedValueOnce({ status: "SUCCESS", resultMetaXdr: "result-meta" });

    const submission = submitTransactionWithKeypair(keypair, "donate", []);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(submission).resolves.toMatchObject({
      status: "SUCCESS",
      hash: "timeout-test-hash",
    });
    expect(mocks.getTransaction).toHaveBeenCalledTimes(2);
  });
});
