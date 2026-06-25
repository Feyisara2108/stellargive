"use client";

import { useTopDonors } from "@/hooks/useSoroban";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AddressLink } from "@/components/AddressLink";
import { formatXLM } from "@/utils/format";
import { fromStroops } from "@/lib/soroban";
import { Trophy } from "lucide-react";

interface TopDonorsProps {
  campaignId: bigint;
  limit?: number;
}

export function TopDonors({ campaignId, limit = 10 }: TopDonorsProps) {
  const { data: donors, isLoading } = useTopDonors(campaignId, limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Top Donors
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : !donors || donors.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No donations yet. Be the first supporter!
          </p>
        ) : (
          <div className="space-y-4">
            {donors.map((donor, index) => (
              <div
                key={`${donor.address}-${index}`}
                className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                    {index + 1}
                  </div>
                  <AddressLink address={donor.address} />
                </div>
                <div className="font-medium">
                  {formatXLM(Number(fromStroops(donor.amount)))} XLM
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
