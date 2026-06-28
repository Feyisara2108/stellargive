"use client";

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletProvider } from "@/lib/WalletProvider";
import { MockWalletProvider } from "@/components/MockWalletProvider";
import { Toaster } from "sonner";
import { ThemeProvider } from "next-themes";
import { NetworkMismatchBanner } from "@/components/NetworkMismatchBanner";

const queryClient = new QueryClient();

/**
 * When `NEXT_PUBLIC_USE_MOCK_WALLET` is set to "true" (e.g. in CI or E2E
 * environments), the real Freighter-backed WalletProvider is replaced with a
 * deterministic MockWalletProvider that auto-connects and returns predictable
 * test values. This allows Playwright tests to run without a browser extension.
 */
const useMockWallet = process.env.NEXT_PUBLIC_USE_MOCK_WALLET === "true";

const ActiveWalletProvider = useMockWallet ? MockWalletProvider : WalletProvider;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <ActiveWalletProvider>
          <NetworkMismatchBanner />
          {children}
          <Toaster position="top-center" richColors />
        </ActiveWalletProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
