"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Globe, Loader2, Puzzle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WALLETS, isWalletAvailable, type WalletId } from "@/lib/wallet";

interface WalletPickerProps {
  open: boolean;
  /** Connects the chosen wallet; a rejection is shown inline so the user can retry. */
  onSelect: (id: WalletId) => Promise<void>;
  onClose: () => void;
}

/** Lets the user choose which Stellar wallet to connect. Rendered by WalletProvider. */
export function WalletPicker({ open, onSelect, onClose }: WalletPickerProps) {
  const [available, setAvailable] = useState<Partial<Record<WalletId, boolean>>>({});
  const [pending, setPending] = useState<WalletId | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Extensions inject their APIs after page load, so re-check every time it opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    let cancelled = false;
    // Update each wallet as its probe settles so a slow one doesn't hold up the rest.
    for (const w of WALLETS) {
      isWalletAvailable(w.id).then((isAvailable) => {
        if (!cancelled) setAvailable((prev) => ({ ...prev, [w.id]: isAvailable }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [open]);

  const choose = async (id: WalletId) => {
    setPending(id);
    setError(null);
    try {
      await onSelect(id);
    } catch (e) {
      const name = WALLETS.find((w) => w.id === id)?.name ?? "The wallet";
      setError(
        e instanceof Error && e.message
          ? `${name}: ${e.message}`
          : `${name} didn't connect. Please try again.`,
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Connect a wallet</DialogTitle>
          <DialogDescription>Choose the Stellar wallet you want to use.</DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-2">
          {WALLETS.map((wallet) => {
            const isAvailable = available[wallet.id];
            const Icon = wallet.kind === "web" ? Globe : Puzzle;
            return (
              <li key={wallet.id} className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 justify-start gap-3"
                  disabled={pending !== null || isAvailable === false}
                  onClick={() => choose(wallet.id)}
                >
                  {pending === wallet.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="font-medium">{wallet.name}</span>
                  {wallet.kind === "web" && (
                    <span className="ml-auto text-xs text-muted-foreground">No install needed</span>
                  )}
                </Button>
                {isAvailable === false && (
                  <a
                    href={wallet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    aria-label={`Install ${wallet.name}`}
                  >
                    Install
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
