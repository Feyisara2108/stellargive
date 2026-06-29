import type { Campaign, CampaignBeneficiary } from "@/lib/soroban";

/**
 * Shared test factories for generating mock data in frontend unit/integration tests.
 * Use these to avoid duplicating fixture definitions across test files.
 *
 * Available Factories:
 * - `makeCampaign`: Generates a standard Campaign object. You can override specific fields.
 * - `makeEvent`: Generates a generic Soroban event.
 * - `makeDonationEvent`: Generates a specific 'received' donation event.
 *
 * Mock Usage:
 * Import these factories into your test files and call them to build consistent data objects.
 * Combine these with `errorHandlers` from `@/mocks/setup` to test specific failure cases cleanly.
 */

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
