"use client";

import { usePlatformStats } from "@/hooks/useSoroban";
import { fromStroops } from "@/lib/soroban";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { AlertCircle, Flame, RotateCw, TrendingUp, Users } from "lucide-react";

export function PlatformStats() {
  const { data: stats, isLoading, isError, refetch, isFetching } = usePlatformStats();

  if (isLoading) {
    return (
      <div
        className="flex flex-wrap items-center justify-center gap-8 pt-6 min-h-[3.5rem]"
        aria-busy="true"
        aria-live="polite"
      >
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div
        className="flex flex-wrap items-center justify-center gap-3 pt-6 min-h-[3.5rem] text-sm"
        role="status"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="w-4 h-4 text-destructive" aria-hidden="true" />
          Couldn&apos;t load platform stats.
        </span>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RotateCw
            className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {isFetching ? "Retrying..." : "Retry"}
        </Button>
      </div>
    );
  }

  const totalCampaigns = Number(stats.totalCampaigns ?? 0);

  if (totalCampaigns === 0) {
    return (
      <div className="flex items-center justify-center pt-6 min-h-[3.5rem]" role="status">
        <p className="text-sm text-muted-foreground">
          No campaigns yet — be the first to start one.
        </p>
      </div>
    );
  }

  const totalRaised = fromStroops(BigInt(stats.totalRaised));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-6" role="status">
      <StatCard
        icon={<Users className="h-4 w-4 text-primary" />}
        title="Total Campaigns"
        value={totalCampaigns.toString()}
      />
      <StatCard
        icon={<TrendingUp className="h-4 w-4 text-primary" />}
        title="Total Raised"
        value={`${Number(totalRaised).toLocaleString()} XLM`}
      />
      <StatCard
        icon={<Flame className="h-4 w-4 text-primary" />}
        title="Active Campaigns"
        value={(stats.activeCampaigns ?? 0).toString()}
      />
    </div>
  );
}
