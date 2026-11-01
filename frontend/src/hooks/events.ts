import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { nativeToScVal, Address } from "@stellar/stellar-sdk";
import { useWallet } from "@/lib/WalletProvider";
import {
  getEvents,
  getUpdates,
  submitTransaction,
  estimateFee,
  getPlatformConfig,
  Campaign,
  SorobanEvent,
  SubmitTransactionResult,
} from "@/lib/soroban";
import { notify } from "@/lib/toast";
import { mapTransactionError } from "./campaignMutations";

export const DONOR_SCAN_EVENT_LIMIT = 200;
const ZERO_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
export function countUniqueDonors(events: SorobanEvent[] | undefined): number {
  const donors = new Set<string>();
  for (const event of events ?? []) {
    if (event?.topic !== "received" || !event.data || typeof event.data !== "object") continue;
    const donor = "donor" in event.data ? String(event.data.donor) : "";
    if (donor && donor !== ZERO_ADDRESS) donors.add(donor);
  }
  return donors.size;
}
export function useUniqueDonors() {
  return useQuery({
    queryKey: ["platform-stats", "unique-donors"],
    queryFn: async () => countUniqueDonors(await getEvents(DONOR_SCAN_EVENT_LIMIT)),
    staleTime: 60_000,
  });
}
export const EVENTS_POLL_INTERVAL_MS = 10_000;
export const EVENTS_MAX_BACKOFF_MS = 60_000;
export function eventsRefetchInterval(query: {
  state: { status: string; fetchFailureCount: number };
}): number | false {
  if (typeof document !== "undefined" && document.hidden) return false;
  if (query.state.status === "error")
    return Math.min(
      EVENTS_POLL_INTERVAL_MS * 2 ** query.state.fetchFailureCount,
      EVENTS_MAX_BACKOFF_MS,
    );
  return EVENTS_POLL_INTERVAL_MS;
}
export function useEvents(limit = 20) {
  return useQuery({
    queryKey: ["events", limit],
    queryFn: () => getEvents(limit),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
    refetchInterval: eventsRefetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
export function useGetUpdates(campaignId: bigint) {
  return useQuery({
    queryKey: ["updates", campaignId.toString()],
    queryFn: () => getUpdates(campaignId),
  });
}
export function useAddUpdate() {
  const { address } = useWallet();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { campaignId: bigint; content: string }) => {
      if (!address) throw new Error("Wallet not connected");
      return submitTransaction(address, "add_update", [
        nativeToScVal(params.campaignId, { type: "u64" }),
        nativeToScVal(params.content, { type: "string" }),
      ]);
    },
    onMutate: () => ({ toastId: notify.loading() }),
    onSuccess: (data: SubmitTransactionResult, variables, context) => {
      notify.success("Transaction confirmed", { id: context?.toastId, hash: data.hash });
      queryClient.invalidateQueries({ queryKey: ["updates", variables.campaignId.toString()] });
    },
    onError: (error: unknown, _variables, context) =>
      notify.error(mapTransactionError(error), { id: context?.toastId }),
  });
}
export function useRefundEligibility(campaignId: bigint, isCancelled: boolean) {
  const { address } = useWallet();
  return useQuery({
    queryKey: ["refund-eligibility", campaignId.toString(), address],
    queryFn: async () => {
      if (!address || !isCancelled) return false;
      try {
        return (
          (await estimateFee(address, "claim_refund", [
            new Address(address).toScVal(),
            nativeToScVal(campaignId, { type: "u64" }),
          ])) !== null
        );
      } catch {
        return false;
      }
    },
    enabled: !!address && isCancelled,
    staleTime: 60_000,
  });
}
export function usePlatformConfigQuery() {
  return useQuery({ queryKey: ["platform-config"], queryFn: getPlatformConfig, staleTime: 30_000 });
}
