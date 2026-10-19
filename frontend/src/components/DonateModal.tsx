"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import {
  getCrossedMilestones,
  useAccountReserve,
  useDonate,
  useDonateFeeEstimate,
  useDonorContribution,
  useWalletBalance,
  useTokenMetadata,
  type MilestonePercent,
} from "@/hooks/useSoroban";
import {
  Campaign,
  DEFAULT_DONATE_FEE_STROOPS,
  INCLUSION_FEE_BUFFER_STROOPS,
  MIN_DONATION,
} from "@/lib/soroban";
import { useWallet } from "@/lib/WalletProvider";
import { WRONG_NETWORK_MESSAGE } from "@/lib/network";
import { NATIVE_XLM_CONTRACT_ID } from "@/lib/tokens";
import { formatTokenAmount, minBigInt, parseTokenAmount } from "@/utils/format";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DEDICATION_MAX_LENGTH, sanitizeMessage } from "@/lib/sanitize";
import { isUserCancellation, mapTransactionError } from "@/lib/contractErrors";

const FIRED_MILESTONES = new Set<string>();
const milestoneKey = (campaignId: bigint, m: MilestonePercent) => `${campaignId.toString()}:${m}`;

const MILESTONE_COPY: Record<MilestonePercent, { title: string; description: string }> = {
  25: { title: "25% funded!", description: "First quarter milestone reached." },
  50: { title: "Halfway there!", description: "50% of the goal funded." },
  75: { title: "75% funded!", description: "Almost at the finish line." },
  100: { title: "Fully funded!", description: "100% of the goal raised." },
};

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
  const prefersReducedMotion = usePrefersReducedMotion();
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
  const isNative = campaign.accepted_token === NATIVE_XLM_CONTRACT_ID;
  const fmt = (raw: bigint) => `${formatTokenAmount(raw, decimals)} ${symbol}`;

  // All amount math stays in bigint base units — no float comparisons.
  const amountRaw = parseTokenAmount(amount ?? "", decimals);
  const raised = displayCampaign.raised_amount;
  const remaining =
    displayCampaign.target_amount > raised ? displayCampaign.target_amount - raised : 0n;
  const liveRemaining = remaining > (amountRaw ?? 0n) ? remaining - (amountRaw ?? 0n) : 0n;
  // The contract rejects anything below MIN_DONATION, so when less than the
  // minimum is left, "fund the rest" means donating the minimum (overshoot is allowed).
  const fundRestAmount = remaining > MIN_DONATION ? remaining : MIN_DONATION;
  const canFundRest = remaining > 0n && (amountRaw ?? 0n) < fundRestAmount;

  const [isAnonymous, setIsAnonymous] = useState(false);
  const [message, setMessage] = useState("");
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
  const [successAnnouncement, setSuccessAnnouncement] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const feeEstimate = useDonateFeeEstimate({
    campaignId: campaign.id,
    amount,
    address,
    decimals,
  });
  const walletBalance = useWalletBalance(campaign.accepted_token, address);
  const balanceRaw = walletBalance.data != null ? BigInt(walletBalance.data) : null;

  // Native XLM: the account must keep its minimum reserve and pay the network
  // fee, so donating the full balance always fails on-chain.
  const accountReserve = useAccountReserve(address, isNative);
  const feeHoldback =
    feeEstimate.data != null
      ? BigInt(feeEstimate.data) + INCLUSION_FEE_BUFFER_STROOPS
      : DEFAULT_DONATE_FEE_STROOPS;
  const nativeHoldback = isNative ? (accountReserve.data ?? 0n) + feeHoldback : 0n;
  const spendableRaw =
    balanceRaw === null ? null : balanceRaw > nativeHoldback ? balanceRaw - nativeHoldback : 0n;

  // Per-donor cap: what this donor can still give, after prior donations.
  const maxPerDonor = campaign.max_per_donor ?? null;
  const donorContribution = useDonorContribution(campaign.id, address, maxPerDonor !== null);
  const alreadyGiven = donorContribution.data ?? 0n;
  const capRemaining =
    maxPerDonor === null ? null : maxPerDonor > alreadyGiven ? maxPerDonor - alreadyGiven : 0n;

  const maxDonatable = minBigInt(fundRestAmount, capRemaining, spendableRaw);
  const canDonateMax =
    spendableRaw !== null && maxDonatable !== null && maxDonatable >= MIN_DONATION;

  // Re-run validation when balance, reserve or prior contribution loads so the
  // matching error appears immediately.
  useEffect(() => {
    if (amountRaw !== null && amountRaw > 0n) {
      trigger("amount");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spendableRaw, capRemaining, trigger]);

  // Clear inline submit error whenever the user edits the amount.
  useEffect(() => {
    if (submitError) setSubmitError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  // Pre-fill a suggested amount when the modal opens (e.g. the "Donate again"
  // shortcut passes the donor's previous amount, or return visits suggest last donated amount).
  // Only applied on the open transition so it never overwrites what the user is typing.
  const prevOpenRef = React.useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      const initialAmount =
        suggestedAmount ||
        (typeof window !== "undefined"
          ? localStorage.getItem("stellargive_last_donated_amount") || ""
          : "");
      if (initialAmount) {
        setValue("amount", initialAmount, { shouldValidate: true });
      }
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, suggestedAmount, setValue]);

  useEffect(() => {
    if (donate.isSuccess && !prefersReducedMotion) {
      import("canvas-confetti").then((module) => {
        const confetti = module.default;
        confetti({ spread: 90, particleCount: 100 });
      });
    }
  }, [donate.isSuccess, prefersReducedMotion]);

  const onSubmit = async (data: { amount: string }) => {
    if (donate.isPending) return;
    setSubmitError(null);
    try {
      const result = await donate.mutateAsync({
        campaignId: campaign.id,
        amount: data.amount,
        isAnonymous,
        decimals,
        message: sanitizeMessage(message) || undefined,
      });
      try {
        const beforeStroops = campaign.raised_amount;
        const afterStroops = beforeStroops + (parseTokenAmount(data.amount, decimals) ?? 0n);
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
      setSuccessTxHash((result as { hash?: string })?.hash || "");
      setSuccessAnnouncement(`Donation of ${data.amount} ${symbol} confirmed`);
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem("stellargive_last_donated_amount", data.amount);
        }
      } catch (storageErr) {
        console.error("Failed to save last donated amount to localStorage", storageErr);
      }
      setShowSuccess(true);
      setIsOpen(false);
      setValue("amount", "");
      setIsAnonymous(false);
      setMessage("");
    } catch (e: unknown) {
      console.error(e);
      if (!isUserCancellation(e)) setSubmitError(mapTransactionError(e));
    }
  };

  // Only Active campaigns take donations, but the success dialog below must outlive
  // the status flip when this donation is the one that reaches the goal.
  const acceptingDonations = campaign.status === "Active";

  return (
    <>
      {acceptingDonations && (
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
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="relative flex-1 block">
                <DialogTrigger asChild>
                  <Button
                    className="w-full"
                    disabled={!address || isWrongNetwork}
                    aria-describedby={
                      !address || isWrongNetwork ? "donate-disabled-reason" : undefined
                    }
                  >
                    Donate Now
                  </Button>
                </DialogTrigger>
              </span>
            </TooltipTrigger>
            {(!address || isWrongNetwork) && (
              <TooltipContent side="top" id="donate-disabled-reason">
                {!address ? "Connect your wallet to donate" : WRONG_NETWORK_MESSAGE}
              </TooltipContent>
            )}
          </Tooltip>
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
                        setValue("amount", formatTokenAmount(fundRestAmount, decimals), {
                          shouldValidate: true,
                        })
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
                  autoFocus
                  aria-invalid={errors.amount ? "true" : "false"}
                  aria-describedby={errors.amount ? "amount-error" : "amount-hint"}
                  {...register("amount", {
                    required: "Amount is required",
                    pattern: {
                      value: /^\d*\.?\d*$/,
                      message: "Enter a valid number",
                    },
                    validate: (value) => {
                      const parts = value.split(".");
                      if (parts.length > 1 && parts[1].length > decimals)
                        return `Maximum ${decimals} decimal places`;
                      const raw = parseTokenAmount(value, decimals);
                      if (raw === null) return "Enter a valid number";
                      if (raw < MIN_DONATION) return `Minimum donation is ${fmt(MIN_DONATION)}`;
                      if (raw > fundRestAmount) return "This exceeds the remaining goal";
                      if (maxPerDonor !== null && capRemaining !== null && raw > capRemaining) {
                        if (capRemaining < MIN_DONATION)
                          return `You've reached this campaign's limit of ${fmt(maxPerDonor)} per donor`;
                        return alreadyGiven > 0n
                          ? `This campaign allows ${fmt(maxPerDonor)} per donor — you've given ${fmt(alreadyGiven)}, so you can give up to ${fmt(capRemaining)} more`
                          : `This campaign allows at most ${fmt(maxPerDonor)} per donor`;
                      }
                      if (balanceRaw !== null && raw > balanceRaw)
                        return `Insufficient balance — you have ${fmt(balanceRaw)}`;
                      if (spendableRaw !== null && raw > spendableRaw)
                        return `Insufficient balance — ${fmt(spendableRaw)} is available after keeping ${fmt(nativeHoldback)} for the account reserve and network fees`;
                      return true;
                    },
                  })}
                  disabled={donate.isPending}
                />
                <div
                  className="flex flex-wrap gap-1.5 pt-1"
                  role="group"
                  aria-label="Preset donation values"
                >
                  {[10, 50, 100].map((presetVal) => {
                    const isActive =
                      amountRaw !== null &&
                      amountRaw === BigInt(presetVal) * 10n ** BigInt(decimals);
                    return (
                      <Button
                        key={presetVal}
                        type="button"
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        className={cn(
                          "h-7 px-3 text-xs rounded-full transition-colors",
                          isActive && "font-semibold shadow-sm",
                        )}
                        onClick={() =>
                          setValue("amount", presetVal.toString(), { shouldValidate: true })
                        }
                        disabled={donate.isPending}
                      >
                        {presetVal} {symbol}
                      </Button>
                    );
                  })}
                  {remaining > 0n && (
                    <Button
                      type="button"
                      variant={amountRaw === fundRestAmount ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "h-7 px-3 text-xs rounded-full transition-colors",
                        amountRaw === fundRestAmount && "font-semibold shadow-sm",
                      )}
                      onClick={() =>
                        setValue("amount", formatTokenAmount(fundRestAmount, decimals), {
                          shouldValidate: true,
                        })
                      }
                      disabled={donate.isPending}
                    >
                      Fund Remaining
                    </Button>
                  )}
                  {canDonateMax && (
                    <Button
                      type="button"
                      variant={amountRaw === maxDonatable ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "h-7 px-3 text-xs rounded-full transition-colors",
                        amountRaw === maxDonatable && "font-semibold shadow-sm",
                      )}
                      onClick={() =>
                        setValue("amount", formatTokenAmount(maxDonatable, decimals), {
                          shouldValidate: true,
                        })
                      }
                      disabled={donate.isPending}
                    >
                      Max
                    </Button>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span
                    id="amount-hint"
                    className="text-xs text-muted-foreground"
                    role="status"
                    aria-live="polite"
                  >
                    {liveRemaining > 0n
                      ? `${fmt(liveRemaining)} left to reach the goal`
                      : amountRaw !== null && amountRaw > 0n
                        ? "This will fully fund the campaign!"
                        : `${fmt(remaining)} left to reach the goal`}
                  </span>
                  {/* Always render the balance slot so the row height is stable.
                    Skeleton while loading → value once resolved → nothing if
                    no address (slot collapses naturally when empty). */}
                  <span className="text-xs text-muted-foreground min-w-[6rem] text-right">
                    {walletBalance.isLoading ? (
                      <Skeleton className="h-3 w-24 inline-block" aria-label="Loading balance" />
                    ) : balanceRaw !== null ? (
                      `Balance: ${fmt(balanceRaw)}`
                    ) : null}
                  </span>
                </div>
                {isNative && balanceRaw !== null && spendableRaw !== null && (
                  <p id="balance-hint" className="text-xs text-muted-foreground">
                    You can donate up to {fmt(spendableRaw)} — {fmt(nativeHoldback)} stays in your
                    wallet for the minimum account reserve and network fees.
                  </p>
                )}
                {maxPerDonor !== null && (
                  <p id="donor-cap-hint" className="text-xs text-muted-foreground">
                    Limit: {fmt(maxPerDonor)} per donor
                    {alreadyGiven > 0n && ` · you've given ${fmt(alreadyGiven)}`}
                  </p>
                )}
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
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="dedication">Dedication message (optional)</Label>
                  <span
                    id="dedication-counter"
                    className="text-xs text-muted-foreground"
                    aria-live="polite"
                  >
                    {message.length}/{DEDICATION_MAX_LENGTH}
                  </span>
                </div>
                <Input
                  id="dedication"
                  autoComplete="off"
                  maxLength={DEDICATION_MAX_LENGTH}
                  placeholder="In memory of…"
                  aria-describedby="dedication-counter"
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, DEDICATION_MAX_LENGTH))}
                  disabled={donate.isPending}
                />
              </div>
            </div>
            {/* Fee estimate row — always occupies space so GasWarning arrival
              does not shift the footer. Three states:
              1. No amount entered yet → invisible placeholder preserving height.
              2. Amount entered, estimate in-flight → "Estimating fee…" pulse.
              3. Estimate resolved → GasWarning (or nothing if data is null). */}
            <div className="min-h-[2.5rem]" aria-live="polite" aria-atomic="true">
              {feeEstimate.isFetching && feeEstimate.data == null ? (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden="true" />
                  <span>Estimating network fee…</span>
                </div>
              ) : feeEstimate.isError && feeEstimate.data == null ? (
                <GasWarning feeError onRetry={() => feeEstimate.refetch()} />
              ) : feeEstimate.data != null ? (
                <GasWarning estimatedFeeStroops={feeEstimate.data} />
              ) : null}
            </div>
            {submitError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{submitError}</span>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={donate.isPending}
              >
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
      )}

      {showSuccess && (
        <Dialog
          open={showSuccess}
          onOpenChange={(open) => {
            setShowSuccess(open);
            if (!open) {
              setSuccessAnnouncement("");
            }
          }}
        >
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
                Thank you for supporting <strong>{campaign.title}</strong>! Your contribution makes
                a big difference.
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
      )}

      {/* Screen Reader Announcements */}
      <div aria-live="polite" className="sr-only">
        {successAnnouncement}
      </div>
      <div aria-live="assertive" className="sr-only">
        {submitError}
      </div>
    </>
  );
}
