"use client";

import * as React from "react";
import { useId, useState } from "react";
import { useClaimRefund, useRefund, useRefundEligibility } from "@/hooks/useSoroban";
import { useWallet } from "@/lib/WalletProvider";
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
import { WRONG_NETWORK_MESSAGE } from "@/lib/network";

const ELIGIBILITY_EXPLAINER =
  "Refunds are available when a campaign is cancelled, or when it expired without reaching its funding goal.";
const INELIGIBLE_REASON =
  "Not refundable: the campaign must be cancelled or expired unfunded, and this wallet must have a refundable donation.";
const WRONG_NETWORK_REASON = WRONG_NETWORK_MESSAGE;

/**
 * Focusable wrapper for a possibly-disabled button. A disabled <button> receives no focus or
 * pointer events, so the wrapper takes focus instead. `aria-describedby` is applied last so it
 * wins over the tooltip-content id that TooltipTrigger injects into its child (that element only
 * exists while the tooltip is open).
 */
const TooltipAnchor = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { focusable: boolean; describedBy?: string }
>(({ focusable, describedBy, ...props }, ref) => (
  <span ref={ref} tabIndex={focusable ? 0 : undefined} {...props} aria-describedby={describedBy} />
));
TooltipAnchor.displayName = "TooltipAnchor";

export function RefundButton({
  campaignId,
  isCancelled,
  isExpiredUnfunded = false,
  campaignTitle,
  refundAmount,
}: {
  campaignId: bigint;
  isCancelled: boolean;
  isExpiredUnfunded?: boolean;
  /** Shown in the confirmation dialog. Falls back to the campaign id. */
  campaignTitle?: string;
  /** Refundable amount (display string, e.g. "12.5 XLM"), shown in the confirmation dialog when known. */
  refundAmount?: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reasonId = useId();
  const { isWrongNetwork } = useWallet();
  const { data: isEligible, isLoading: isCheckingEligibility } = useRefundEligibility(
    campaignId,
    isCancelled,
    isExpiredUnfunded,
  );
  const claimRefund = useClaimRefund();
  const expiredRefund = useRefund();
  const refundMutation = isExpiredUnfunded ? expiredRefund : claimRefund;

  // Nothing to show until the eligibility check has actually resolved.
  if (isCheckingEligibility || isEligible === undefined) {
    return null;
  }

  // Once claimed successfully, the invalidation of useRefundEligibility will quickly hide the button,
  // but we also rely on isSuccess locally for an immediate UI response.
  if (refundMutation.isSuccess) {
    return null;
  }

  if (!isEligible) {
    return (
      <div className="space-y-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <TooltipAnchor focusable describedBy={reasonId} className="relative">
              <Button variant="outline" className="gap-2" disabled>
                <RefreshCcw className="h-4 w-4" />
                Refund unavailable
              </Button>
            </TooltipAnchor>
          </TooltipTrigger>
          <TooltipContent side="top">{INELIGIBLE_REASON}</TooltipContent>
        </Tooltip>
        <span id={reasonId} className="sr-only">
          {INELIGIBLE_REASON}
        </span>
        <p className="text-xs text-muted-foreground">{ELIGIBILITY_EXPLAINER}</p>
      </div>
    );
  }

  const handleConfirm = () => {
    if (refundMutation.isPending) return;
    // Close first so the pending state is visible on the button and a second click can't re-submit.
    setConfirmOpen(false);
    // mutate (not mutateAsync): failures are surfaced by the hook's onError toast, and
    // awaiting mutateAsync here would leave an unhandled rejection.
    refundMutation.mutate(campaignId);
  };

  return (
    <div className="space-y-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <TooltipAnchor
            focusable={isWrongNetwork}
            describedBy={isWrongNetwork ? reasonId : undefined}
            className="relative"
          >
            <Button
              variant="outline"
              className="border-primary text-primary hover:bg-primary/10 gap-2"
              disabled={refundMutation.isPending || isWrongNetwork}
              onClick={() => setConfirmOpen(true)}
            >
              {refundMutation.isPending ? (
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
          </TooltipAnchor>
        </TooltipTrigger>
        {isWrongNetwork && <TooltipContent side="top">{WRONG_NETWORK_REASON}</TooltipContent>}
      </Tooltip>
      <span id={reasonId} className="sr-only">
        {isWrongNetwork ? WRONG_NETWORK_REASON : null}
      </span>
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
