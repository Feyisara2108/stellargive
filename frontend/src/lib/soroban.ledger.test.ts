import { describe, it, expect, vi, beforeEach } from "vitest";
import { xdr, Keypair, Address, nativeToScVal, scValToNative } from "@stellar/stellar-sdk";

const mocks = vi.hoisted(() => ({
  getLedgerEntries: vi.fn(),
  simulateTransaction: vi.fn(),
  getAccount: vi.fn(),
  prepareTransaction: vi.fn(),
  sendTransaction: vi.fn(),
  getTransaction: vi.fn(),
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

import {
  getAccountMinimumReserve,
  getDonorContribution,
  computeMinimumReserve,
} from "@/lib/soroban";
import { CONTRACT_ID } from "@/lib/config";

function buildRealAccountEntry(options: {
  publicKey: string;
  numSubEntries: number;
  ext: xdr.AccountEntryExt;
}): xdr.LedgerEntryData {
  const account = new xdr.AccountEntry({
    accountId: Keypair.fromPublicKey(options.publicKey).xdrPublicKey(),
    balance: 100_000_000n,
    seqNum: 1n,
    numSubEntries: options.numSubEntries,
    inflationDest: null,
    flags: 0,
    homeDomain: "",
    thresholds: new xdr.Thresholds(Buffer.alloc(4)),
    signers: [],
    ext: options.ext,
  });
  return xdr.LedgerEntryData.account(account);
}

function buildRealContractDataEntry(val: bigint): xdr.LedgerEntryData {
  const cData = new xdr.ContractDataEntry({
    contract: new Address(CONTRACT_ID).toScAddress(),
    key: nativeToScVal("test"),
    durability: xdr.ContractDataDurability.persistent,
    val: nativeToScVal(val, { type: "i128" }),
    ext: xdr.ExtensionPoint.v0(),
  });
  return xdr.LedgerEntryData.contractData(cData);
}

describe("getAccountMinimumReserve", () => {
  const BASE_RESERVE = computeMinimumReserve({ numSubEntries: 0 });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates reserve for account with v0 extension (sub-entries only)", async () => {
    const address = Keypair.random().publicKey();
    const entryData = buildRealAccountEntry({
      publicKey: address,
      numSubEntries: 3,
      ext: xdr.AccountEntryExt.v0(),
    });

    mocks.getLedgerEntries.mockResolvedValueOnce({
      entries: [{ val: entryData }],
    });

    const reserve = await getAccountMinimumReserve(address);
    const expected = computeMinimumReserve({ numSubEntries: 3 });
    expect(reserve).toBe(expected);

    expect(mocks.getLedgerEntries).toHaveBeenCalledTimes(1);
    const passedKey = mocks.getLedgerEntries.mock.calls[0][0];
    const expectedKey = xdr.LedgerKey.account(
      new xdr.LedgerKeyAccount({ accountId: Keypair.fromPublicKey(address).xdrPublicKey() }),
    );
    expect(passedKey.type).toBe("account");
    expect(passedKey.toXDR("base64")).toBe(expectedKey.toXDR("base64"));
  });

  it("calculates reserve for account with v1 extension and selling liabilities", async () => {
    const address = Keypair.random().publicKey();
    const v1 = new xdr.AccountEntryExtensionV1({
      liabilities: new xdr.Liabilities({ buying: 0n, selling: 1_234n }),
      ext: xdr.AccountEntryExtensionV1Ext.v0(),
    });
    const entryData = buildRealAccountEntry({
      publicKey: address,
      numSubEntries: 4,
      ext: xdr.AccountEntryExt.v1(v1),
    });

    mocks.getLedgerEntries.mockResolvedValueOnce({
      entries: [{ val: entryData }],
    });

    const reserve = await getAccountMinimumReserve(address);
    const expected = computeMinimumReserve({
      numSubEntries: 4,
      sellingLiabilities: 1_234n,
    });
    expect(reserve).toBe(expected);
  });

  it("calculates reserve for account with v2 extension (sponsoring and sponsored counts)", async () => {
    const address = Keypair.random().publicKey();
    const v2 = new xdr.AccountEntryExtensionV2({
      numSponsored: 1,
      numSponsoring: 3,
      signerSponsoringIDs: [],
      ext: xdr.AccountEntryExtensionV2Ext.v0(),
    });
    const v1 = new xdr.AccountEntryExtensionV1({
      liabilities: new xdr.Liabilities({ buying: 0n, selling: 2_500n }),
      ext: xdr.AccountEntryExtensionV1Ext.v2(v2),
    });
    const entryData = buildRealAccountEntry({
      publicKey: address,
      numSubEntries: 5,
      ext: xdr.AccountEntryExt.v1(v1),
    });

    mocks.getLedgerEntries.mockResolvedValueOnce({
      entries: [{ val: entryData }],
    });

    const reserve = await getAccountMinimumReserve(address);
    const expected = computeMinimumReserve({
      numSubEntries: 5,
      numSponsoring: 3,
      numSponsored: 1,
      sellingLiabilities: 2_500n,
    });
    expect(reserve).toBe(expected);
  });

  it("falls back to base reserve of 2 entries when entry is not an account", async () => {
    const address = Keypair.random().publicKey();
    const dataEntry = new xdr.DataEntry({
      accountId: Keypair.fromPublicKey(address).xdrPublicKey(),
      dataName: "custom_data",
      dataValue: Buffer.from("data_value"),
      ext: xdr.DataEntryExt.v0(),
    });
    const nonAccountData = xdr.LedgerEntryData.data(dataEntry);

    mocks.getLedgerEntries.mockResolvedValueOnce({
      entries: [{ val: nonAccountData }],
    });

    const reserve = await getAccountMinimumReserve(address);
    expect(reserve).toBe(BASE_RESERVE);
  });

  it("falls back to base reserve of 2 entries when entries list is empty", async () => {
    const address = Keypair.random().publicKey();
    mocks.getLedgerEntries.mockResolvedValueOnce({
      entries: [],
    });

    const reserve = await getAccountMinimumReserve(address);
    expect(reserve).toBe(BASE_RESERVE);
  });

  it("falls back to base reserve of 2 entries when getLedgerEntries throws an error", async () => {
    const address = Keypair.random().publicKey();
    mocks.getLedgerEntries.mockRejectedValueOnce(new Error("RPC network unreachable"));

    const reserve = await getAccountMinimumReserve(address);
    expect(reserve).toBe(BASE_RESERVE);
  });
});

describe("getDonorContribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns stored i128 as bigint and builds persistent key shaped ['DCON', u64 id, donor address]", async () => {
    const campaignId = 42n;
    const donor = Keypair.random().publicKey();
    const expectedContribution = 98_765_432_000n;
    const entryData = buildRealContractDataEntry(expectedContribution);

    mocks.getLedgerEntries.mockResolvedValueOnce({
      entries: [{ val: entryData }],
    });

    const contribution = await getDonorContribution(campaignId, donor);
    expect(contribution).toBe(expectedContribution);

    expect(mocks.getLedgerEntries).toHaveBeenCalledTimes(1);
    const passedKey = mocks.getLedgerEntries.mock.calls[0][0];
    expect(passedKey.type).toBe("contractData");
    expect(passedKey.contractData.durability).toBe(xdr.ContractDataDurability.persistent);

    const decodedKey = scValToNative(passedKey.contractData.key);
    expect(decodedKey).toEqual(["DCON", campaignId, donor]);
  });

  it("returns 0n when no entry exists", async () => {
    const campaignId = 1n;
    const donor = Keypair.random().publicKey();

    mocks.getLedgerEntries.mockResolvedValueOnce({
      entries: [],
    });

    const contribution = await getDonorContribution(campaignId, donor);
    expect(contribution).toBe(0n);
  });

  it("returns 0n when entry is not contractData", async () => {
    const campaignId = 1n;
    const donor = Keypair.random().publicKey();
    const nonContractData = xdr.LedgerEntryData.account(
      new xdr.AccountEntry({
        accountId: Keypair.fromPublicKey(donor).xdrPublicKey(),
        balance: 1000n,
        seqNum: 1n,
        numSubEntries: 0,
        inflationDest: null,
        flags: 0,
        homeDomain: "",
        thresholds: new xdr.Thresholds(Buffer.alloc(4)),
        signers: [],
        ext: xdr.AccountEntryExt.v0(),
      }),
    );

    mocks.getLedgerEntries.mockResolvedValueOnce({
      entries: [{ val: nonContractData }],
    });

    const contribution = await getDonorContribution(campaignId, donor);
    expect(contribution).toBe(0n);
  });
});
