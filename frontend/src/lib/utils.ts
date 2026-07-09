import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculateProgress(raised: bigint, target: bigint): number {
  if (target === 0n) return 0;
  const progress = Number((raised * 100n) / target);
  return Math.min(progress, 100);
}

export function getCampaignImageUrl(uri?: string) {
  if (!uri) return undefined;
  if (uri.startsWith("http")) return uri;
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.replace("ipfs://", "")}`;
  return undefined;
}

export function getStellarExpertTxUrl(txHash: string): string {
  const passphrase = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? "";
  const network = passphrase.startsWith("Public Global") ? "mainnet" : "testnet";
  return `https://stellar.expert/explorer/${network}/tx/${txHash}`;
}
