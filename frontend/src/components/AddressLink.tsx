"use client";

import { ExternalLink } from "lucide-react";
import { formatAddress } from "@/utils/format";
import { useResolvedName } from "@/hooks/useSoroban";

type AddressLinkProps = {
  address: string;
  network?: "testnet" | "public";
  className?: string;
};

export function AddressLink({ address, network = "testnet", className }: AddressLinkProps) {
  const href = `https://stellar.expert/explorer/${network}/account/${address}`;
  const { data: resolvedName } = useResolvedName(address);

  // Use resolved name if available, otherwise fall back to truncated address
  const displayText = resolvedName || formatAddress(address);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 hover:text-primary transition-colors ${className ?? ""}`.trim()}
      title={address}
    >
      <span className={resolvedName ? "" : "font-mono"}>{displayText}</span>
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  );
}
