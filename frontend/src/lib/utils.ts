import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Shared blur placeholder for campaign images.
 * A minimal grey SVG encoded as a base64 data URL — avoids duplicating the
 * string in every component and keeps bundle size identical.
 */
export const CAMPAIGN_IMAGE_BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzAwIiBoZWlnaHQ9IjQ3NSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNzAwIiBoZWlnaHQ9IjQ3NSIgZmlsbD0iI2UwZTBlMCIvPjwvc3ZnPg==";

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

export function absoluteUrl(path: string) {
  if (path.startsWith("http")) return path;
  if (typeof window !== "undefined") return `${window.location.origin}${path}`;
  if (process.env.NEXT_PUBLIC_APP_URL) return `${process.env.NEXT_PUBLIC_APP_URL}${path}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}${path}`;
  return `http://localhost:${process.env.PORT ?? 3000}${path}`;
}
