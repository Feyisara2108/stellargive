"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { Button } from "@/components/ui/button";
import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function NetworkMismatchBanner() {
  const { isWrongNetwork, walletNetwork } = useWallet();
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem("network-banner-dismissed");
    if (dismissed === "true") {
      setIsDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem("network-banner-dismissed", "true");
  };

  if (!isWrongNetwork || isDismissed) return null;

  const expectedNetwork = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE;

  return (
    <div className="fixed top-16 left-0 right-0 z-50 p-4 pointer-events-none">
      <div className="max-w-4xl mx-auto pointer-events-auto">
        <div className="bg-destructive text-destructive-foreground rounded-lg shadow-lg border border-destructive-foreground/20 p-4 flex items-start gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold">Network Mismatch Detected</p>
            <p className="text-xs opacity-90">
              Your wallet is on <span className="font-mono font-bold">{walletNetwork}</span>.{" "}
              StellarGive needs <span className="font-mono font-bold">{expectedNetwork}</span>.{" "}
              Please switch networks in your Freighter wallet.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="h-8 text-xs font-medium"
              onClick={() => {
                // Freighter doesn't have a direct 'switch network' API,
                // but we can suggest the user open it.
                window.open("https://freighter.app/", "_blank");
              }}
            >
              Switch Network
            </Button>
            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-destructive-foreground/20 rounded transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
