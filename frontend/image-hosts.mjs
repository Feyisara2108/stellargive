// Remote image hosts that next/image may optimize.
//
// Campaign covers come from campaign metadata: usually an `ipfs://` URI that
// `resolveIpfsUrl` rewrites onto an IPFS gateway, but sometimes any `https://`
// URL. next/image refuses hosts that are not listed in `images.remotePatterns`,
// so without this list every cover fell back to "No Image" (#1051).
//
// Policy:
// - IPFS gateways (the default, ipfs.io, and whatever NEXT_PUBLIC_IPFS_GATEWAY
//   points at) are allow-listed and go through the Next image optimizer.
// - Any other https:// cover is rendered with `unoptimized`: the browser loads
//   it directly (the CSP already allows https: images), and the optimizer is
//   never turned into an open proxy for arbitrary hosts. If it fails to load,
//   the component's onError shows the placeholder.
//
// Shared by next.config.mjs (build time) and the components (runtime), so the
// two can't drift apart.

/** Gateways allowed out of the box; `/ipfs/**` paths only. */
export const DEFAULT_IMAGE_GATEWAYS = ["https://dweb.link/ipfs/", "https://ipfs.io/ipfs/"];

/** Parses a gateway URL into a remotePatterns entry, or null if unusable. */
function gatewayPattern(gateway) {
  let url;
  try {
    url = new URL(gateway);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return {
    protocol: url.protocol.slice(0, -1),
    hostname: url.hostname,
    port: url.port,
    pathname: `${path}**`,
  };
}

/**
 * `images.remotePatterns` for next.config: the default gateways plus the
 * configured `NEXT_PUBLIC_IPFS_GATEWAY`, deduplicated.
 */
export function buildImageRemotePatterns(configuredGateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY) {
  const gateways = [...DEFAULT_IMAGE_GATEWAYS];
  if (configuredGateway && configuredGateway.trim()) gateways.push(configuredGateway.trim());
  const seen = new Set();
  const patterns = [];
  for (const gateway of gateways) {
    const pattern = gatewayPattern(gateway);
    if (!pattern) continue;
    const key = `${pattern.protocol}://${pattern.hostname}:${pattern.port}${pattern.pathname}`;
    if (seen.has(key)) continue;
    seen.add(key);
    patterns.push(pattern);
  }
  return patterns;
}

/**
 * True when `src` matches one of the allow-listed patterns, i.e. next/image
 * may optimize it. Anything else should be rendered `unoptimized`.
 */
export function isOptimizableImageUrl(src, patterns = buildImageRemotePatterns()) {
  let url;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  return patterns.some((p) => {
    if (url.protocol !== `${p.protocol}:`) return false;
    if (url.hostname !== p.hostname) return false;
    if ((p.port || "") !== (url.port || "")) return false;
    const prefix = p.pathname.replace(/\*\*$/, "");
    return url.pathname.startsWith(prefix);
  });
}
