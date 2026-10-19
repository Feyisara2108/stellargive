import { CampaignDetailSkeleton } from "@/components/CampaignSkeleton";

/**
 * Shown while the server page reads the campaign over RPC, so navigating to a
 * campaign shows its skeleton immediately instead of a frozen previous page.
 */
export default function CampaignLoading() {
  return <CampaignDetailSkeleton />;
}
