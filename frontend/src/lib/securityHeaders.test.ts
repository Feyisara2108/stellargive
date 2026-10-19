import { describe, it, expect } from "vitest";
import { buildContentSecurityPolicy, buildSecurityHeaders } from "../../security-headers.mjs";

type Header = { key: string; value: string };

function directive(csp: string, name: string): string[] {
  const entry = csp.split("; ").find((d) => d.startsWith(`${name} `) || d === name);
  return entry ? entry.split(" ").slice(1) : [];
}

const PROD = {
  isDev: false,
  rpcUrl: "https://soroban-testnet.stellar.org/rpc",
  sentryDsn: "https://abc123@o42.ingest.us.sentry.io/7",
};

describe("security headers", () => {
  it("sets CSP, clickjacking, referrer, HSTS and permissions headers", () => {
    const keys = (buildSecurityHeaders({ ...PROD, reportOnly: false }) as Header[]).map(
      (h) => h.key,
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        "Content-Security-Policy",
        "X-Frame-Options",
        "Referrer-Policy",
        "Strict-Transport-Security",
        "Permissions-Policy",
        "X-Content-Type-Options",
      ]),
    );
  });

  it("can ship the CSP as report-only", () => {
    const keys = (buildSecurityHeaders({ ...PROD, reportOnly: true }) as Header[]).map(
      (h) => h.key,
    );
    expect(keys).toContain("Content-Security-Policy-Report-Only");
    expect(keys).not.toContain("Content-Security-Policy");
  });

  it("forbids framing the app", () => {
    const csp = buildContentSecurityPolicy(PROD);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    const xfo = (buildSecurityHeaders(PROD) as Header[]).find((h) => h.key === "X-Frame-Options");
    expect(xfo?.value).toBe("DENY");
  });

  it("allows the RPC, Sentry and Stellar APIs but not CoinGecko", () => {
    const connect = directive(buildContentSecurityPolicy(PROD), "connect-src");
    expect(connect).toContain("'self'");
    expect(connect).toContain("https://soroban-testnet.stellar.org");
    expect(connect).toContain("https://o42.ingest.us.sentry.io");
    expect(connect).toContain("https://api.stellar.expert");
    expect(connect.join(" ")).not.toContain("coingecko");
  });

  it("allows IPFS images and the Albedo wallet frame", () => {
    const csp = buildContentSecurityPolicy(PROD);
    expect(directive(csp, "img-src")).toContain("https:");
    expect(directive(csp, "frame-src")).toEqual(["https://albedo.link"]);
  });

  it("only allows eval and HMR websockets in development", () => {
    const prod = buildContentSecurityPolicy(PROD);
    expect(directive(prod, "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(prod, "connect-src")).not.toContain("ws:");
    expect(prod).toContain("upgrade-insecure-requests");

    const dev = buildContentSecurityPolicy({ ...PROD, isDev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("ignores a missing or malformed Sentry DSN", () => {
    const connect = directive(
      buildContentSecurityPolicy({ ...PROD, sentryDsn: "not a url" }),
      "connect-src",
    );
    expect(connect.every((src) => src.length > 0 && src !== "null")).toBe(true);
  });
});
