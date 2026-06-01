"use client";

import { ExternalLink } from "lucide-react";
import { formatAddress } from "@/utils/format";

type AddressLinkProps = {
  address: string;
  network?: "testnet" | "public";
  className?: string;
};

export function AddressLink({ address, network = "testnet", className }: AddressLinkProps) {
  const href = `https://stellar.expert/explorer/${network}/account/${address}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 hover:text-primary transition-colors ${className ?? ""}`.trim()}
      title={address}
    >
      <span className="font-mono">{formatAddress(address)}</span>
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  );
}
