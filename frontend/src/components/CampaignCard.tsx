"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { Campaign, TokenMetadata } from "@/lib/soroban";
import { formatTokenAmount, formatUSD } from "@/utils/format";
import { useTokenMetadata, useXlmPrice } from "@/hooks/useSoroban";
import {
  calculateProgress,
  calculateProgressPercent,
  getCampaignImageUrl,
  CAMPAIGN_IMAGE_BLUR_DATA_URL,
} from "@/lib/utils";
import { NATIVE_XLM_CONTRACT_ID } from "@/lib/tokens";
import { calculateProgress, getCampaignImageUrl, CAMPAIGN_IMAGE_BLUR_DATA_URL } from "@/lib/utils";
import { isOptimizableImageUrl } from "../../image-hosts.mjs";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Progress,
  progressIndicatorVariants,
  type ProgressVariant,
} from "@/components/ui/progress";
import Link from "next/link";
import dynamic from "next/dynamic";
const DonateModal = dynamic(
  () => import("@/components/DonateModal").then((mod) => mod.DonateModal),
  { ssr: false },
);
import { ClaimButton } from "@/components/ClaimButton";
import {
  Calendar,
  Target,
  TrendingUp,
  Image as ImageIcon,
  Ban,
  Flame,
  Tag,
} from "lucide-react";
import { ShareButton } from "@/components/ShareButton";
import { BookmarkButton } from "@/components/BookmarkButton";
import { AddressLink } from "@/components/AddressLink";
import { RelativeTime } from "@/components/RelativeTime";
import { CampaignStatusBadge } from "@/components/CampaignStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FundTheGap } from "@/components/FundTheGap";

const HOUR_SECONDS = 60 * 60;

export type DeadlineUrgency = "normal" | "soon" | "critical";

/**
 * Urgency of an active campaign's deadline: amber under 48h, red under 6h.
 * `endingSoon` is true within 24h of the deadline. Past deadlines are "normal".
 */
export function getDeadlineUrgency(
  deadlineSeconds: number,
  nowMs: number = Date.now(),
): { urgency: DeadlineUrgency; endingSoon: boolean } {
  const secondsLeft = deadlineSeconds - nowMs / 1000;
  if (secondsLeft <= 0) return { urgency: "normal", endingSoon: false };
  return {
    urgency:
      secondsLeft < 6 * HOUR_SECONDS
        ? "critical"
        : secondsLeft < 48 * HOUR_SECONDS
          ? "soon"
          : "normal",
    endingSoon: secondsLeft < 24 * HOUR_SECONDS,
  };
}

// Text colors chosen for WCAG AA (>= 4.5:1) on the card background in both themes.
const URGENCY_TEXT_CLASS: Record<DeadlineUrgency, string> = {
  normal: "",
  soon: "text-amber-700 dark:text-amber-400 font-medium",
  critical: "text-red-700 dark:text-red-400 font-semibold",
};

const PREFETCH_DEBOUNCE_MS = 150;

export type CampaignHighlightLabel = "Near Goal" | "Trending";

function CampaignCardComponent({
  campaign,
  preloadedTokenMeta,
  detailHrefSearch,
  highlightLabel,
  /** When true the card renders in a lightweight preview mode: no router
   *  prefetch, no donate/claim actions, no bookmark/share buttons. */
  isPreview = false,
}: {
  campaign: Campaign;
  preloadedTokenMeta?: TokenMetadata;
  detailHrefSearch?: string;
  /** Renders a small ribbon (e.g. from a homepage highlight reel) over the image. */
  highlightLabel?: CampaignHighlightLabel;
  isPreview?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const [donateAmount, setDonateAmount] = useState<string | undefined>(undefined);
  const [showUSD, setShowUSD] = useState(false);
  // Hooks are always called but results are discarded in preview mode.
  const router = useRouter();
  const queryClient = useQueryClient();
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const campaignId = campaign.id.toString();
  const detailHref = detailHrefSearch
    ? `/campaign/${campaign.id.toString()}?${detailHrefSearch}`
    : `/campaign/${campaign.id.toString()}`;

  // Prefetch campaign route and data on hover/focus (#834) — skipped in preview.
  const prefetchCampaign = useCallback(() => {
    if (isPreview) return;
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
    }
    prefetchTimerRef.current = setTimeout(() => {
      router.prefetch(detailHref);
      queryClient.prefetchQuery({
        queryKey: ["campaign", campaignId],
        queryFn: async () => (await import("@/lib/soroban")).getCampaign(campaign.id),
        staleTime: 30_000,
      });
    }, PREFETCH_DEBOUNCE_MS);
  }, [isPreview, router, queryClient, detailHref, campaignId, campaign.id]);

  const cancelPrefetch = useCallback(() => {
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
  }, []);
  const { data: xlmPrice } = useXlmPrice();
  const { data: fetchedMeta, isLoading: isMetaLoading } = useTokenMetadata(
    preloadedTokenMeta ? null : campaign.accepted_token,
  );
  const tokenMeta = preloadedTokenMeta ?? fetchedMeta;
  const isMetaPending = tokenMeta == null && isMetaLoading;
  const decimals = tokenMeta?.decimals ?? 7;
  const symbol = tokenMeta?.symbol ?? "XLM";
  const isNativeXlm = campaign.accepted_token === NATIVE_XLM_CONTRACT_ID;

  // Reset to the token's native unit whenever the card switches to a
  // different accepted token, so a stale USD view never carries over.
  useEffect(() => {
    setShowUSD(false);
  }, [campaign.accepted_token]);

  const raised = isMetaPending ? null : formatTokenAmount(campaign.raised_amount, decimals);
  const target = isMetaPending ? null : formatTokenAmount(campaign.target_amount, decimals);
  const canToggleUsd =
    isNativeXlm && !isMetaPending && !isPreview && xlmPrice !== null && xlmPrice !== undefined;
  const raisedUsd =
    canToggleUsd && xlmPrice !== null && xlmPrice !== undefined
      ? (Number(campaign.raised_amount) / 10 ** decimals) * xlmPrice
      : null;
  const targetUsd =
    canToggleUsd && xlmPrice !== null && xlmPrice !== undefined
      ? (Number(campaign.target_amount) / 10 ** decimals) * xlmPrice
      : null;
  const progress = calculateProgress(campaign.raised_amount, campaign.target_amount);
  const progressPercent = calculateProgressPercent(campaign.raised_amount, campaign.target_amount);
  const progressVariant: ProgressVariant =
    progress >= 100 ? "success" : progress >= 50 ? "warning" : "default";

  const isExpired = campaign.status === "Expired";
  const deadlineDate = new Date(Number(campaign.deadline) * 1000);
  const { urgency, endingSoon } =
    campaign.status === "Active"
      ? getDeadlineUrgency(Number(campaign.deadline))
      : { urgency: "normal" as DeadlineUrgency, endingSoon: false };

  const gapRaw =
    campaign.target_amount > campaign.raised_amount
      ? campaign.target_amount - campaign.raised_amount
      : 0n;
  const showFundTheGap =
    !isPreview &&
    !isMetaPending &&
    campaign.status === "Active" &&
    progress >= 90 &&
    progress < 100 &&
    gapRaw > 0n;

  return (
    <Card
      className={`flex flex-col group hover:border-primary/50 transition-all duration-300 overflow-hidden${
        isExpired ? " grayscale opacity-90" : ""
      }${isPreview ? " pointer-events-none select-none" : ""}`}
      onMouseEnter={prefetchCampaign}
      onFocus={prefetchCampaign}
      onMouseLeave={cancelPrefetch}
      onBlur={cancelPrefetch}
    >
      <div className="relative aspect-video w-full bg-muted flex items-center justify-center overflow-hidden">
        {getCampaignImageUrl(campaign.metadata_uri) && !imgError ? (
          <Image
            src={getCampaignImageUrl(campaign.metadata_uri)!}
            unoptimized={!isOptimizableImageUrl(getCampaignImageUrl(campaign.metadata_uri)!)}
            alt={campaign.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            loading="lazy"
            placeholder="blur"
            blurDataURL={CAMPAIGN_IMAGE_BLUR_DATA_URL}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
            <ImageIcon className="w-8 h-8 opacity-40" />
            <span className="text-[10px] uppercase tracking-widest">No Image</span>
          </div>
        )}
        {isExpired && (
          <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur-sm">
            <Ban className="h-3 w-3" aria-hidden="true" />
            Campaign expired
          </span>
        )}
        {highlightLabel && (
          <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
            {highlightLabel === "Trending" ? (
              <Flame className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Target className="h-3 w-3" aria-hidden="true" />
            )}
            {highlightLabel}
          </span>
        )}
        {isPreview && (
          <span className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur-sm">
            Preview
          </span>
        )}
      </div>
      <CardHeader>
        <div className="flex justify-between items-center gap-2 mb-2">
          <CampaignStatusBadge
            status={campaign.status}
            deadline={campaign.deadline}
            raisedAmount={campaign.raised_amount}
            targetAmount={campaign.target_amount}
          />
          <Badge variant="secondary" className="capitalize text-[10px] font-bold px-2 py-1">
            {campaign.category && campaign.category !== "other"
              ? campaign.category
              : "Uncategorized"}
          </Badge>
        </div>
        <CardTitle className="line-clamp-1 transition-colors">
          {isPreview ? (
            <span>{campaign.title || "Campaign Title"}</span>
          ) : (
            <Link
              href={detailHref}
              className="hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm p-1 -m-1"
            >
              {campaign.title}
            </Link>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Raised
            </span>
            <div className="flex items-center gap-2">
              {raised === null ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <span className="font-bold">
                  {canToggleUsd && showUSD && raisedUsd !== null
                    ? formatUSD(raisedUsd)
                    : `${raised} ${symbol}`}
                </span>
              )}
              {canToggleUsd && (
                <button
                  type="button"
                  onClick={() => setShowUSD(!showUSD)}
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-muted-foreground/30 hover:bg-muted text-muted-foreground transition-colors"
                  title="Toggle currency display"
                  aria-label={`Switch display to ${showUSD ? "XLM" : "USD"}`}
                >
                  {showUSD ? "XLM" : "USD"}
                </button>
              )}
            </div>
          </div>
          <Progress
            value={progress}
            className="h-2"
            indicatorClassName={progressIndicatorVariants[progressVariant]}
            aria-label={`Fundraising progress for ${campaign.title}`}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progressPercent.toFixed(1)}%</span>
            <div className="flex items-center gap-1">
              <Target className="w-3 h-3" /> Target:{" "}
              {target === null ? (
                <Skeleton className="h-3 w-16" />
              ) : canToggleUsd && showUSD && targetUsd !== null ? (
                formatUSD(targetUsd)
              ) : (
                `${target} ${symbol}`
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
          <Calendar className="w-3 h-3" />
          <span className={URGENCY_TEXT_CLASS[urgency]} data-urgency={urgency}>
            {isExpired ? "Ended " : "Ends "}
            <RelativeTime date={deadlineDate} />
          </span>
          {endingSoon && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-800 dark:bg-red-950 dark:text-red-200">
              Ending soon
            </span>
          )}
        </div>
        <div className="space-y-1.5 pt-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>Creator</span>
            <AddressLink address={campaign.creator} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Beneficiary</span>
            <AddressLink address={campaign.beneficiary} />
          </div>
        </div>

        {/* Tags */}
        {campaign.tags && campaign.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Campaign tags">
            {campaign.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary"
              >
                <Tag className="h-2.5 w-2.5" aria-hidden="true" />
                {tag}
              </span>
            ))}
          </div>
        )}
      </CardContent>
      {showFundTheGap && (
        <FundTheGap
          remaining={gapRaw}
          decimals={decimals}
          symbol={symbol}
          className="mx-4 mb-3"
          onDonate={(amount) => {
            setDonateAmount(amount);
            setDonateOpen(true);
          }}
        />
      )}
      {!isPreview && (
        <CardFooter className="gap-2">
          {/* Renders nothing for non-Active campaigns except a pending success dialog. */}
          <DonateModal
            campaign={campaign}
            open={donateOpen}
            onOpenChange={setDonateOpen}
            suggestedAmount={donateAmount}
          />
          <ClaimButton campaign={campaign} />
          <div className="ml-auto flex items-center gap-2">
            <BookmarkButton campaignId={campaign.id} title={campaign.title} />
            <ShareButton campaign={campaign} />
          </div>
        </CardFooter>
      )}
    </Card>
  );
}

function tagsEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((tag, i) => tag === b[i]);
}

function tokenMetaEqual(a: TokenMetadata | undefined, b: TokenMetadata | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.symbol === b.symbol && a.decimals === b.decimals && a.name === b.name;
}

export const CampaignCard = React.memo(CampaignCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.campaign.id === nextProps.campaign.id &&
    prevProps.campaign.status === nextProps.campaign.status &&
    prevProps.campaign.raised_amount === nextProps.campaign.raised_amount &&
    prevProps.campaign.target_amount === nextProps.campaign.target_amount &&
    prevProps.campaign.deadline === nextProps.campaign.deadline &&
    prevProps.campaign.title === nextProps.campaign.title &&
    prevProps.campaign.metadata_uri === nextProps.campaign.metadata_uri &&
    prevProps.campaign.category === nextProps.campaign.category &&
    prevProps.detailHrefSearch === nextProps.detailHrefSearch &&
    prevProps.highlightLabel === nextProps.highlightLabel &&
    prevProps.isPreview === nextProps.isPreview &&
    tokenMetaEqual(prevProps.preloadedTokenMeta, nextProps.preloadedTokenMeta) &&
    tagsEqual(prevProps.campaign.tags, nextProps.campaign.tags)
  );
});
