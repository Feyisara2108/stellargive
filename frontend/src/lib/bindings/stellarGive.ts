export type NativeCampaignStatus = "Active" | "Funded" | "Claimed" | "Expired" | "Cancelled";

const CAMPAIGN_STATUSES: readonly NativeCampaignStatus[] = [
  "Active",
  "Funded",
  "Claimed",
  "Expired",
  "Cancelled",
];

/**
 * Reads a campaign status out of whatever `scValToNative` produced for it.
 *
 * The contract's `CampaignStatus` is a unit-variant `#[contracttype]` enum, which Soroban stores
 * as a vec holding one symbol, so a live campaign decodes to `["Active"]`. A bare `"Active"` and
 * an `{ Active: null }` map are accepted too, for fixtures and mocks that use those shapes.
 * Anything that is not one of the five known statuses returns `null`.
 */
export function parseCampaignStatus(value: unknown): NativeCampaignStatus | null {
  let name: unknown = value;
  if (Array.isArray(value)) name = value[0];
  else if (value && typeof value === "object") name = Object.keys(value)[0];
  return CAMPAIGN_STATUSES.find((status) => status === name) ?? null;
}

export interface NativeCampaign {
  id: bigint;
  creator: string;
  beneficiaries: Array<[string, number]>;
  title: string;
  description: string;
  metadata_uri: string;
  category: string | symbol;
  target_amount: bigint;
  raised_amount: bigint;
  deadline: bigint;
  accepted_token: string;
  /** The raw decoded enum; read it with `parseCampaignStatus`. */
  status: unknown;
  website?: string;
  twitter?: string;
  max_per_donor?: bigint | null;
}

export interface NativeCampaignUpdate {
  content: string;
  timestamp: bigint;
}

export function isNativeCampaign(value: unknown): value is NativeCampaign {
  if (!value || typeof value !== "object") return false;
  const campaign = value as Partial<NativeCampaign>;
  return (
    typeof campaign.id === "bigint" &&
    typeof campaign.creator === "string" &&
    Array.isArray(campaign.beneficiaries) &&
    typeof campaign.title === "string" &&
    typeof campaign.description === "string" &&
    typeof campaign.target_amount === "bigint" &&
    typeof campaign.raised_amount === "bigint" &&
    typeof campaign.deadline === "bigint" &&
    typeof campaign.accepted_token === "string" &&
    parseCampaignStatus(campaign.status) !== null
  );
}

export function isNativeCampaignUpdate(value: unknown): value is NativeCampaignUpdate {
  if (!value || typeof value !== "object") return false;
  const update = value as Partial<NativeCampaignUpdate>;
  return typeof update.content === "string" && typeof update.timestamp === "bigint";
}
