export type NativeCampaignStatus =
  | "Active"
  | "Funded"
  | "Claimed"
  | "Expired"
  | "Cancelled";

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
  status: NativeCampaignStatus;
  website?: string;
  twitter?: string;
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
    typeof campaign.status === "string"
  );
}

export function isNativeCampaignUpdate(value: unknown): value is NativeCampaignUpdate {
  if (!value || typeof value !== "object") return false;
  const update = value as Partial<NativeCampaignUpdate>;
  return typeof update.content === "string" && typeof update.timestamp === "bigint";
}
