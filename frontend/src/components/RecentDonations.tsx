"use client";

import { useEvents } from "@/hooks/useSoroban";
import { fromStroops } from "@/lib/soroban";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, ArrowUpRight } from "lucide-react";
import { AddressLink } from "@/components/AddressLink";
import { RelativeTime } from "@/components/RelativeTime";

export function RecentDonations({ campaignId }: { campaignId: bigint }) {
  const { data: allEvents, isLoading, isError } = useEvents();

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Heart className="w-4 h-4 text-primary" /> Recent Donations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4" aria-busy="true" aria-label="Loading recent donations">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3 items-center">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2 w-1/4" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Heart className="w-4 h-4 text-primary" /> Recent Donations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-500 text-sm">
            Unable to load recent donations
          </div>
        </CardContent>
      </Card>
    );
  }

  // Filter for donations to this specific campaign, limit to 10
  // data: [campaign_id, donor, amount, raised_amount, accepted_token]
  const donations = allEvents
    ?.filter((e) => {
      try {
        return e.topic === "received" && e.data && e.data[0] && BigInt(e.data[0]) === campaignId;
      } catch {
        return false;
      }
    })
    .sort((a, b) => Number(b.ledger) - Number(a.ledger))
    .slice(0, 10);

  const normalizeDonorAddress = (donor: any): string | null => {
    if (!donor) return null;
    const str = donor.toString();
    if (str === "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF") {
      return null;
    }
    if (str.length === 56 && str.startsWith("G")) {
      return str;
    }
    return null;
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Heart className="w-4 h-4 text-primary fill-primary/20" /> Recent Donations
        </CardTitle>
        <span className="text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer">
          View All
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {donations && donations.length > 0 ? (
          <div className="space-y-4">
            {donations.map((event: any) => {
              const donorAddress = normalizeDonorAddress(event.data[1]);
              return (
                <div
                  key={event.id}
                  className="flex gap-3 items-center border-b last:border-0 pb-4 last:pb-0"
                >
                  <div className="p-2 rounded-full bg-green-500/10 shrink-0">
                    <ArrowUpRight className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      <span className="font-bold">{fromStroops(event.data[2])} XLM</span> donated by{" "}
                      {donorAddress ? (
                        <AddressLink address={donorAddress} className="text-muted-foreground" />
                      ) : (
                        <span className="font-medium text-muted-foreground">Anonymous</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {event.createdAt ? (
                        <RelativeTime
                          date={new Date(event.createdAt)}
                          fallback={`Ledger ${event.ledger}`}
                        />
                      ) : (
                        `Ledger ${event.ledger}`
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            role="status"
            aria-live="polite"
            className="text-center py-12 text-muted-foreground space-y-1 bg-muted/20 rounded-lg border border-dashed"
          >
            <p className="text-sm font-medium">No donations yet</p>
            <p className="text-xs">Be the first to support this campaign.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
