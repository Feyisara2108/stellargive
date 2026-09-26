"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { Button } from "@/components/ui/button";
import { AlertCircle, X } from "lucide-react";

export const FREIGHTER_NETWORK_GUIDE_URL =
  "https://developers.stellar.org/docs/tools/freighter/freighter-extension#network-configuration";

/** Dismissal is remembered per wallet network, so landing on a different wrong network re-shows the banner. */
export const dismissKey = (network: string) => `network-banner-dismissed:${network}`;

export function NetworkMismatchBanner() {
  const { isWrongNetwork, walletNetwork } = useWallet();
  const [showManualSteps, setShowManualSteps] = useState(false);
  const [checked, setChecked] = useState<{ network: string | null; dismissed: boolean } | null>(
    null,
  );

  useEffect(() => {
    let dismissed = false;
    if (walletNetwork !== null) {
      try {
        dismissed = sessionStorage.getItem(dismissKey(walletNetwork)) === "true";
      } catch {
        dismissed = false;
      }
    }
    setChecked({ network: walletNetwork, dismissed });
  }, [walletNetwork]);

  const handleDismiss = () => {
    if (walletNetwork === null) return;
    try {
      sessionStorage.setItem(dismissKey(walletNetwork), "true");
    } catch {
      // sessionStorage may be unavailable (e.g. private browsing quota exceeded).
    }
    setChecked({ network: walletNetwork, dismissed: true });
  };

  const handleSwitch = () => {
    const opened = window.open(FREIGHTER_NETWORK_GUIDE_URL, "_blank");
    if (opened) {
      // Sever the opener reference for security (noopener).
      opened.opener = null;
    } else {
      // Popup was blocked — show inline manual steps instead.
      setShowManualSteps(true);
    }
  };

  if (
    !isWrongNetwork ||
    checked === null ||
    checked.network !== walletNetwork ||
    checked.dismissed
  ) {
    return null;
  }

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
