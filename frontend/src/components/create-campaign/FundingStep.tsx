"use client";

import { useFormContext } from "react-hook-form";
import { UserPlus, X } from "lucide-react";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TokenSelector } from "@/components/TokenSelector";
import { cn } from "@/lib/utils";
import { INVALID_SHARES_MESSAGE } from "@/lib/contractErrors";
import { MAX_DURATION_DAYS, MIN_TARGET_TOKEN, type FormValues } from "./schema";
import type { BeneficiaryResolution } from "./useBeneficiaryName";

/** Payout-split state and handlers owned by CreateCampaignForm. */
export interface BeneficiarySplit {
  /** One entry per extra beneficiary (react-hook-form field array items). */
  fields: { id: string }[];
  hasMultiple: boolean;
  canAdd: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  totalBps: number;
  totalError: boolean;
  formatPercent: (bps: number) => string;
}

interface FundingStepProps {
  active: boolean;
  disabled?: boolean;
  tokenSymbol: string;
  beneficiary: BeneficiaryResolution;
  split: BeneficiarySplit;
}

/** Step 2: beneficiaries and payout split, accepted token, target amount, duration and donor cap. */
export function FundingStep({
  active,
  disabled,
  tokenSymbol,
  beneficiary,
  split,
}: FundingStepProps) {
  const form = useFormContext<FormValues>();
  const { isBeneficiaryValid, isResolvingBeneficiary, resolvedBeneficiaryName } = beneficiary;

  return (
    <div className={cn("space-y-4", !active && "hidden")}>
      <FormField
        control={form.control}
        name="beneficiary"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {split.hasMultiple ? "Beneficiary 1 Address" : "Beneficiary Address"}
            </FormLabel>
            <FormControl>
              <Input placeholder="G..." {...field} disabled={disabled} />
            </FormControl>
            <FormDescription>Stellar public key of the receiver.</FormDescription>
            {isBeneficiaryValid && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {isResolvingBeneficiary
                  ? "Resolving name…"
                  : resolvedBeneficiaryName
                    ? `Resolved: ${resolvedBeneficiaryName}`
                    : null}
              </p>
            )}
            <FormMessage />
          </FormItem>
        )}
      />
      {split.hasMultiple && (
        <FormField
          control={form.control}
          name="beneficiaryShare"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Beneficiary 1 Share (%)</FormLabel>
              <FormControl>
                <Input inputMode="decimal" placeholder="50" {...field} disabled={disabled} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {split.fields.map((item, index) => (
        <div key={item.id} className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Beneficiary {index + 2}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              aria-label={`Remove beneficiary ${index + 2}`}
              onClick={() => split.onRemove(index)}
              disabled={disabled}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-[1fr,7rem] gap-3">
            <FormField
              control={form.control}
              name={`extraBeneficiaries.${index}.address`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={`G... (beneficiary ${index + 2})`}
                      {...field}
                      disabled={disabled}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`extraBeneficiaries.${index}.share`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Share (%)</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" placeholder="50" {...field} disabled={disabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={split.onAdd}
          disabled={disabled || !split.canAdd}
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" /> Add beneficiary
        </Button>
        {split.hasMultiple && (
          <p
            aria-live="polite"
            className={cn(
              "text-xs tabular-nums",
              split.totalError ? "text-destructive font-medium" : "text-muted-foreground",
            )}
          >
            Total: {split.formatPercent(split.totalBps)} of 100%
          </p>
        )}
      </div>
      {split.totalError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {INVALID_SHARES_MESSAGE} Currently {split.formatPercent(split.totalBps)}.
        </p>
      )}
      <FormField
        control={form.control}
        name="acceptedToken"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <TokenSelector value={field.value} onChange={(val) => field.onChange(val)} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="targetAmount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Target ({tokenSymbol})</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={MIN_TARGET_TOKEN}
                  step="0.0000001"
                  placeholder="1000"
                  {...field}
                  disabled={disabled}
                />
              </FormControl>
              <FormDescription className="text-[11px]">
                Min {MIN_TARGET_TOKEN.toFixed(1)} {tokenSymbol}.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="deadlineDays"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Duration (Days)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={MAX_DURATION_DAYS}
                  {...field}
                  disabled={disabled}
                />
              </FormControl>
              <FormDescription className="text-[11px]">1–{MAX_DURATION_DAYS} days.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="maxPerDonor"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Maximum per donor ({tokenSymbol}, Optional)</FormLabel>
            <FormControl>
              <Input
                type="number"
                min={0}
                step="0.0000001"
                placeholder="No cap"
                {...field}
                disabled={disabled}
              />
            </FormControl>
            <FormDescription className="text-[11px]">
              Limits how much a single wallet can contribute in total. Leave empty for no cap.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
