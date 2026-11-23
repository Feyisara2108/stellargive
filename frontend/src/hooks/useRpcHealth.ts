"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQuery, onlineManager } from "@tanstack/react-query";

export type RpcStatus = "healthy" | "degraded" | "down" | "loading";

export interface RpcHealth {
  status: RpcStatus;
  latencyMs: number | null;
}

const DEGRADED_THRESHOLD_MS = 1_000;

async function pingRpc(): Promise<RpcHealth> {
  const start = performance.now();
  try {
    // Lazy so the footer (rendered on every route) doesn't ship the SDK up front.
    const { server } = await import("@/lib/soroban");
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

// Only an explicit `false` means offline. Node 21+ defines a global `navigator`
// whose `onLine` is undefined on the server, which must not read as offline.
function isNavigatorOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function subscribeToBrowserOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * Online state that is `true` on the server and during hydration, so the first
 * client render matches the server HTML; it re-syncs right after mount.
 */
function useIsOnline(): boolean {
  const browserOnline = useSyncExternalStore(
    subscribeToBrowserOnline,
    () => !isNavigatorOffline(),
    () => true,
  );
  const queryOnline = useSyncExternalStore(
    (callback) => onlineManager.subscribe(callback),
    () => onlineManager.isOnline(),
    () => true,
  );
  return browserOnline && queryOnline;
}

export function useRpcHealth(): RpcHealth {
  const pausedRef = useRef(false);
  const isOnline = useIsOnline();

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
        isNavigatorOffline() ||
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

  if (!isOnline) {
    return { status: "down", latencyMs: null };
  }

  if (isFetching && !data) {
    return { status: "loading", latencyMs: null };
  }

  return data ?? { status: "loading", latencyMs: null };
}
