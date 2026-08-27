/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Campaign } from "@/lib/soroban";
import { formatTokenAmount, formatUSD } from "@/utils/format";
import { useTokenMetadata, useXlmPrice } from "@/hooks/useSoroban";
import { calculateProgress, getCampaignImageUrl, CAMPAIGN_IMAGE_BLUR_DATA_URL } from "@/lib/utils";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress, type ProgressVariant } from "@/components/ui/progress";
import Link from "next/link";
import dynamic from "next/dynamic";
const DonateModal = dynamic(
  () => import("@/components/DonateModal").then((mod) => mod.DonateModal),
  { ssr: false },
);
import { ClaimButton } from "@/components/ClaimButton";
import { Calendar, Target, TrendingUp, Image as ImageIcon, Zap } from "lucide-react";
import { ShareButton } from "@/components/ShareButton";
import { AddressLink } from "@/components/AddressLink";
import { RelativeTime } from "@/components/RelativeTime";
import { CampaignStatusBadge } from "@/components/CampaignStatusBadge";
import { Badge } from "@/components/ui/badge";

const progressIndicatorVariants: Record<ProgressVariant, string> = {
  default: "bg-primary",
  success: "bg-emerald-600 dark:bg-emerald-400",
  warning: "bg-amber-500 dark:bg-amber-400",
};

function CampaignCardComponent({
  campaign,
  preloadedTokenMeta,
  detailHrefSearch,
}: {
  campaign: Campaign;
  preloadedTokenMeta?: any;
  detailHrefSearch?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const [donateAmount, setDonateAmount] = useState<string | undefined>(undefined);
  const [showUSD, setShowUSD] = useState(false);
  const { data: xlmPrice } = useXlmPrice();
  const { data: fetchedMeta } = useTokenMetadata(
    preloadedTokenMeta ? null : campaign.accepted_token,
  );
  const tokenMeta = preloadedTokenMeta ?? fetchedMeta;
  const decimals = tokenMeta?.decimals ?? 7;
  const symbol = tokenMeta?.symbol ?? "XLM";

  const raised = formatTokenAmount(campaign.raised_amount, decimals);
  const target = formatTokenAmount(campaign.target_amount, decimals);
  const progress = calculateProgress(campaign.raised_amount, campaign.target_amount);
  const progressVariant: ProgressVariant =
    progress >= 100 ? "success" : progress >= 50 ? "warning" : "default";

  const isExpired = campaign.status === "Expired";
  const isFunded = campaign.status === "Funded";
  const isClaimed = campaign.status === "Claimed";
  const deadlineDate = new Date(Number(campaign.deadline) * 1000);

  const gapRaw =
    campaign.target_amount > campaign.raised_amount
      ? campaign.target_amount - campaign.raised_amount
      : 0n;
  const gap = Number(gapRaw) / 10 ** decimals;
  const showFundTheGap =
    campaign.status === "Active" && progress >= 90 && progress < 100 && gap > 0;
  const detailHref = detailHrefSearch
    ? `/campaign/${campaign.id.toString()}?${detailHrefSearch}`
    : `/campaign/${campaign.id.toString()}`;

  return (
    <Card className="flex flex-col group hover:border-primary/50 transition-all duration-300 overflow-hidden">
      <div className="relative aspect-video w-full bg-muted flex items-center justify-center overflow-hidden">
        {getCampaignImageUrl(campaign.metadata_uri) && !imgError ? (
          <Image
            src={getCampaignImageUrl(campaign.metadata_uri)!}
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
          <Link
            href={detailHref}
            className="hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm p-1 -m-1"
          >
            {campaign.title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Raised
            </span>
            <div className="flex items-center gap-2">
              <span className="font-bold">
                {showUSD && xlmPrice !== null && xlmPrice !== undefined
                  ? formatUSD(Number(raised) * xlmPrice)
                  : `${raised} ${symbol}`}
              </span>
              {xlmPrice !== null && xlmPrice !== undefined && (
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
            <span>{progress.toFixed(1)}%</span>
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3" /> Target:{" "}
              {showUSD && xlmPrice !== null && xlmPrice !== undefined
                ? formatUSD(Number(target) * xlmPrice)
                : `${target} ${symbol}`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
          <Calendar className="w-3 h-3" />
          <span>
            {isExpired ? "Ended " : "Ends "}
            <RelativeTime date={deadlineDate} />
          </span>
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
      </CardContent>
      {showFundTheGap && (
        <div className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Zap className="h-3 w-3 shrink-0" />
            <span>
              Only {gap.toFixed(2)} {symbol} left — fund the gap!
            </span>
          </div>
          <button
            onClick={() => {
              setDonateAmount(gap.toFixed(decimals).replace(/\.?0+$/, ""));
              setDonateOpen(true);
            }}
            className="shrink-0 rounded-md bg-emerald-600 px-3 py-2 min-h-[44px] text-xs font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-emerald-900"
            aria-label={`Quick donate to fund the remaining ${gap.toFixed(2)} ${symbol}`}
          >
            Donate
          </button>
        </div>
      )}
      <CardFooter className="gap-2">
        {campaign.status === "Active" && (
          <DonateModal
            campaign={campaign}
            open={donateOpen}
            onOpenChange={setDonateOpen}
            suggestedAmount={donateAmount}
          />
        )}
        <ClaimButton campaign={campaign} />
        <div className="ml-auto">
          <ShareButton campaign={campaign} />
        </div>
      </CardFooter>
    </Card>
  );
}

export const CampaignCard = React.memo(CampaignCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.campaign.id === nextProps.campaign.id &&
    prevProps.campaign.status === nextProps.campaign.status &&
    prevProps.campaign.raised_amount === nextProps.campaign.raised_amount &&
    prevProps.detailHrefSearch === nextProps.detailHrefSearch
  );
});
