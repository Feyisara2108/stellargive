"use client";

import React, { useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletProvider } from "@/lib/WalletProvider";
import { MockWalletProvider } from "@/components/MockWalletProvider";
import { Toaster } from "sonner";
import { ThemeProvider } from "next-themes";
import { NetworkMismatchBanner } from "@/components/NetworkMismatchBanner";
import dynamic from "next/dynamic";

const CommandPalette = dynamic(
  () => import("@/components/CommandPalette").then((mod) => mod.CommandPalette),
  {
    ssr: false,
  },
);

// ---------------------------------------------------------------------------
// sessionStorage persister
//
// Persists the query cache across same-tab navigations so back-navigation
// shows cached data instantly without a loading spinner.
//
// We intentionally avoid @tanstack/react-query-persist-client to keep the
// dependency graph stable (no new install required). The approach:
//   - On QueryClient cache update, write the serialised cache to sessionStorage.
//   - On mount, restore the serialised cache back into the client.
//
// Keys that hold sensitive user data (wallet balance, refund eligibility) are
// excluded from persistence so stale auth-sensitive values are never served
// after a page reload.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "stellargive:query-cache";

/** Query-key prefixes we do NOT want to persist. */
const EXCLUDED_KEY_PREFIXES = ["wallet-balance", "refund-eligibility", "fee-estimate"];

function shouldPersist(queryKey: readonly unknown[]): boolean {
  const first = queryKey[0];
  if (typeof first !== "string") return true;
  return !EXCLUDED_KEY_PREFIXES.some((prefix) => first.startsWith(prefix));
}

function saveToStorage(client: QueryClient): void {
  try {
    const cache = client.getQueryCache();
    const queries = cache
      .getAll()
      .filter((q) => q.state.status === "success" && shouldPersist(q.queryKey))
      .map((q) => ({
        queryKey: q.queryKey,
        state: q.state,
      }));

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(queries));
  } catch {
    // sessionStorage may be unavailable (private browsing quota exceeded).
  }
}

function restoreFromStorage(client: QueryClient): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const queries: Array<{ queryKey: unknown[]; state: unknown }> = JSON.parse(raw);
    for (const { queryKey, state } of queries) {
      // Only restore if the query isn't already fresh in the client.
      const existing = client.getQueryCache().find({ queryKey: queryKey as any[] });
      if (!existing || existing.state.status === "pending") {
        client.setQueryData(queryKey as any[], (state as any).data);
      }
    }
  } catch {
    // Corrupt storage — ignore and let queries fetch normally.
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // nothing
    }
  }
}

// ---------------------------------------------------------------------------
// QueryClient factory
//
// Created inside a useRef so Next.js never shares a single client instance
// between requests when rendering on the server.
// ---------------------------------------------------------------------------

function makeQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 30 s — prevents refetch storms on
        // remount and tab-focus for the vast majority of queries.
        staleTime: 30_000,
        // Keep inactive queries in memory for 5 minutes.
        gcTime: 5 * 60_000,
        // One automatic retry on failure with the default exponential back-off.
        retry: 1,
        // Refetch when the window regains focus only after the staleTime has
        // elapsed — avoids the most common source of unnecessary network calls.
        refetchOnWindowFocus: true,
        // Do not refetch on reconnect unless stale — the app already handles
        // network errors at the component level.
        refetchOnReconnect: "always",
      },
    },
  });

  return client;
}

/**
 * When `NEXT_PUBLIC_USE_MOCK_WALLET` is set to "true" (e.g. in CI or E2E
 * environments), the real Freighter-backed WalletProvider is replaced with a
 * deterministic MockWalletProvider that auto-connects and returns predictable
 * test values. This allows Playwright tests to run without a browser extension.
 */
const useMockWallet = process.env.NEXT_PUBLIC_USE_MOCK_WALLET === "true";

const ActiveWalletProvider = useMockWallet ? MockWalletProvider : WalletProvider;

export function Providers({ children }: { children: React.ReactNode }) {
  // useRef ensures the same QueryClient instance is reused across re-renders
  // while still being created fresh per server request.
  const clientRef = useRef<QueryClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = makeQueryClient();
  }
  const queryClient = clientRef.current;

  // Restore persisted cache on first render (client-side only).
  const restoredRef = useRef(false);
  if (typeof window !== "undefined" && !restoredRef.current) {
    restoredRef.current = true;
    restoreFromStorage(queryClient);
    // Subscribe to cache updates and persist on every successful query.
    queryClient.getQueryCache().subscribe((event) => {
      if (event?.type === "updated" && event.query.state.status === "success") {
        saveToStorage(queryClient);
      }
    });
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <ActiveWalletProvider>
          <NetworkMismatchBanner />
          {children}
          <Toaster position="top-center" richColors />
          <CommandPalette />
        </ActiveWalletProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
