import type { Campaign, CampaignBeneficiary } from "@/lib/soroban";
import { xdr, Address, nativeToScVal } from "@stellar/stellar-sdk";

export const WALLET_ADDRESS = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

export const makeCampaign = (overrides?: Partial<Campaign>): Campaign => ({
  id: 1n,
  creator: WALLET_ADDRESS,
  beneficiary: WALLET_ADDRESS,
  beneficiaries: [{ address: WALLET_ADDRESS, share: 10000 }],
  title: "Test Campaign",
  description: "Test description",
  category: "relief",
  target_amount: 1_000_000_000n,
  raised_amount: 350_000_000n,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 86_400),
  accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  status: "Active",
  ...overrides,
});

export const makeEvent = (
  id: string,
  topic: "received" | "created" | "claimed",
  data: (bigint | string | number | null)[],
  ledger = 100,
) => ({
  id,
  topic,
  data,
  ledger,
  txHash: "0000000000000000000000000000000000000000000000000000000000000000",
});

export const makeDonationEvent = (
  id: string,
  donor: string | null,
  amountStroops: bigint,
  campaignId: bigint = 1n,
  ledger = 100,
) => ({
  id,
  topic: "received",
  data: [campaignId, donor, amountStroops, 0n, "native"],
  ledger,
  txHash: "0000000000000000000000000000000000000000000000000000000000000000",
});

// Aliases for Issue #390 compliance
export const buildCampaign = makeCampaign;
export const buildEvent = makeEvent;
export const buildDonation = makeDonationEvent;

// XDR generation helpers for MSW simulateTransaction
export function campaignToXdr(campaign: Campaign) {
  const entries = [
    new xdr.ScMapEntry({
      key: nativeToScVal("id", { type: "symbol" }),
      val: nativeToScVal(campaign.id, { type: "u64" }),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal("creator", { type: "symbol" }),
      val: new Address(campaign.creator).toScVal(),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal("beneficiary", { type: "symbol" }),
      val: new Address(campaign.beneficiary).toScVal(),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal("beneficiaries", { type: "symbol" }),
      val: xdr.ScVal.scvVec(
        campaign.beneficiaries.map((b) =>
          xdr.ScVal.scvMap([
            new xdr.ScMapEntry({
              key: nativeToScVal("address", { type: "symbol" }),
              val: new Address(b.address).toScVal(),
            }),
            new xdr.ScMapEntry({
              key: nativeToScVal("share", { type: "symbol" }),
              val: nativeToScVal(b.share, { type: "u32" }),
            }),
          ]),
        ),
      ),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal("title", { type: "symbol" }),
      val: nativeToScVal(campaign.title, { type: "string" }),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal("description", { type: "symbol" }),
      val: nativeToScVal(campaign.description, { type: "string" }),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal("category", { type: "symbol" }),
      val: nativeToScVal(campaign.category, { type: "string" }),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal("target_amount", { type: "symbol" }),
      val: nativeToScVal(campaign.target_amount, { type: "i128" }),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal("raised_amount", { type: "symbol" }),
      val: nativeToScVal(campaign.raised_amount, { type: "i128" }),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal("deadline", { type: "symbol" }),
      val: nativeToScVal(campaign.deadline, { type: "u64" }),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal("accepted_token", { type: "symbol" }),
      val: new Address(campaign.accepted_token).toScVal(),
    }),
    new xdr.ScMapEntry({
      key: nativeToScVal("status", { type: "symbol" }),
      val: xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: nativeToScVal(campaign.status, { type: "symbol" }),
          val: xdr.ScVal.scvVoid(),
        }),
      ]),
    }),
  ];
  return xdr.ScVal.scvMap(entries);
}

export function campaignArrayToXdr(campaigns: Campaign[]) {
  const maps = campaigns.map((c) => campaignToXdr(c));
  return xdr.ScVal.scvVec(maps);
}
