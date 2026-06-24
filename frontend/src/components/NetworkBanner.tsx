"use client";

import { useWallet } from "@/lib/WalletProvider";
import { AlertTriangle } from "lucide-react";

export function NetworkBanner() {
  const { isWrongNetwork, walletNetwork } = useWallet();

  if (!isWrongNetwork) return null;

  return (
    <div className="w-full bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-3 text-center">
      <div className="container flex items-center justify-center gap-2 text-sm text-yellow-700 dark:text-yellow-300">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          <strong>Network mismatch detected.</strong> Your wallet is on{" "}
          {walletNetwork || "a different network"}, but this app expects{" "}
          {process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE}. Please switch your wallet to the correct
          network to continue.
        </span>
      </div>
    </div>
  );
}
