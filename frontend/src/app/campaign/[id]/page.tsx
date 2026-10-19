/// <reference types="react/canary" />
import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampaign, fromStroops, isCampaignNotFoundError } from "@/lib/soroban";
import type { Campaign } from "@/lib/soroban";
import { formatBasisPoints } from "@/utils/format";
import { getCampaignImageUrl } from "@/lib/utils";
import { CampaignDetailsClient } from "./CampaignDetailsClient";
import type { BreadcrumbItem } from "@/components/Breadcrumbs";

type Props = {
  params: Promise<{ id: string }>;
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function buildExploreHref(searchParams?: Record<string, string | string[] | undefined>) {
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

/** Campaign ids are u64s; anything else can't exist on-chain. */
function parseCampaignId(id: string): bigint | null {
  return /^\d+$/.test(id) ? BigInt(id) : null;
}

/**
 * generateMetadata and the page both need the campaign. `cache` dedupes the
 * read within a single server render, so a page view costs one RPC call.
 */
const loadCampaign = cache((id: bigint) => getCampaign(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const defaultTitle = "StellarGive | Relief Grant Platform";
  const defaultDescription = "A decentralized donation platform built on Stellar.";

  const fallback: Metadata = {
    title: `Campaign #${resolvedParams.id} | StellarGive`,
    description: defaultDescription,
    openGraph: {
      title: `Campaign #${resolvedParams.id} | StellarGive`,
      description: defaultDescription,
      type: "website",
      siteName: "StellarGive",
    },
    twitter: {
      card: "summary",
      title: `Campaign #${resolvedParams.id} | StellarGive`,
      description: defaultDescription,
    },
  };

  if (process.env.NEXT_PUBLIC_USE_MOCK_WALLET === "true") {
    return fallback;
  }

  try {
    const campaignId = parseCampaignId(resolvedParams.id);
    if (campaignId === null) return fallback;
    const campaign = await loadCampaign(campaignId);
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

    const imageUrl = getCampaignImageUrl(campaign.metadata_uri);

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
}: {
  params: Promise<{ id: string }>;
  searchParams?: SearchParams;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const isMockMode = process.env.NEXT_PUBLIC_USE_MOCK_WALLET === "true";
  let campaign: Campaign | undefined;

  const campaignId = parseCampaignId(resolvedParams.id);
  if (campaignId === null) {
    notFound();
  }

  try {
    campaign = await loadCampaign(campaignId);
  } catch (error) {
    // E2E runs mock the RPC in the browser, so the server-side read is expected to fail.
    if (!isMockMode) {
      // Only the contract saying the campaign doesn't exist is a 404. RPC / network
      // failures go to the error boundary (./error.tsx), which offers a retry,
      // instead of making a valid campaign look deleted.
      if (isCampaignNotFoundError(error)) {
        notFound();
      }
      throw error;
    }
  }

  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Explore", href: buildExploreHref(resolvedSearchParams) },
    {
      label: campaign?.title || `Campaign #${resolvedParams.id}`,
      href: `/campaign/${resolvedParams.id}`,
    },
  ];

  // Hand the server read to the client query as initial data so it doesn't
  // fetch the same campaign again on mount.
  return (
    <CampaignDetailsClient
      params={{ id: resolvedParams.id }}
      breadcrumbs={breadcrumbs}
      initialCampaign={campaign}
    />
  );
}
