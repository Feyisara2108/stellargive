"use client";

import { Campaign, fromStroops } from "@/lib/soroban";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
const DonateModal = dynamic(
  () => import("@/components/DonateModal").then((mod) => mod.DonateModal),
  { ssr: false },
);
import { ClaimButton } from "@/components/ClaimButton";
import { Calendar, Target, TrendingUp, Image as ImageIcon } from "lucide-react";
import { ShareButton } from "@/components/ShareButton";
import { AddressLink } from "@/components/AddressLink";
import { RelativeTime } from "@/components/RelativeTime";
import { CampaignStatusBadge } from "@/components/CampaignStatusBadge";

function calculateProgress(raised: bigint, target: bigint): number {
  if (target === 0n) return 0;
  // Scale by 10_000 before dividing to preserve two decimal places of precision
  // without floating-point conversion until the very end.
  const scaled = (raised * 10_000n) / target;
  return Math.min(Number(scaled) / 100, 100);
}

function getCampaignImageUrl(uri?: string) {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) {
    return uri.replace("ipfs://", "https://ipfs.io/ipfs/");
  }
  if (uri.startsWith("https://")) {
    return uri;
  }
  return null;
}

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const [imgError, setImgError] = useState(false);
  const raised = Number(fromStroops(campaign.raised_amount));
  const target = Number(fromStroops(campaign.target_amount));
  const progress = calculateProgress(campaign.raised_amount, campaign.target_amount);
  const progressColor =
    progress >= 100 ? "bg-green-500" : progress >= 50 ? "bg-yellow-500" : "bg-blue-500";

  const isExpired = campaign.status === "Expired";
  const isFunded = campaign.status === "Funded";
  const isClaimed = campaign.status === "Claimed";
  const deadlineDate = new Date(Number(campaign.deadline) * 1000);

  return (
    <Card className="flex flex-col group hover:border-primary/50 transition-all duration-300 overflow-hidden">
      <div className="relative aspect-video w-full bg-muted flex items-center justify-center overflow-hidden">
        {getCampaignImageUrl(campaign.metadata_uri) && !imgError ? (
          <img
            src={getCampaignImageUrl(campaign.metadata_uri)}
            alt={campaign.title}
            loading="lazy"
            className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
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
        <div className="flex justify-between items-start mb-2">
          <CampaignStatusBadge status={campaign.status} deadline={campaign.deadline} />
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
            <span className="font-bold">{raised} XLM</span>
          </div>
          <Progress
            value={progress}
            className="h-2"
            indicatorClassName={progressColor}
            aria-label={`Fundraising progress for ${campaign.title}`}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.toFixed(1)}%</span>
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3" /> Target: {target} XLM
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
      <CardFooter className="gap-2">
        {campaign.status === "Active" && <DonateModal campaign={campaign} />}
        <ClaimButton campaign={campaign} />
        <div className="ml-auto">
          <ShareButton campaign={campaign} />
        </div>
      </CardFooter>
    </Card>
  );
}
