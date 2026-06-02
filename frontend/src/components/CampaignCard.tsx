"use client";

import { Campaign, fromStroops } from "@/lib/soroban";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
const DonateModal = dynamic(() => import("@/components/DonateModal").then(mod => mod.DonateModal), { ssr: false });
import { ClaimButton } from "@/components/ClaimButton";
import { Calendar, Target, TrendingUp } from "lucide-react";
import { ShareButton } from "@/components/ShareButton";
import { AddressLink } from "@/components/AddressLink";
import { RelativeTime } from "@/components/RelativeTime";

function calculateProgress(raised: bigint, target: bigint): number {
  if (target === 0n) return 0;
  // Scale by 10_000 before dividing to preserve two decimal places of precision
  // without floating-point conversion until the very end.
  const scaled = (raised * 10_000n) / target;
  return Math.min(Number(scaled) / 100, 100);
}

export function CampaignCard({ campaign }: { campaign: Campaign }) {
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
    <Card className="flex flex-col group hover:border-primary/50 transition-all duration-300">
      <CardHeader>
        <div className="flex justify-between items-start mb-2">
          <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
            campaign.status === 'Active' ? 'bg-green-500/20 text-green-500' :
            campaign.status === 'Funded' ? 'bg-blue-500/20 text-blue-500' :
            'bg-muted text-muted-foreground'
          }`}>
            {campaign.status}
          </div>
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
        {campaign.status === "Active" && (
          <DonateModal campaign={campaign} />
        )}
        <ClaimButton campaign={campaign} />
        <div className="ml-auto">
          <ShareButton campaign={campaign} />
        </div>
      </CardFooter>
    </Card>
  );
}
