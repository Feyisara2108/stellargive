import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampaign, fromStroops } from "@/lib/soroban";
import { formatBasisPoints } from "@/utils/format";
import { CampaignDetailsClient } from "./CampaignDetailsClient";
import type { BreadcrumbItem } from "@/components/Breadcrumbs";

type Props = {
  params: { id: string };
};

type SearchParams = Record<string, string | string[] | undefined>;

function buildExploreHref(searchParams?: SearchParams) {
  if (!searchParams) return "/explore";

  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry) query.append(key, entry);
      });
    } else if (value) {
      query.set(key, value);
    }
  }

  const serialized = query.toString();
  return serialized ? `/explore?${serialized}` : "/explore";
}

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

  if (process.env.NEXT_PUBLIC_USE_MOCK_WALLET === "true") {
    return fallback;
  }

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

export default async function CampaignPage({
  params,
  searchParams,
}: Props & { searchParams?: SearchParams }) {
  let campaignTitle: string | undefined;

  try {
    const campaign = await getCampaign(BigInt(params.id));
    campaignTitle = campaign.title;
  } catch {
    if (process.env.NEXT_PUBLIC_USE_MOCK_WALLET !== "true") {
      notFound();
    }
  }

  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Explore", href: buildExploreHref(searchParams) },
    {
      label: campaignTitle || `Campaign #${params.id}`,
      href: `/campaign/${params.id}`,
    },
  ];

  return <CampaignDetailsClient params={params} breadcrumbs={breadcrumbs} />;
}
