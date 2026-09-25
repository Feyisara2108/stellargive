"use client";

import { useState } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { Button } from "@/components/ui/button";
import { AlertCircle, X } from "lucide-react";

export const FREIGHTER_NETWORK_GUIDE_URL =
  "https://developers.stellar.org/docs/tools/freighter/freighter-extension#network-configuration";

/** Dismissal is remembered per wallet network, so landing on a different wrong network re-shows the banner. */
export const dismissKey = (network: string) => `network-banner-dismissed:${network}`;

function isDismissedFor(network: string) {
  try {
    return sessionStorage.getItem(dismissKey(network)) === "true";
  } catch {
    return false;
  }
}

export function NetworkMismatchBanner() {
  const { isWrongNetwork, walletNetwork } = useWallet();
  const [dismissedNetwork, setDismissedNetwork] = useState<string | null>(null);
  const [showManualSteps, setShowManualSteps] = useState(false);

  if (!isWrongNetwork || !walletNetwork) return null;
  if (dismissedNetwork === walletNetwork || isDismissedFor(walletNetwork)) return null;

  const expectedNetwork = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE;

  const handleDismiss = () => {
    setDismissedNetwork(walletNetwork);
    try {
      sessionStorage.setItem(dismissKey(walletNetwork), "true");
    } catch {
      // Storage unavailable (e.g. private mode): dismissal lasts for this render tree only.
    }
  };

  const handleSwitch = () => {
    // Freighter has no API to switch networks for the user, so link to its guide. Open
    // without "noopener" (which always returns null) so a blocked popup can be detected,
    // then sever the opener manually.
    const guide = window.open(FREIGHTER_NETWORK_GUIDE_URL, "_blank");
    if (guide) {
      guide.opener = null;
    } else {
      setShowManualSteps(true);
    }
  };

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
            {showManualSteps && (
              <p className="text-xs opacity-90" role="status">
                Couldn&apos;t open the guide. In Freighter, open Settings &rarr; Network and select
                the network above, or{" "}
                <a
                  href={FREIGHTER_NETWORK_GUIDE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  read the network guide
                </a>
                .
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="h-8 text-xs font-medium"
              onClick={handleSwitch}
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
