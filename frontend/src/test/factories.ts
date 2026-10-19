import type { Campaign } from "@/lib/soroban";
import { xdr, Address, nativeToScVal } from "@stellar/stellar-sdk";

export const WALLET_ADDRESS = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

/** Native XLM SAC on Testnet — matches `scValToNative` Address string form. */
export const NATIVE_TOKEN_ADDRESS = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

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
  accepted_token: NATIVE_TOKEN_ADDRESS,
  status: "Active",
  ...overrides,
});

export type ContractEventTopic = "received" | "created" | "claimed" | "autoclaimed";

/** Struct events decode to objects; a few (e.g. `funds/claimed`) are tuples. */
export type ContractEventPayload = Record<string, unknown> | unknown[];

export type ContractEvent = {
  id: string;
  topic: ContractEventTopic;
  data: ContractEventPayload;
  ledger: number;
  txHash: string;
  createdAt?: string;
};

/**
 * Shared envelope for contract events. `data` must match what `scValToNative`
 * returns for the event: an object for `#[contracttype]` structs, an array for
 * tuple payloads.
 */
export const makeEvent = (
  id: string,
  topic: ContractEventTopic,
  data: ContractEventPayload,
  ledger = 100,
): ContractEvent => ({
  id,
  topic,
  data,
  ledger,
  txHash: "0000000000000000000000000000000000000000000000000000000000000000",
});

/** Payload shape for `DonationEvent` after `scValToNative`. */
export type DonationEventData = {
  campaign_id: bigint;
  donor: string | null;
  amount: bigint;
  total_raised: bigint;
  accepted_token: string;
  comment: string | null;
};

export const makeDonationEventData = (
  overrides: Partial<DonationEventData> & Pick<DonationEventData, "donor" | "amount">,
): DonationEventData => ({
  campaign_id: 1n,
  total_raised: 0n,
  accepted_token: NATIVE_TOKEN_ADDRESS,
  comment: null,
  ...overrides,
});

export const makeDonationEvent = (
  id: string,
  donor: string | null,
  amountStroops: bigint,
  campaignId: bigint = 1n,
  ledger = 100,
  overrides?: Partial<DonationEventData>,
): ContractEvent =>
  makeEvent(
    id,
    "received",
    makeDonationEventData({
      campaign_id: campaignId,
      donor,
      amount: amountStroops,
      ...overrides,
    }),
    ledger,
  );

/** Payload shape for `CreatedEvent` after `scValToNative`. */
export type CreatedEventData = {
  id: bigint;
  creator: string;
  target_amount: bigint;
};

export const makeCreatedEventData = (
  overrides?: Partial<CreatedEventData>,
): CreatedEventData => ({
  id: 1n,
  creator: WALLET_ADDRESS,
  target_amount: 100_000_000n,
  ...overrides,
});

export const makeCreatedEvent = (
  id: string,
  overrides?: Partial<CreatedEventData>,
  ledger = 100,
): ContractEvent => makeEvent(id, "created", makeCreatedEventData(overrides), ledger);

/** Payload shape for `ClaimedEvent` after `scValToNative`. */
export type ClaimedEventData = {
  campaign_id: bigint;
  amount: bigint;
  beneficiary: string;
};

export const makeClaimedEventData = (
  overrides?: Partial<ClaimedEventData>,
): ClaimedEventData => ({
  campaign_id: 1n,
  amount: 50_000_000n,
  beneficiary: WALLET_ADDRESS,
  ...overrides,
});

export const makeClaimedEvent = (
  id: string,
  overrides?: Partial<ClaimedEventData>,
  ledger = 100,
): ContractEvent => makeEvent(id, "claimed", makeClaimedEventData(overrides), ledger);

/**
 * The `(funds, claimed)` event, published as a tuple
 * `(campaign_id, beneficiary, amount, accepted_token)` rather than a struct.
 */
export const makeFundsClaimedEvent = (
  id: string,
  overrides?: Partial<ClaimedEventData> & { accepted_token?: string },
  ledger = 100,
): ContractEvent => {
  const { campaign_id, beneficiary, amount } = makeClaimedEventData(overrides);
  return makeEvent(
    id,
    "claimed",
    [campaign_id, beneficiary, amount, overrides?.accepted_token ?? NATIVE_TOKEN_ADDRESS],
    ledger,
  );
};

/** `AutoClaimedEvent { campaign_id, total_raised, beneficiary }`. */
export const makeAutoClaimedEvent = (
  id: string,
  overrides?: { campaign_id?: bigint; total_raised?: bigint; beneficiary?: string },
  ledger = 100,
): ContractEvent =>
  makeEvent(
    id,
    "autoclaimed",
    {
      campaign_id: 1n,
      total_raised: 100_000_000n,
      beneficiary: WALLET_ADDRESS,
      ...overrides,
    },
    ledger,
  );

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
