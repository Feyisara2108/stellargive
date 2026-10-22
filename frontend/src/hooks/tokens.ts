import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSACBalance, getTokenMetadata, resolveAddressName } from "@/lib/soroban";

export function useWalletBalance(tokenContractId: string | null | undefined, address: string | null) {
  return useQuery({ queryKey: ["wallet-balance", tokenContractId, address], queryFn: () => tokenContractId && address ? getSACBalance(tokenContractId, address) : null, enabled: !!tokenContractId && !!address, staleTime: 30_000, retry: false });
}
export function useResolvedName(address: string | null) {
  return useQuery({ queryKey: ["resolved-name", address], queryFn: () => address ? resolveAddressName(address) : null, enabled: !!address && address.length === 56, staleTime: 3_600_000, gcTime: 86_400_000, retry: false });
}
export function useTokenMetadata(contractId: string | null | undefined) {
  return useQuery({ queryKey: ["token-metadata", contractId], queryFn: () => contractId ? getTokenMetadata(contractId) : null, enabled: !!contractId, staleTime: 86_400_000, retry: 2 });
}
export function useTokenMetadataBatch(contractIds: string[]) {
  const queryClient = useQueryClient();
  const uniqueIds = Array.from(new Set(contractIds)).filter(Boolean).sort();
  return useQuery({ queryKey: ["token-metadata-batch", uniqueIds.join(",")], queryFn: async () => {
    const results = await Promise.all(uniqueIds.map(async (id) => {
      try { const metadata = await getTokenMetadata(id); if (metadata) queryClient.setQueryData(["token-metadata", id], metadata); return [id, metadata] as const; }
      catch { return [id, null] as const; }
    }));
    return Object.fromEntries(results);
  }, enabled: uniqueIds.length > 0, staleTime: 86_400_000 });
}
