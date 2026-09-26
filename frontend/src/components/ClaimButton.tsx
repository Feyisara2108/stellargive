"use client";

import { useClaimFunds } from "@/hooks/useSoroban";
import { useWallet } from "@/lib/WalletProvider";
import { Campaign } from "@/lib/soroban";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Info } from "lucide-react";

export function ClaimButton({ campaign }: { campaign: Campaign }) {
  const { address, isWrongNetwork } = useWallet();
  const claim = useClaimFunds();

  const isBeneficiary = address === campaign.beneficiary;
  const isCreator = address === campaign.creator;

  const canClaim =
    (campaign.status === "Funded" || campaign.status === "Expired") && campaign.raised_amount > 0n;

  if (campaign.status === "Claimed") {
    return (
      <Tooltip>
        <TooltipTrigger className="relative">
          <Button variant="ghost" disabled className="text-green-500 gap-2">
            <CheckCircle2 className="w-4 h-4" /> Claimed
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Funds have already been claimed</TooltipContent>
      </Tooltip>
    );
  }

  if (isCreator && !isBeneficiary) {
    return (
      <Tooltip>
        <TooltipTrigger className="relative">
          <Button variant="outline" disabled className="gap-2 text-muted-foreground border-muted">
            <Info className="h-4 w-4" /> Claim Funds
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          Only the designated beneficiary can claim campaign funds. Contact the beneficiary to
          initiate the claim.
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!isBeneficiary) {
    return null;
  }

  const handleClaim = async () => {
    if (claim.isPending || claim.isSuccess) return;
    try {
      await claim.mutateAsync(campaign.id);
    } catch (e: any) {
      console.error(e);
    }
  };

  const disabledReason = isWrongNetwork
    ? "Please switch wallet network to Stellar Testnet"
    : !canClaim
      ? campaign.status === "Active"
        ? "Campaign must be fully funded or expired before claiming"
        : "Nothing to claim — no funds have been raised"
      : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative">
          <Button
            variant="outline"
            onClick={handleClaim}
            disabled={claim.isPending || claim.isSuccess || !canClaim || isWrongNetwork}
            className="border-primary text-primary hover:bg-primary/10"
            aria-describedby={disabledReason ? "claim-disabled-reason" : undefined}
          >
            {claim.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {claim.isSuccess ? "Claimed" : "Claim Funds"}
          </Button>
        </span>
      </TooltipTrigger>
      {disabledReason && (
        <TooltipContent side="top" id="claim-disabled-reason">
          {disabledReason}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
