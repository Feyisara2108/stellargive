"use client";

import { usePlatformStats } from "@/hooks/useSoroban";
import { fromStroops } from "@/lib/soroban";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Users, Flame } from "lucide-react";

export function PlatformStats() {
  const { data: stats, isLoading } = usePlatformStats();

  if (isLoading) {
    return (
      <div className="flex justify-center gap-8 pt-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
    );
  }

  const totalRaised = stats ? fromStroops(BigInt(stats.totalRaised)) : "0";

  return (
    <div className="flex flex-wrap justify-center gap-8 pt-6 text-sm">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-primary" />
        <span className="font-semibold">{stats?.totalCampaigns ?? 0}</span>
        <span className="text-muted-foreground">Total Campaigns</span>
      </div>
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" />
        <span className="font-semibold">{Number(totalRaised).toLocaleString()} XLM</span>
        <span className="text-muted-foreground">Total Raised</span>
      </div>
      <div className="flex items-center gap-2">
        <Flame className="w-4 h-4 text-primary" />
        <span className="font-semibold">{stats?.activeCampaigns ?? 0}</span>
        <span className="text-muted-foreground">Active Campaigns</span>
      </div>
    </div>
  );
}
