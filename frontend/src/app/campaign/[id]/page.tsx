import type { Metadata } from "next";
import { getCampaign, fromStroops } from "@/lib/soroban";
import { CampaignDetailsClient } from "./CampaignDetailsClient";

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const fallback: Metadata = {
    title: `Campaign #${params.id} | StellarGive`,
    description:
      "Support relief campaigns on StellarGive, a decentralized donation platform built on Stellar.",
  };

  try {
    const campaign = await getCampaign(BigInt(params.id));
    const title = `${campaign.title} | StellarGive`;
    const description = `${campaign.title} — ${fromStroops(
      campaign.raised_amount
    )} of ${fromStroops(campaign.target_amount)} XLM raised. Support this campaign on StellarGive.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        siteName: "StellarGive",
      },
      twitter: {
        card: "summary",
        title,
        description,
      },
    };
  } catch {
    // RPC unavailable or campaign not found — fall back to generic metadata
    // rather than failing the request.
    return fallback;
  }
}

export default function CampaignPage({ params }: Props) {
  return <CampaignDetailsClient params={params} />;
}
