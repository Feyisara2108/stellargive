import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const COINGECKO = "api.coingecko.com";
const STELLAR_EXPERT = "api.stellar.expert";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Routes the stubbed fetch by host so each upstream can fail independently. */
function stubFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    const key = Object.keys(handlers).find((host) => url.includes(host));
    if (!key) throw new Error(`Unexpected fetch: ${url}`);
    return handlers[key]();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The route keeps a module-level cache, so each test gets a fresh copy. */
async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("GET /api/price", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns the CoinGecko price with cache headers, without calling the fallback", async () => {
    const fetchMock = stubFetch({ [COINGECKO]: () => jsonResponse({ stellar: { usd: 0.123 } }) });
    const { GET } = await loadRoute();

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ usd: 0.123, source: "coingecko", stale: false });
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=60");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("revalidates upstream fetches every 60 seconds", async () => {
    const fetchMock = stubFetch({ [COINGECKO]: () => jsonResponse({ stellar: { usd: 0.1 } }) });
    const { GET } = await loadRoute();

    await GET();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ next: { revalidate: 60 } });
  });

  it("serves repeat requests from its cache within 60 seconds", async () => {
    const fetchMock = stubFetch({ [COINGECKO]: () => jsonResponse({ stellar: { usd: 0.1 } }) });
    const { GET } = await loadRoute();

    await GET();
    vi.setSystemTime(new Date("2026-01-01T00:00:59Z"));
    await GET();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-01-01T00:01:01Z"));
    await GET();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to Stellar Expert when CoinGecko is rate limited", async () => {
    stubFetch({
      [COINGECKO]: () => jsonResponse({ error: "rate limited" }, 429),
      [STELLAR_EXPERT]: () => jsonResponse({ price: 0.2 }),
    });
    const { GET } = await loadRoute();

    const body = await (await GET()).json();
    expect(body).toMatchObject({ usd: 0.2, source: "stellar.expert" });
  });

  it("falls back when CoinGecko returns malformed JSON or a non-numeric price", async () => {
    stubFetch({
      [COINGECKO]: () => jsonResponse({ stellar: { usd: "0.12" } }),
      [STELLAR_EXPERT]: () => jsonResponse({ price: 0.3 }),
    });
    const { GET } = await loadRoute();

    expect((await (await GET()).json()).usd).toBe(0.3);
  });

  it("returns 503 with a null price, uncached, when every upstream fails", async () => {
    stubFetch({
      [COINGECKO]: () => Promise.reject(new TypeError("fetch failed")),
      [STELLAR_EXPERT]: () => new Response("{oops", { status: 200 }),
    });
    const { GET } = await loadRoute();

    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ usd: null, error: "Price unavailable" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves the last good price, marked stale, while upstreams are down", async () => {
    let up = true;
    stubFetch({
      [COINGECKO]: () => (up ? jsonResponse({ stellar: { usd: 0.4 } }) : jsonResponse({}, 500)),
      [STELLAR_EXPERT]: () => jsonResponse({}, 503),
    });
    const { GET } = await loadRoute();

    await GET();
    up = false;
    vi.setSystemTime(new Date("2026-01-01T00:05:00Z"));

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ usd: 0.4, stale: true });

    // Past the stale limit it stops pretending.
    vi.setSystemTime(new Date("2026-01-01T01:00:00Z"));
    expect((await GET()).status).toBe(503);
  });
});
