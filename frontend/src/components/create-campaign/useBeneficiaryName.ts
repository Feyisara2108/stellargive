import type { UseFormReturn } from "react-hook-form";
import { useResolvedName } from "@/hooks/useSoroban";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { isValidStellarAddress } from "@/lib/soroban";
import type { FormValues } from "./schema";

/**
 * Resolves a display name for the typed beneficiary address. Lives above the
 * steps because both Funding and Review show the result.
 */
export function useBeneficiaryName(form: UseFormReturn<FormValues>) {
  const watchBeneficiary = form.watch("beneficiary") ?? "";
  const debouncedBeneficiary = useDebouncedValue(watchBeneficiary, 500);
  const isBeneficiaryValid = isValidStellarAddress(debouncedBeneficiary);
  const { data: resolvedBeneficiaryName, isFetching: isResolvingBeneficiary } = useResolvedName(
    isBeneficiaryValid ? debouncedBeneficiary : null,
  );

  return { isBeneficiaryValid, isResolvingBeneficiary, resolvedBeneficiaryName };
}

export type BeneficiaryResolution = ReturnType<typeof useBeneficiaryName>;
