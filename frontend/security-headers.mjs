// Security headers applied to every route via `headers()` in next.config.mjs.
//
// The CSP allowlist is built from what the app actually talks to:
//   - the Soroban RPC (NEXT_PUBLIC_SOROBAN_RPC_URL)
//   - Horizon + Stellar Expert (account display-name lookups in soroban.ts)
//   - Sentry's ingest host (from NEXT_PUBLIC_SENTRY_DSN)
//   - campaign images (IPFS gateway / arbitrary https metadata URIs)
//   - Albedo, whose intent library talks to albedo.link through a hidden iframe
//     (its popup needs the same-origin-allow-popups COOP below to reply)
// The XLM price is fetched from this app's own /api/price route, so CoinGecko
// doesn't appear here.
//
// Set CSP_REPORT_ONLY=true to ship the policy as Content-Security-Policy-Report-Only
// while validating a new origin, without blocking anything.

/** `https://host:port` for a URL, or null if it's missing/invalid. */
function originOf(url) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * @param {{ isDev?: boolean, rpcUrl?: string, sentryDsn?: string }} [opts]
 */
export function buildContentSecurityPolicy({
  isDev = process.env.NODE_ENV !== "production",
  rpcUrl = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || "http://localhost:8000/rpc",
  sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN,
} = {}) {
  const connectSrc = [
    "'self'",
    originOf(rpcUrl),
    "https://horizon.stellar.org",
    "https://horizon-testnet.stellar.org",
    "https://api.stellar.expert",
    originOf(sentryDsn),
    // Next's dev server pushes HMR updates over a websocket.
    ...(isDev ? ["ws:", "wss:"] : []),
  ].filter(Boolean);

  const directives = {
    "default-src": ["'self'"],
    // Next.js inlines its bootstrap/hydration scripts; dev mode (React Refresh)
    // additionally needs eval.
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // next-themes and Radix inject inline styles.
    "style-src": ["'self'", "'unsafe-inline'"],
    // Campaign images come from IPFS gateways or any https metadata URI.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": [...new Set(connectSrc)],
    "frame-src": ["https://albedo.link"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    // Nobody may frame the app: it asks users to sign transactions, so this
    // blocks clickjacking. X-Frame-Options below covers older browsers.
    "frame-ancestors": ["'none'"],
  };

  const policy = Object.entries(directives).map(
    ([directive, sources]) => `${directive} ${sources.join(" ")}`,
  );
  if (!isDev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/**
 * @param {{ isDev?: boolean, reportOnly?: boolean, rpcUrl?: string, sentryDsn?: string }} [opts]
 * @returns {{ key: string, value: string }[]}
 */
export function buildSecurityHeaders({
  reportOnly = process.env.CSP_REPORT_ONLY === "true",
  ...cspOpts
} = {}) {
  return [
    {
      key: reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
      value: buildContentSecurityPolicy(cspOpts),
    },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Browsers ignore HSTS on plain-http origins, so it's harmless locally.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    {
      key: "Permissions-Policy",
      // Ledger/Trezor-style wallets would need `usb`/`hid`; none are enabled today.
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
}
