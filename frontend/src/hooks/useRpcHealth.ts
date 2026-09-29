"use client";

import { useEffect, useRef } from "react";
import { useQuery, onlineManager } from "@tanstack/react-query";
import { server } from "@/lib/soroban";

export type RpcStatus = "healthy" | "degraded" | "down" | "loading";

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

export function useRpcHealth(): RpcHealth {
  const pausedRef = useRef(false);

  useEffect(() => {
    const handle = () => {
      pausedRef.current = document.hidden;
    };
    document.addEventListener("visibilitychange", handle);
    return () => document.removeEventListener("visibilitychange", handle);
  }, []);

  const { data, isFetching } = useQuery<RpcHealth>({
    queryKey: ["rpc-health"],
    queryFn: pingRpc,
    refetchInterval: (query) => {
      if (
        pausedRef.current ||
        (typeof document !== "undefined" && document.hidden) ||
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        !onlineManager.isOnline()
      ) {
        return false;
      }
      const status = query.state.data?.status;
      if (status === "down") return 10_000;
      return status === "healthy" ? 30_000 : 15_000;
    },
    refetchIntervalInBackground: false,
    staleTime: 25_000,
    retry: false,
  });

  if ((typeof navigator !== "undefined" && !navigator.onLine) || !onlineManager.isOnline()) {
    return { status: "down", latencyMs: null };
  }

  if (isFetching && !data) {
    return { status: "loading", latencyMs: null };
  }

  return data ?? { status: "loading", latencyMs: null };
}
