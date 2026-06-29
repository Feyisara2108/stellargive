import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampaign, fromStroops } from "@/lib/soroban";
import { formatBasisPoints } from "@/utils/format";
import { CampaignDetailsClient } from "./CampaignDetailsClient";

type Props = { params: { id: string } };

function getImageUrl(metadataUri?: string) {
  if (!metadataUri) return undefined;
  if (metadataUri.startsWith("ipfs://")) {
    return metadataUri.replace("ipfs://", "https://ipfs.io/ipfs/");
  }
  return metadataUri;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const defaultTitle = "StellarGive | Relief Grant Platform";
  const defaultDescription = "A decentralized donation platform built on Stellar.";

  const fallback: Metadata = {
    title: `Campaign #${params.id} | StellarGive`,
    description: defaultDescription,
    openGraph: {
      title: `Campaign #${params.id} | StellarGive`,
      description: defaultDescription,
      type: "website",
      siteName: "StellarGive",
    },
    twitter: {
      card: "summary",
      title: `Campaign #${params.id} | StellarGive`,
      description: defaultDescription,
    },
  };

  try {
    const campaign = await getCampaign(BigInt(params.id));
    const numBens = campaign.beneficiaries?.length ?? 1;
    const benDesc =
      numBens > 1
        ? `${numBens} beneficiaries with shares: ${campaign.beneficiaries
            .map((b) => formatBasisPoints(b.share))
            .join(", ")}. `
        : "";
    const title = `${campaign.title} | StellarGive`;
    const description = `${campaign.title} — ${fromStroops(
      campaign.raised_amount,
    )} of ${fromStroops(campaign.target_amount)} XLM raised. ${benDesc}Support this campaign on StellarGive.`;

    const imageUrl = getImageUrl(campaign.metadata_uri);

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        siteName: "StellarGive",
        ...(imageUrl && { images: [{ url: imageUrl }] }),
      },
      twitter: {
        card: imageUrl ? "summary_large_image" : "summary",
        title,
        description,
        ...(imageUrl && { images: [imageUrl] }),
      },
    };
  } catch {
    return fallback;
  }
}

export default async function CampaignPage({ params }: Props) {
  try {
    await getCampaign(BigInt(params.id));
  } catch {
    notFound();
  }
  return <CampaignDetailsClient params={params} />;
}
