import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  getClient: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentry);

// The global test setup (MSW handlers -> logger) imports ./sentry before this file's vi.mock is
// registered, so a static import would keep the real @sentry/nextjs. Drop the module cache and
// import it afresh so it binds to the mock above.
vi.resetModules();
const {
  captureRpcError,
  captureTransactionError,
  captureUnexpectedError,
  captureRouteError,
  initAnalytics,
  setAnalyticsConsent,
} = await import("./sentry");

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

describe("client initialization (instrumentation-client.ts)", () => {
  async function loadClientInstrumentation() {
    vi.resetModules();
    await import("../instrumentation-client");
  }

  it("does not start Sentry before the visitor has consented", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o0.ingest.sentry.io/1");

    await loadClientInstrumentation();

    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("does not start Sentry when consent was declined", async () => {
    localStorage.setItem(CONSENT_KEY, "declined");

    await loadClientInstrumentation();

    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("starts Sentry with the DSN, environment, and release for returning consenters", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o0.ingest.sentry.io/1");
    vi.stubEnv("SENTRY_RELEASE", "stellargive@1.2.3");

    await loadClientInstrumentation();

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
    localStorage.setItem(CONSENT_KEY, "accepted");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", undefined);

    await loadClientInstrumentation();

    expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: undefined }));
  });

  it("exports the router transition hook Next.js calls on navigation", async () => {
    vi.resetModules();
    const mod = await import("../instrumentation-client");

    expect(mod.onRouterTransitionStart).toBe(sentry.captureRouterTransitionStart);
  });
});

describe("after initialization", () => {
  it("does not initialise twice once a client exists", () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    sentry.getClient.mockReturnValueOnce({});

    initAnalytics();

    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("drops automatically captured events once consent is revoked", () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    initAnalytics();
    const { beforeSend, beforeSendTransaction } = sentry.init.mock.calls[0][0];
    const event = { message: "boom" };

    expect(beforeSend(event)).toBe(event);
    expect(beforeSendTransaction(event)).toBe(event);

    localStorage.setItem(CONSENT_KEY, "declined");
    localStorage.setItem("stellargive_consent", "declined");

    expect(beforeSend(event)).toBeNull();
    expect(beforeSendTransaction(event)).toBeNull();
  });
});
