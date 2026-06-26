"use client";

import { useClaimRefund, useRefundEligibility } from "@/hooks/useSoroban";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCcw } from "lucide-react";

export function RefundButton({
  campaignId,
  isCancelled,
}: {
  campaignId: bigint;
  isCancelled: boolean;
}) {
  const { data: isEligible, isLoading: isCheckingEligibility } = useRefundEligibility(
    campaignId,
    isCancelled,
  );
  const claimRefund = useClaimRefund();

  // If we haven't loaded eligibility, or if the user is not eligible, don't show the button.
  if (isCheckingEligibility || !isEligible) {
    return null;
  }

  // Once claimed successfully, the invalidation of useRefundEligibility will quickly hide the button,
  // but we also rely on isSuccess locally for an immediate UI response.
  if (claimRefund.isSuccess) {
    return null;
  }

  return (
    <Button
      variant="outline"
      className="border-primary text-primary hover:bg-primary/10 gap-2"
      disabled={claimRefund.isPending}
      onClick={async () => {
        await claimRefund.mutateAsync(campaignId);
      }}
    >
      {claimRefund.isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Claiming refund...
        </>
      ) : (
        <>
          <RefreshCcw className="h-4 w-4" />
          Claim refund
        </>
      )}
    </Button>
  );
}
