"use client";

import { useState } from "react";
import { useClaimRefund, useRefundEligibility } from "@/hooks/useSoroban";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Loader2, RefreshCcw } from "lucide-react";

const ELIGIBILITY_EXPLAINER =
  "Refunds are available when a campaign is cancelled, or when it expired without reaching its funding goal.";
const INELIGIBLE_REASON =
  "Not refundable: the campaign must be cancelled or expired unfunded, and this wallet must have a refundable donation.";

export function RefundButton({
  campaignId,
  isCancelled,
  campaignTitle,
  refundAmount,
}: {
  campaignId: bigint;
  isCancelled: boolean;
  /** Shown in the confirmation dialog. Falls back to the campaign id. */
  campaignTitle?: string;
  /** Refundable amount (display string, e.g. "12.5 XLM"), shown in the confirmation dialog when known. */
  refundAmount?: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data: isEligible, isLoading: isCheckingEligibility } = useRefundEligibility(
    campaignId,
    isCancelled,
  );
  const claimRefund = useClaimRefund();

  // Nothing to show until the eligibility check has actually resolved.
  if (isCheckingEligibility || isEligible === undefined) {
    return null;
  }

  // Once claimed successfully, the invalidation of useRefundEligibility will quickly hide the button,
  // but we also rely on isSuccess locally for an immediate UI response.
  if (claimRefund.isSuccess) {
    return null;
  }

  if (!isEligible) {
    return (
      <div className="space-y-1">
        <Tooltip>
          <TooltipTrigger>
            <Button variant="outline" className="gap-2" disabled>
              <RefreshCcw className="h-4 w-4" />
              Refund unavailable
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{INELIGIBLE_REASON}</TooltipContent>
        </Tooltip>
        <p className="text-xs text-muted-foreground">{ELIGIBILITY_EXPLAINER}</p>
      </div>
    );
  }

  const handleConfirm = async () => {
    if (claimRefund.isPending) return;
    // Close first so the pending state is visible on the button and a second click can't re-submit.
    setConfirmOpen(false);
    await claimRefund.mutateAsync(campaignId);
  };

  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        className="border-primary text-primary hover:bg-primary/10 gap-2"
        disabled={claimRefund.isPending}
        onClick={() => setConfirmOpen(true)}
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
      <p className="text-xs text-muted-foreground">{ELIGIBILITY_EXPLAINER}</p>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm refund</DialogTitle>
            <DialogDescription>
              You are about to claim a refund. Your wallet will ask you to sign the transaction.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Campaign</dt>
              <dd className="font-medium text-right">
                {campaignTitle ?? `#${campaignId.toString()}`}
              </dd>
            </div>
            {refundAmount && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Refund amount</dt>
                <dd className="font-medium">{refundAmount}</dd>
              </div>
            )}
          </dl>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm}>Confirm refund</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
