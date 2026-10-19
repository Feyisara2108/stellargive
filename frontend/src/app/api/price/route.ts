import { NextResponse } from "next/server";

/**
 * XLM/USD price proxy. Browsers call this instead of CoinGecko directly, so
 * visitor IPs aren't shared with a third party and every visitor behind a shared
 * network doesn't count against CoinGecko's rate limit separately.
 */

const REVALIDATE_SECONDS = 60;
/** If every upstream is failing, keep serving the last good price for this long. */
const MAX_STALE_MS = 30 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 5_000;

const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd";
const STELLAR_EXPERT_URL = "https://api.stellar.expert/explorer/directory/price?asset=XLM";

type CachedPrice = { usd: number; source: string; fetchedAt: number };

// Per-instance cache in front of the upstream fetches. `next.revalidate` on the
// fetches also shares results across instances through Next's data cache.
let cached: CachedPrice | null = null;

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  return res.json();
}

async function fromCoinGecko(): Promise<number | null> {
  const data = (await fetchJson(COINGECKO_URL)) as { stellar?: { usd?: unknown } } | null;
  const usd = data?.stellar?.usd;
  return typeof usd === "number" && usd > 0 ? usd : null;
}

async function fromStellarExpert(): Promise<number | null> {
  const data = (await fetchJson(STELLAR_EXPERT_URL)) as { price?: unknown } | null;
  const usd = data?.price;
  return typeof usd === "number" && usd > 0 ? usd : null;
}

const SOURCES: Array<[string, () => Promise<number | null>]> = [
  ["coingecko", fromCoinGecko],
  ["stellar.expert", fromStellarExpert],
];

async function fetchUpstreamPrice(): Promise<CachedPrice | null> {
  for (const [source, fetchPrice] of SOURCES) {
    try {
      const usd = await fetchPrice();
      if (usd !== null) return { usd, source, fetchedAt: Date.now() };
    } catch {
      // Try the next source.
    }
  }
  return null;
}

function priceResponse(price: CachedPrice, stale: boolean) {
  return NextResponse.json(
    {
      usd: price.usd,
      source: price.source,
      updatedAt: new Date(price.fetchedAt).toISOString(),
      stale,
    },
    {
      headers: {
        // Stale fallbacks are cached briefly so recovery shows up quickly.
        "Cache-Control": stale
          ? "public, max-age=10, s-maxage=10"
          : `public, max-age=${REVALIDATE_SECONDS}, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=300`,
      },
    },
  );
}

export async function GET() {
  if (cached && Date.now() - cached.fetchedAt < REVALIDATE_SECONDS * 1000) {
    return priceResponse(cached, false);
  }

  const fresh = await fetchUpstreamPrice();
  if (fresh) {
    cached = fresh;
    return priceResponse(fresh, false);
  }

  if (cached && Date.now() - cached.fetchedAt < MAX_STALE_MS) {
    return priceResponse(cached, true);
  }

  return NextResponse.json(
    { usd: null, error: "Price unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
