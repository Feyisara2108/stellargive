"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  getCrossedMilestones,
  useDonate,
  useDonateFeeEstimate,
  useWalletBalance,
  useTokenMetadata,
  type MilestonePercent,
} from "@/hooks/useSoroban";
import { Campaign } from "@/lib/soroban";
import { useWallet } from "@/lib/WalletProvider";
import { formatTokenAmount, toRawAmount } from "@/utils/format";
import { GasWarning } from "@/components/GasWarning";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import confetti from "canvas-confetti";

const FIRED_MILESTONES = new Set<string>();
const milestoneKey = (campaignId: bigint, m: MilestonePercent) => `${campaignId.toString()}:${m}`;

const MILESTONE_COPY: Record<MilestonePercent, { title: string; description: string }> = {
  25: { title: "25% funded!", description: "First quarter milestone reached." },
  50: { title: "Halfway there!", description: "50% of the goal funded." },
  75: { title: "75% funded!", description: "Almost at the finish line." },
  100: { title: "Fully funded!", description: "100% of the goal raised." },
};

function mapOnChainError(error: any): string | null {
  const msg = (error?.message || String(error)).trim();
  if (msg.includes("User declined") || msg.includes("cancelled") || msg.includes("User rejected")) {
    return null; // user-initiated, no inline error needed
  }
  if (msg.includes("Simulation failed") || msg.includes("Transaction failed")) {
    return "The transaction was rejected on-chain. Check the donation amount and try again.";
  }
  if (
    msg.includes("Network Error") ||
    msg.includes("Failed to fetch") ||
    msg.includes("Send failed")
  ) {
    return "Network error — please check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

export function DonateModal({
  campaign,
  open: openProp,
  onOpenChange,
  suggestedAmount,
}: {
  campaign: Campaign;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Pre-fills the amount field when the modal opens (e.g. "Donate again"). */
  suggestedAmount?: string;
}) {
  const router = useRouter();
  const { address, isWrongNetwork } = useWallet();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isValid },
    clearErrors,
  } = useForm<{ amount: string }>({
    mode: "onChange",
    defaultValues: { amount: "" },
  });
  const amount = watch("amount");

  const donate = useDonate();

  // Freeze the campaign state while donating so the UI doesn't jump due to optimistic updates
  const frozenCampaignRef = React.useRef(campaign);
  if (!donate.isPending) {
    frozenCampaignRef.current = campaign;
  }
  const displayCampaign = frozenCampaignRef.current;

  const { data: tokenMeta } = useTokenMetadata(campaign.accepted_token);
  const decimals = tokenMeta?.decimals ?? 7;
  const symbol = tokenMeta?.symbol ?? "XLM";
  const divisor = 10 ** decimals;
  const minDonation = 1 / divisor;

  const target = Number(displayCampaign.target_amount) / divisor;
  const raised = Number(displayCampaign.raised_amount) / divisor;
  const remaining = Math.max(target - raised, 0);
  const liveRemaining = Math.max(remaining - (Number(amount) || 0), 0);
  const canFundRest = remaining >= minDonation && (Number(amount) || 0) < remaining;

  const formatNum = (num: number) => num.toFixed(decimals).replace(/\.?0+$/, "") || "0";

  const [isAnonymous, setIsAnonymous] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const isOpen = isControlled ? !!openProp : internalOpen;
  const setIsOpen = (open: boolean) => {
    if (onOpenChange) onOpenChange(open);
    else setInternalOpen(open);
  };
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTxHash, setSuccessTxHash] = useState("");
  const [successAmount, setSuccessAmount] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const feeEstimate = useDonateFeeEstimate({
    campaignId: campaign.id,
    amount,
    address,
  });
  const walletBalance = useWalletBalance(campaign.accepted_token, address);
  const balanceTokens = walletBalance.data != null ? Number(walletBalance.data) / divisor : null;

  // Re-run validation when balance loads so the balance error appears immediately.
  useEffect(() => {
    if (balanceTokens !== null && amount && Number(amount) > 0) {
      trigger("amount");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceTokens, trigger]);

  // Clear inline submit error whenever the user edits the amount.
  useEffect(() => {
    if (submitError) setSubmitError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  // Pre-fill a suggested amount when the modal opens (e.g. the "Donate again"
  // shortcut passes the donor's previous amount). Only applied on the open
  // transition so it never overwrites what the user is typing.
  const prevOpenRef = React.useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpenRef.current && suggestedAmount) {
      setValue("amount", suggestedAmount, { shouldValidate: true });
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, suggestedAmount, setValue]);

  useEffect(() => {
    if (donate.isSuccess) {
      confetti({ spread: 90, particleCount: 100 });
    }
  }, [donate.isSuccess]);

  const onSubmit = async (data: { amount: string }) => {
    if (donate.isPending) return;
    setSubmitError(null);
    try {
      const result = await donate.mutateAsync({
        campaignId: campaign.id,
        amount: data.amount,
        isAnonymous,
        decimals,
      });
      try {
        const beforeStroops = campaign.raised_amount;
        const afterStroops = beforeStroops + toRawAmount(data.amount, decimals);
        for (const milestone of getCrossedMilestones(
          beforeStroops,
          afterStroops,
          campaign.target_amount,
        )) {
          const key = milestoneKey(campaign.id, milestone);
          if (FIRED_MILESTONES.has(key)) continue;
          FIRED_MILESTONES.add(key);
          const copy = MILESTONE_COPY[milestone];
          toast.success(`${campaign.title}: ${copy.title}`, {
            description: copy.description,
            ...(milestone === 100
              ? {
                  action: {
                    label: "View campaign",
                    onClick: () => router.push(`/campaign/${campaign.id.toString()}`),
                  },
                }
              : {}),
          });
        }
      } catch (milestoneErr) {
        console.error("Failed to compute milestone toasts", milestoneErr);
      }
      setSuccessAmount(data.amount);
      setSuccessTxHash((result as any).hash || "");
      setShowSuccess(true);
      setIsOpen(false);
      setValue("amount", "");
      setIsAnonymous(false);
    } catch (e: any) {
      console.error(e);
      const inlineMsg = mapOnChainError(e);
      if (inlineMsg) setSubmitError(inlineMsg);
    }
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!donate.isPending) {
            setIsOpen(open);
            if (!open) {
              setSubmitError(null);
              clearErrors();
            }
          }
        }}
      >
        <DialogTrigger asChild>
          <Button
            className="flex-1"
            disabled={isWrongNetwork}
            title={isWrongNetwork ? "Switch to the correct network to donate" : undefined}
          >
            Donate Now
          </Button>
        </DialogTrigger>
        <DialogContent
          aria-labelledby="donate-dialog-title"
          onPointerDownOutside={(e) => {
            if (donate.isPending) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (donate.isPending) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle id="donate-dialog-title">Donate to {campaign.title}</DialogTitle>
            <DialogDescription>
              Enter the amount of tokens you wish to contribute to this relief campaign.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="amount">Amount</Label>
                {canFundRest && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() =>
                      setValue("amount", formatNum(remaining), { shouldValidate: true })
                    }
                    disabled={donate.isPending}
                  >
                    Fund the rest
                  </Button>
                )}
              </div>
              <Input
                id="amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="10.0"
                aria-invalid={errors.amount ? "true" : "false"}
                aria-describedby={errors.amount ? "amount-error" : "amount-hint"}
                {...register("amount", {
                  required: "Amount is required",
                  pattern: {
                    value: /^\d*\.?\d*$/,
                    message: "Enter a valid number",
                  },
                  validate: (value) => {
                    const num = Number(value);
                    if (isNaN(num)) return "Enter a valid number";
                    const parts = value.split(".");
                    if (parts.length > 1 && parts[1].length > decimals)
                      return `Maximum ${decimals} decimal places`;
                    if (num < minDonation)
                      return `Minimum donation is ${formatNum(minDonation)} ${symbol}`;
                    if (num > remaining) return "This exceeds the remaining goal";
                    if (balanceTokens !== null && num > balanceTokens)
                      return `Insufficient balance — you have ${formatNum(balanceTokens)} ${symbol}`;
                    return true;
                  },
                })}
                disabled={donate.isPending}
              />
              <div className="flex items-center justify-between">
                <span
                  id="amount-hint"
                  className="text-xs text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  {liveRemaining > 0
                    ? `${formatNum(liveRemaining)} ${symbol} left to reach the goal`
                    : amount && Number(amount) > 0
                      ? "This will fully fund the campaign!"
                      : `${formatNum(remaining)} ${symbol} left to reach the goal`}
                </span>
                {balanceTokens !== null && (
                  <span className="text-xs text-muted-foreground">
                    Balance: {formatNum(balanceTokens)} {symbol}
                  </span>
                )}
              </div>
              {errors.amount && (
                <span
                  id="amount-error"
                  className="text-xs text-red-500 mt-1"
                  role="alert"
                  aria-live="polite"
                >
                  {errors.amount.message}
                </span>
              )}
            </div>
            <div className="grid gap-1">
              <div className="flex items-center space-x-2 pt-2">
                <input
                  id="anonymous"
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  disabled={donate.isPending}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer"
                />
                <Label
                  htmlFor="anonymous"
                  className="cursor-pointer select-none text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Donate anonymously
                </Label>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Hides your address in the public event feed and leaderboard. Ledger records will
                still show the transfer.
              </p>
            </div>
          </div>
          {feeEstimate.data != null && <GasWarning estimatedFeeStroops={feeEstimate.data} />}
          {submitError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{submitError}</span>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={donate.isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit(onSubmit)} disabled={donate.isPending || !isValid}>
              {donate.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Donating...
                </>
              ) : (
                "Confirm Donation"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent
          className="max-w-md text-center p-6 gap-6"
          aria-labelledby="donate-success-title"
        >
          <DialogHeader className="items-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 mb-2">
              <Check className="h-6 w-6" />
            </div>
            <DialogTitle id="donate-success-title" className="text-2xl font-bold">
              Donation Successful!
            </DialogTitle>
            <DialogDescription className="text-center mt-2 text-slate-500 dark:text-slate-400">
              Thank you support for supporting <strong>{campaign.title}</strong>! Your contribution
              makes a big difference.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 my-2 border border-slate-100 dark:border-slate-800 text-left space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Amount Donated</span>
              <span className="font-semibold text-lg text-primary">
                {successAmount} {symbol}
              </span>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
              <span className="block text-xs text-muted-foreground mb-1">Transaction Hash</span>
              <span className="font-mono text-xs block bg-white dark:bg-slate-950 p-2 rounded border border-slate-100 dark:border-slate-800/80 break-all select-all">
                {successTxHash}
              </span>
            </div>
          </div>

          <DialogFooter className="sm:flex-col gap-2">
            <Button className="w-full" asChild>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${successTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on StellarExpert
              </a>
            </Button>
            <Button variant="outline" onClick={() => setShowSuccess(false)} className="w-full">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
