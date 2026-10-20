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

/**
 * Stored as `metadata_uri` when a campaign is created without an image (#1075).
 * The contract only accepts `https://` or `ipfs://` URIs, so this uses the
 * reserved `.invalid` TLD (RFC 2606): it passes validation, is unmistakable on
 * chain, and can never resolve to a real host.
 */
export const NO_IMAGE_METADATA_URI = "https://stellargive.invalid/no-image";

/** Placeholders written by older frontends before NO_IMAGE_METADATA_URI existed. */
const LEGACY_PLACEHOLDER_URIS = new Set(["https://example.com", "https://example.com/"]);

/** True when `uri` is a "no image" placeholder rather than a real image location. */
export function isPlaceholderMetadataUri(uri?: string): boolean {
  if (!uri) return true;
  const value = uri.trim();
  return value === NO_IMAGE_METADATA_URI || LEGACY_PLACEHOLDER_URIS.has(value);
}

/**
 * Public gateway used when `NEXT_PUBLIC_IPFS_GATEWAY` is unset. dweb.link is
 * the IPFS Foundation's public gateway; operators can point this at their own
 * pinned gateway without a code change.
 */
export const DEFAULT_IPFS_GATEWAY = "https://dweb.link/ipfs/";

function ipfsGateway(): string {
  const configured = process.env.NEXT_PUBLIC_IPFS_GATEWAY?.trim();
  const gateway = configured || DEFAULT_IPFS_GATEWAY;
  return gateway.endsWith("/") ? gateway : `${gateway}/`;
}

/**
 * Resolve a metadata URI to a browser-loadable URL.
 *
 * This is the only place that understands `ipfs://`: it rewrites the scheme
 * onto the configured gateway and passes `http(s)://` through unchanged.
 * Anything else (or an empty value) has no usable image URL.
 */
export function resolveIpfsUrl(uri?: string): string | undefined {
  if (!uri) return undefined;

  const value = uri.trim();
  if (!value) return undefined;

  if (value.startsWith("ipfs://")) {
    const path = value.slice("ipfs://".length).replace(/^ipfs\//, "");
    if (!path) return undefined;
    return `${ipfsGateway()}${path}`;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return undefined;
}

export function getCampaignImageUrl(uri?: string) {
  if (!uri || isPlaceholderMetadataUri(uri)) return undefined;
  return resolveIpfsUrl(uri);
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
