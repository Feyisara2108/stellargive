"use client";

import * as React from "react";
import { useId, useState } from "react";
import { useClaimFunds } from "@/hooks/useSoroban";
import { useWallet } from "@/lib/WalletProvider";
import { logger } from "@/lib/logger";
import type { Campaign } from "@/lib/soroban";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Info, ExternalLink } from "lucide-react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { getStellarExpertTxUrl } from "@/lib/utils";
import { WRONG_NETWORK_MESSAGE } from "@/lib/network";

/**
 * Focusable wrapper for a disabled button. A disabled <button> receives no focus or pointer
 * events, so the wrapper takes focus instead. `aria-describedby` is applied last so it wins over
 * the tooltip-content id that TooltipTrigger injects into its child (that element only exists
 * while the tooltip is open).
 */
const TooltipAnchor = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { focusable: boolean; describedBy?: string }
>(({ focusable, describedBy, ...props }, ref) => (
  <span ref={ref} tabIndex={focusable ? 0 : undefined} {...props} aria-describedby={describedBy} />
));
TooltipAnchor.displayName = "TooltipAnchor";

const BENEFICIARY_ONLY_REASON =
  "Only the designated beneficiary can claim campaign funds. Contact the beneficiary to initiate the claim.";

export function ClaimButton({ campaign }: { campaign: Campaign }) {
  const { address, isWrongNetwork } = useWallet();
  const claim = useClaimFunds();
  const reasonId = useId();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [claimedNow, setClaimedNow] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const isBeneficiary = address === campaign.beneficiary;
  const isCreator = address === campaign.creator;

  const canClaim =
    (campaign.status === "Funded" || campaign.status === "Expired") && campaign.raised_amount > 0n;

  // Post-claim celebration: stays visible (with the receipt link) even after the
  // campaign refetches as "Claimed".
  if (claimedNow || claim.isSuccess) {
    return (
      <div role="status" className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-400">
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Claimed
        </span>
        {txHash && (
          <a
            href={getStellarExpertTxUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
          >
            View receipt on Stellar Expert
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
    );
  }

  if (campaign.status === "Claimed") {
    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <TooltipAnchor focusable describedBy={reasonId} className="relative">
              <Button variant="ghost" disabled className="gap-2 text-green-700 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Claimed
              </Button>
            </TooltipAnchor>
          </TooltipTrigger>
          <TooltipContent side="top">Funds have already been claimed</TooltipContent>
        </Tooltip>
        <span id={reasonId} className="sr-only">
          Funds have already been claimed
        </span>
      </>
    );
  }

  if (isCreator && !isBeneficiary) {
    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <TooltipAnchor focusable describedBy={reasonId} className="relative">
              <Button
                variant="outline"
                disabled
                className="gap-2 text-muted-foreground border-muted"
              >
                <Info className="h-4 w-4" aria-hidden="true" /> Claim Funds
              </Button>
            </TooltipAnchor>
          </TooltipTrigger>
          <TooltipContent side="top">{BENEFICIARY_ONLY_REASON}</TooltipContent>
        </Tooltip>
        <span id={reasonId} className="sr-only">
          {BENEFICIARY_ONLY_REASON}
        </span>
      </>
    );
  }

  if (!isBeneficiary) {
    return null;
  }

  const handleClaim = async () => {
    if (claim.isPending || claim.isSuccess) return;
    try {
      const result = await claim.mutateAsync(campaign.id);
      setTxHash(typeof result?.hash === "string" ? result.hash : null);
      setClaimedNow(true);
      if (!prefersReducedMotion) {
        import("canvas-confetti")
          .then((module) => module.default({ spread: 90, particleCount: 120 }))
          .catch(() => {});
      }
    } catch (e: unknown) {
      logger.error(e);
    }
  };

  const disabledReason = isWrongNetwork
    ? WRONG_NETWORK_MESSAGE
    : !canClaim
      ? campaign.status === "Active"
        ? "Campaign must be fully funded or expired before claiming"
        : "Nothing to claim — no funds have been raised"
      : null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <TooltipAnchor
            focusable={!!disabledReason}
            describedBy={disabledReason ? reasonId : undefined}
            className="relative"
          >
            <Button
              variant="outline"
              onClick={handleClaim}
              disabled={claim.isPending || !canClaim || isWrongNetwork}
              className="border-primary text-primary hover:bg-primary/10"
            >
              {claim.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Claim Funds
            </Button>
          </TooltipAnchor>
        </TooltipTrigger>
        {disabledReason && <TooltipContent side="top">{disabledReason}</TooltipContent>}
      </Tooltip>
      <span id={reasonId} className="sr-only">
        {disabledReason}
      </span>
    </>
  );
}
