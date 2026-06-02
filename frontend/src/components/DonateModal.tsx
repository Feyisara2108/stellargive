"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useDonate } from "@/hooks/useSoroban";
import { Campaign } from "@/lib/soroban";
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
import { Loader2, Check } from "lucide-react";
import confetti from "canvas-confetti";

export function DonateModal({ campaign }: { campaign: Campaign }) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
    clearErrors,
    setError,
  } = useForm<{ amount: string }>({
    mode: "onChange",
    defaultValues: { amount: "" },
  });
  const amount = watch("amount");
  // Calculate remaining goal
  const target = Number(campaign.target_amount) / 1e7;
  const raised = Number(campaign.raised_amount) / 1e7;
  const remaining = Math.max(target - raised, 0);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTxHash, setSuccessTxHash] = useState("");
  const [successAmount, setSuccessAmount] = useState("");
  const donate = useDonate();

  useEffect(() => {
    if (donate.isSuccess) {
      confetti({
        spread: 90,
        particleCount: 100,
      });
    }
  }, [donate.isSuccess]);

  const onSubmit = async (data: { amount: string }) => {
    if (donate.isPending) return;
    try {
      const result = await donate.mutateAsync({
        campaignId: campaign.id,
        amount: data.amount,
        isAnonymous,
      });
      setSuccessAmount(data.amount);
      setSuccessTxHash((result as any).hash || "");
      setShowSuccess(true);
      setIsOpen(false);
      setValue("amount", "");
      setIsAnonymous(false);
    } catch (e: any) {
      console.error(e);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!donate.isPending) {
          setIsOpen(open);
        }
      }}>
        <DialogTrigger asChild>
          <Button className="flex-1">Donate Now</Button>
        </DialogTrigger>
        <DialogContent onPointerDownOutside={(e) => {
          if (donate.isPending) e.preventDefault(); // lock UI until resolution
        }} onEscapeKeyDown={(e) => {
          if (donate.isPending) e.preventDefault(); // lock UI until resolution
        }}>
          <DialogHeader>
            <DialogTitle>Donate to {campaign.title}</DialogTitle>
            <DialogDescription>
              Enter the amount of tokens you wish to contribute to this relief campaign.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="10.0"
                aria-invalid={errors.amount ? "true" : "false"}
                aria-describedby={errors.amount ? "amount-error" : undefined}
                {...register("amount", {
                  required: "Amount is required",
                  pattern: {
                    value: /^\d*\.?\d*$/,
                    message: "Enter a valid number",
                  },
                  validate: (value) => {
                    if (isNaN(Number(value))) return "Enter a valid number";
                    if (Number(value) <= 0) return "Amount must be greater than zero";
                    if (Number(value) > remaining) return "This exceeds the remaining goal";
                    return true;
                  },
                })}
                disabled={donate.isPending}
              />
              {errors.amount && (
                <span id="amount-error" className="text-xs text-red-500 mt-1" role="alert" aria-live="polite">
                  {errors.amount.message}
                </span>
              )}
              {!errors.amount && amount && Number(amount) > remaining && (
                <span className="text-xs text-yellow-600 mt-1" role="status" aria-live="polite">
                  This exceeds the remaining goal
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
                <Label htmlFor="anonymous" className="cursor-pointer select-none text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Donate anonymously
                </Label>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Hides your address in the public event feed and leaderboard. Ledger records will still show the transfer.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={donate.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit(onSubmit)}
              disabled={donate.isPending || !isValid}
            >
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
        <DialogContent className="max-w-md text-center p-6 gap-6">
          <DialogHeader className="items-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 mb-2">
              <Check className="h-6 w-6" />
            </div>
            <DialogTitle className="text-2xl font-bold">Donation Successful!</DialogTitle>
            <DialogDescription className="text-center mt-2 text-slate-500 dark:text-slate-400">
              Thank you support for supporting <strong>{campaign.title}</strong>! Your contribution makes a big difference.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 my-2 border border-slate-100 dark:border-slate-800 text-left space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Amount Donated</span>
              <span className="font-semibold text-lg text-primary">{successAmount} XLM</span>
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
            <Button
              variant="outline"
              onClick={() => setShowSuccess(false)}
              className="w-full"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
