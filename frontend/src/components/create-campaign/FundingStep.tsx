"use client";

import { useFormContext } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TokenSelector } from "@/components/TokenSelector";
import { cn } from "@/lib/utils";
import { MAX_DURATION_DAYS, MIN_TARGET_TOKEN, type FormValues } from "./schema";
import type { BeneficiaryResolution } from "./useBeneficiaryName";

interface FundingStepProps {
  active: boolean;
  disabled?: boolean;
  tokenSymbol: string;
  beneficiary: BeneficiaryResolution;
}

/** Step 2: beneficiary, accepted token, target amount and duration. */
export function FundingStep({ active, disabled, tokenSymbol, beneficiary }: FundingStepProps) {
  const form = useFormContext<FormValues>();
  const { isBeneficiaryValid, isResolvingBeneficiary, resolvedBeneficiaryName } = beneficiary;

  return (
    <div className={cn("space-y-4", !active && "hidden")}>
      <FormField
        control={form.control}
        name="beneficiary"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Beneficiary Address</FormLabel>
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
    </div>
  );
}
