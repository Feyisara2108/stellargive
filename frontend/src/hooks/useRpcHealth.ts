"use client";

import { useQuery } from "@tanstack/react-query";
import { server } from "@/lib/soroban";

export type RpcStatus = "healthy" | "degraded" | "down";

export interface RpcHealth {
  status: RpcStatus;
  latencyMs: number | null;
}

const DEGRADED_THRESHOLD_MS = 1_000;

async function pingRpc(): Promise<RpcHealth> {
  const start = performance.now();
  try {
    await server.getLatestLedger();
    const latencyMs = Math.round(performance.now() - start);
    return {
      status: latencyMs < DEGRADED_THRESHOLD_MS ? "healthy" : "degraded",
      latencyMs,
    };
  } catch {
    return { status: "down", latencyMs: null };
  }
}

export function useRpcHealth(): RpcHealth | undefined {
  const { data } = useQuery<RpcHealth>({
    queryKey: ["rpc-health"],
    queryFn: pingRpc,
    refetchInterval: (query) => {
      if (typeof document !== "undefined" && document.hidden) return false;
      const status = query.state.data?.status;
      return status === "healthy" ? 30_000 : 15_000;
    },
    refetchIntervalInBackground: false,
    staleTime: 25_000,
    retry: false,
  });
  return data;
}
