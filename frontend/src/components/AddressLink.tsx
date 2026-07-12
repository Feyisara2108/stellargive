"use client";

import { useCallback, useState } from "react";
import { ExternalLink, Copy, Check } from "lucide-react";
import { formatAddress } from "@/utils/format";
import { useResolvedName } from "@/hooks/useSoroban";
import { toast } from "sonner";

type AddressLinkProps = {
  address: string;
  network?: "testnet" | "public";
  className?: string;
};

export function AddressLink({ address, network = "testnet", className }: AddressLinkProps) {
  const [copied, setCopied] = useState(false);
  const href = `https://stellar.expert/explorer/${network}/account/${address}`;
  const { data: resolvedName } = useResolvedName(address);

  const displayText = resolvedName || formatAddress(address);

  const handleCopy = useCallback(
    async (e: React.MouseEvent | React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        toast.success("Address copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error("Failed to copy address");
      }
    },
    [address],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      handleCopy(e);
    }
  };

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`.trim()}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 hover:text-primary transition-colors"
        title={address}
      >
        <span className={resolvedName ? "" : "font-mono"}>{displayText}</span>
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
      <button
        type="button"
        onClick={handleCopy}
        onKeyDown={handleKeyDown}
        className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Copy address to clipboard`}
        title="Copy address"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
