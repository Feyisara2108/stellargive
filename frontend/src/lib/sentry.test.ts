import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentry);

import {
  captureRpcError,
  captureTransactionError,
  captureUnexpectedError,
  captureRouteError,
  initAnalytics,
  setAnalyticsConsent,
  hasAnalyticsConsent,
} from "./sentry";

const CONSENT_KEY = "stellargive_analytics_consent";

const capturers = [
  ["captureRpcError", captureRpcError, "rpc_call"],
  ["captureTransactionError", captureTransactionError, "transaction"],
  ["captureUnexpectedError", captureUnexpectedError, "unexpected"],
  ["captureRouteError", captureRouteError, "route_render"],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("consent gating", () => {
  it.each(capturers)("%s reports nothing without consent", (_, capture) => {
    capture(new Error("boom"));

    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it.each(capturers)("%s reports nothing when consent was declined", (_, capture) => {
    localStorage.setItem(CONSENT_KEY, "declined");

    capture(new Error("boom"));

    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it.each(capturers)(
    "%s reports with its feature tag once consent is accepted",
    (_, capture, feature) => {
      localStorage.setItem(CONSENT_KEY, "accepted");
      const error = new Error("boom");

      capture(error, { campaignId: "1" });

      expect(sentry.captureException).toHaveBeenCalledWith(error, {
        tags: { feature },
        extra: { campaignId: "1" },
      });
    },
  );
});

describe("expected user errors", () => {
  it.each(["User declined access", "User rejected the request", "Request cancelled", "Rejected"])(
    "never reports '%s', even with consent",
    (message) => {
      localStorage.setItem(CONSENT_KEY, "accepted");

      captureTransactionError(new Error(message));

      expect(sentry.captureException).not.toHaveBeenCalled();
    },
  );
});

describe("client-side analytics initialization", () => {
  it("does not call Sentry.init when consent has not been granted", () => {
    initAnalytics();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("does not call Sentry.init when consent was declined", () => {
    localStorage.setItem(CONSENT_KEY, "declined");
    initAnalytics();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("calls Sentry.init immediately when consent is accepted", () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    initAnalytics();
    expect(sentry.init).toHaveBeenCalledTimes(1);
  });

  it("works with stellargive_consent key", () => {
    localStorage.setItem("stellargive_consent", "accepted");
    initAnalytics();
    expect(sentry.init).toHaveBeenCalledTimes(1);
  });
});

describe("preference changes take effect dynamically", () => {
  it("respects later revocation of consent", () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    captureRpcError(new Error("err1"));
    expect(sentry.captureException).toHaveBeenCalledTimes(1);

    // Later change preference to declined
    localStorage.setItem(CONSENT_KEY, "declined");
    captureRpcError(new Error("err2"));
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("respects later granting of consent", () => {
    localStorage.setItem(CONSENT_KEY, "declined");
    captureRpcError(new Error("err1"));
    expect(sentry.captureException).not.toHaveBeenCalled();

    // Later change preference to accepted
    localStorage.setItem(CONSENT_KEY, "accepted");
    captureRpcError(new Error("err2"));
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("setAnalyticsConsent updates preferences and inits on accept", () => {
    setAnalyticsConsent("accepted");
    expect(localStorage.getItem("stellargive_consent")).toBe("accepted");
    expect(localStorage.getItem("stellargive_analytics_consent")).toBe("accepted");
    expect(sentry.init).toHaveBeenCalledTimes(1);

    setAnalyticsConsent("declined");
    expect(localStorage.getItem("stellargive_consent")).toBe("declined");
    expect(localStorage.getItem("stellargive_analytics_consent")).toBe("declined");
  });
});

describe("client initialization", () => {
  async function loadClientConfig() {
    vi.resetModules();
    await import("../../sentry.client.config");
  }

  it("passes the DSN, environment, and release to Sentry.init", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o0.ingest.sentry.io/1");
    vi.stubEnv("SENTRY_RELEASE", "stellargive@1.2.3");

    await loadClientConfig();

    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://key@o0.ingest.sentry.io/1",
        environment: process.env.NODE_ENV,
        release: "stellargive@1.2.3",
      }),
    );
  });

  it("leaves the DSN unset when none is configured, so the SDK stays disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", undefined);

    await loadClientConfig();

    expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: undefined }));
  });
});
