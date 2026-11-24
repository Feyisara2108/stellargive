"use client";

import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTokenAmount } from "@/utils/format";
import { cn } from "@/lib/utils";

interface FundTheGapProps {
  /** Amount still needed to reach the target, in the token's smallest unit. */
  remaining: bigint;
  decimals: number;
  symbol: string;
  onDonate: (amount: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * "Only X left — fund the gap!" banner shown when a campaign is close to its
 * target. Shared between CampaignCard and the campaign detail page so the
 * copy, the amount shown, and the pre-filled donate amount can't drift apart.
 */
export function FundTheGap({
  remaining,
  decimals,
  symbol,
  onDonate,
  disabled = false,
  className,
}: FundTheGapProps) {
  const amount = formatTokenAmount(remaining, decimals);

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
        <Zap className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Only {amount} {symbol} left — fund the gap!
        </span>
      </div>
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        onClick={() => onDonate(amount)}
        className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-emerald-900"
        aria-label={`Quick donate to fund the remaining ${amount} ${symbol}`}
      >
        Donate
      </Button>
    </div>
  );
}
