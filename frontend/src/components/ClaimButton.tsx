"use client";

import { useClaimFunds } from "@/hooks/useSoroban";
import { useWallet } from "@/lib/WalletProvider";
import { Campaign } from "@/lib/soroban";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";

export function ClaimButton({ campaign }: { campaign: Campaign }) {
  const { address } = useWallet();
  const claim = useClaimFunds();

  const isCreatorOrBeneficiary =
    address === campaign.creator || address === campaign.beneficiary;
  
  const canClaim = 
    (campaign.status === "Funded" || campaign.status === "Expired") &&
    campaign.raised_amount > 0n;

  if (!isCreatorOrBeneficiary || campaign.status === "Claimed") {
    if (campaign.status === "Claimed") {
        return (
            <Button variant="ghost" disabled className="text-green-500 gap-2">
                <CheckCircle2 className="w-4 h-4" /> Claimed
            </Button>
        );
    }
    return null;
  }

  const handleClaim = async () => {
    try {
      await claim.mutateAsync(campaign.id);
    } catch (e: any) {
      // Errors are now handled internally by useClaimFunds toast lifecycle
      console.error(e);
    }
  };

  return (
    <Button 
      variant="outline" 
      onClick={handleClaim} 
      disabled={claim.isPending || !canClaim}
      className="border-primary text-primary hover:bg-primary/10"
    >
      {claim.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      Claim Funds
    </Button>
  );
}
