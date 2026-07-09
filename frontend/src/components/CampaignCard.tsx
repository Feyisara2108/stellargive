/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import Image from "next/image";
import { Campaign } from "@/lib/soroban";
import { formatTokenAmount } from "@/utils/format";
import { useTokenMetadata } from "@/hooks/useSoroban";
import { calculateProgress, getCampaignImageUrl } from "@/lib/utils";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress, type ProgressVariant } from "@/components/ui/progress";
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

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const [imgError, setImgError] = useState(false);
  const { data: tokenMeta } = useTokenMetadata(campaign.accepted_token);
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

  const gap = Math.max(0, target - raised);
  const showFundTheGap =
    campaign.status === "Active" && progress >= 90 && progress < 100 && gap > 0;

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
            blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzAwIiBoZWlnaHQ9IjQ3NSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNzAwIiBoZWlnaHQ9IjQ3NSIgZmlsbD0iI2UwZTBlMCIvPjwvc3ZnPg=="
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
            <ImageIcon className="w-8 h-8 opacity-20" />
            <span className="text-[10px] uppercase tracking-widest opacity-40">No Image</span>
          </div>
        )}
      </div>
      <CardHeader>
        <div className="flex justify-between items-center gap-2 mb-2">
          <CampaignStatusBadge status={campaign.status} deadline={campaign.deadline} />
          <Badge variant="secondary" className="capitalize text-[10px] font-bold px-2 py-1">
            {campaign.category && campaign.category !== "other" ? campaign.category : "Uncategorized"}
          </Badge>
        </div>
        <CardTitle className="line-clamp-1 group-hover:text-primary transition-colors">
          {campaign.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Raised
            </span>
            <span className="font-bold">
              {raised} {symbol}
            </span>
          </div>
          <Progress
            value={progress}
            className="h-2"
            variant={progressVariant}
            aria-label={`Fundraising progress for ${campaign.title}`}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.toFixed(1)}%</span>
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3" /> Target: {target} {symbol}
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
            <span>Only {gap.toFixed(2)} XLM left — fund the gap!</span>
          </div>
          <button
            onClick={() => setDonateOpen(true)}
            className="shrink-0 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
            aria-label={`Quick donate to fund the remaining ${gap.toFixed(2)} XLM`}
          >
            Donate
          </button>
        </div>
      )}
      <CardFooter className="gap-2">
        {campaign.status === "Active" && (
          <DonateModal campaign={campaign} open={donateOpen} onOpenChange={setDonateOpen} />
        )}
        <ClaimButton campaign={campaign} />
        <div className="ml-auto">
          <ShareButton campaign={campaign} />
        </div>
      </CardFooter>
    </Card>
  );
}
