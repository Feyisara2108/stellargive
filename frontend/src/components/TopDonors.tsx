"use client";

import { useTopDonors } from "@/hooks/useSoroban";
import { AddressLink } from "@/components/AddressLink";
import { Skeleton } from "@/components/ui/skeleton";
import { ZERO_ADDRESS, formatTokenAmount } from "@/utils/format";

/**
 * Top-5 donor leaderboard for a campaign, read from the contract's
 * `get_top_donors`. Anonymous donations are aggregated on-chain under the zero
 * address, so that entry is labelled "Anonymous" instead of being linked.
 */
export function TopDonors({
  campaignId,
  decimals = 7,
  symbol = "XLM",
}: {
  campaignId: bigint;
  decimals?: number;
  symbol?: string;
}) {
  const { data: topDonors, isLoading, isError } = useTopDonors(campaignId);

  return (
    <div className="space-y-4 pt-6 border-t mt-6">
      <h3 className="text-lg font-bold">Top Donors</h3>
      {isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading top donors">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-muted-foreground">
          Couldn&apos;t load top donors right now.
        </p>
      ) : topDonors && topDonors.length > 0 ? (
        <ol className="space-y-3">
          {topDonors.map(({ address, amount }, index) => (
            <li
              key={address}
              className="flex justify-between items-center bg-card p-3 rounded-lg border shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs font-bold">
                  {index + 1}
                </span>
                {address === ZERO_ADDRESS ? (
                  <span className="text-sm font-medium text-muted-foreground">Anonymous</span>
                ) : (
                  <AddressLink address={address} />
                )}
              </div>
              <span className="font-bold text-primary">
                {formatTokenAmount(amount, decimals)} {symbol}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div
          role="status"
          aria-live="polite"
          className="text-center py-8 text-muted-foreground space-y-1 bg-muted/20 rounded-lg border border-dashed"
        >
          <p className="text-sm font-medium">No donations yet</p>
        </div>
      )}
    </div>
  );
}
