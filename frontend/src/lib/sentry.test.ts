import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  getClient: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
  setUser: vi.fn(),
  // Called each time the (mocked) SDK module is evaluated, so tests can tell
  // whether the lazy chunk was ever requested.
  sdkLoaded: vi.fn(),
}));

const CONSENT_KEY = "stellargive_analytics_consent";

type SentryLib = typeof import("./sentry");
let lib: SentryLib;

/** Lets pending promise callbacks (the lazy import and its `then`s) run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  // Each test gets a fresh module so the lazily loaded SDK promise starts empty,
  // and a fresh mock factory so `sdkLoaded` counts only that test's loads.
  vi.resetModules();
  vi.doMock("@sentry/nextjs", () => {
    sentry.sdkLoaded();
    return sentry;
  });
  lib = await import("./sentry");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const capturers = [
  ["captureRpcError", "rpc_call"],
  ["captureTransactionError", "transaction"],
  ["captureUnexpectedError", "unexpected"],
  ["captureRouteError", "route_render"],
] as const;

describe("consent gating", () => {
  it.each(capturers)("%s reports nothing and never loads the SDK without consent", async (name) => {
    lib[name](new Error("boom"));
    await flush();

    expect(sentry.sdkLoaded).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it.each(capturers)("%s reports nothing when consent was declined", async (name) => {
    localStorage.setItem(CONSENT_KEY, "declined");

    lib[name](new Error("boom"));
    await flush();

    expect(sentry.sdkLoaded).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it.each(capturers)(
    "%s loads the SDK and reports with its feature tag once consent is accepted",
    async (name, feature) => {
      localStorage.setItem(CONSENT_KEY, "accepted");
      const error = new Error("boom");

      lib[name](error, { campaignId: "1" });

      await vi.waitFor(() =>
        expect(sentry.captureException).toHaveBeenCalledWith(error, {
          tags: { feature },
          extra: { campaignId: "1" },
        }),
      );
      expect(sentry.sdkLoaded).toHaveBeenCalledTimes(1);
    },
  );

  it("initialises the SDK before delivering a capture made while it was still loading", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");

    lib.captureRpcError(new Error("first"));
    lib.captureTransactionError(new Error("second"));

    await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledTimes(2));
    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(sentry.init.mock.invocationCallOrder[0]).toBeLessThan(
      sentry.captureException.mock.invocationCallOrder[0],
    );
    expect(sentry.sdkLoaded).toHaveBeenCalledTimes(1);
  });

  it("drops a queued capture if consent is revoked before the SDK finishes loading", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");

    lib.captureRpcError(new Error("boom"));
    localStorage.setItem(CONSENT_KEY, "declined");
    await flush();

    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});

describe("expected user errors", () => {
  it.each(["User declined access", "User rejected the request", "Request cancelled", "Rejected"])(
    "never reports '%s', even with consent",
    async (message) => {
      localStorage.setItem(CONSENT_KEY, "accepted");

      lib.captureTransactionError(new Error(message));
      await flush();

      expect(sentry.sdkLoaded).not.toHaveBeenCalled();
      expect(sentry.captureException).not.toHaveBeenCalled();
    },
  );
});

describe("client-side analytics initialization", () => {
  it("does not load the SDK or call Sentry.init when consent has not been granted", async () => {
    lib.initAnalytics();
    await flush();

    expect(sentry.sdkLoaded).not.toHaveBeenCalled();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("does not load the SDK or call Sentry.init when consent was declined", async () => {
    localStorage.setItem(CONSENT_KEY, "declined");

    lib.initAnalytics();
    await flush();

    expect(sentry.sdkLoaded).not.toHaveBeenCalled();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("loads the SDK and calls Sentry.init when consent is accepted", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");

    lib.initAnalytics();

    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(1));
  });

  it("works with stellargive_consent key", async () => {
    localStorage.setItem("stellargive_consent", "accepted");

    lib.initAnalytics();

    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(1));
  });

  it("loads the SDK and initialises it only once across repeated calls", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");

    lib.initAnalytics();
    lib.initAnalytics();
    lib.initializeAnalytics();

    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(1));
    await flush();
    expect(sentry.sdkLoaded).toHaveBeenCalledTimes(1);
    expect(sentry.init).toHaveBeenCalledTimes(1);
  });
});

describe("preference changes take effect dynamically", () => {
  it("respects later revocation of consent", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    lib.captureRpcError(new Error("err1"));
    await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledTimes(1));

    // Later change preference to declined
    localStorage.setItem(CONSENT_KEY, "declined");
    lib.captureRpcError(new Error("err2"));
    await flush();

    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("respects later granting of consent", async () => {
    localStorage.setItem(CONSENT_KEY, "declined");
    lib.captureRpcError(new Error("err1"));
    await flush();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.sdkLoaded).not.toHaveBeenCalled();

    // Later change preference to accepted
    localStorage.setItem(CONSENT_KEY, "accepted");
    lib.captureRpcError(new Error("err2"));

    await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledTimes(1));
  });

  it("setAnalyticsConsent updates preferences and inits on accept", async () => {
    lib.setAnalyticsConsent("accepted");
    expect(localStorage.getItem("stellargive_consent")).toBe("accepted");
    expect(localStorage.getItem("stellargive_analytics_consent")).toBe("accepted");
    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(1));

    lib.setAnalyticsConsent("declined");
    expect(localStorage.getItem("stellargive_consent")).toBe("declined");
    expect(localStorage.getItem("stellargive_analytics_consent")).toBe("declined");
  });

  it("setAnalyticsConsent does not load the SDK when declined", async () => {
    lib.setAnalyticsConsent("declined");
    await flush();

    expect(sentry.sdkLoaded).not.toHaveBeenCalled();
  });
});

describe("setSentryUser", () => {
  it("does nothing and never loads the SDK without consent", async () => {
    lib.setSentryUser({ id: "GABC" });
    await flush();

    expect(sentry.sdkLoaded).not.toHaveBeenCalled();
    expect(sentry.setUser).not.toHaveBeenCalled();
  });

  it("sets the user once the SDK is ready when consent was accepted", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");

    lib.setSentryUser({ id: "GABC" });

    await vi.waitFor(() => expect(sentry.setUser).toHaveBeenCalledWith({ id: "GABC" }));
    expect(sentry.init.mock.invocationCallOrder[0]).toBeLessThan(
      sentry.setUser.mock.invocationCallOrder[0],
    );
  });

  it("does not load the SDK just to clear the user", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");

    lib.setSentryUser(null);
    await flush();

    expect(sentry.sdkLoaded).not.toHaveBeenCalled();
    expect(sentry.setUser).not.toHaveBeenCalled();
  });

  it("clears the user when the SDK is already loaded", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    lib.setSentryUser({ id: "GABC" });
    await vi.waitFor(() => expect(sentry.setUser).toHaveBeenCalledTimes(1));

    lib.setSentryUser(null);

    await vi.waitFor(() => expect(sentry.setUser).toHaveBeenLastCalledWith(null));
  });
});

describe("client initialization (instrumentation-client.ts)", () => {
  async function loadClientInstrumentation() {
    vi.resetModules();
    return import("../instrumentation-client");
  }

  it("does not load or start Sentry before the visitor has consented", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o0.ingest.sentry.io/1");

    await loadClientInstrumentation();
    await flush();

    expect(sentry.sdkLoaded).not.toHaveBeenCalled();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("does not load or start Sentry when consent was declined", async () => {
    localStorage.setItem(CONSENT_KEY, "declined");

    await loadClientInstrumentation();
    await flush();

    expect(sentry.sdkLoaded).not.toHaveBeenCalled();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("starts Sentry with the DSN, environment, and release for returning consenters", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o0.ingest.sentry.io/1");
    vi.stubEnv("SENTRY_RELEASE", "stellargive@1.2.3");

    await loadClientInstrumentation();

    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(1));
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

    await vi.waitFor(() =>
      expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: undefined })),
    );
  });

  it("exports a router transition hook that does not load the SDK without consent", async () => {
    const mod = await loadClientInstrumentation();

    expect(mod.onRouterTransitionStart).toBeTypeOf("function");
    mod.onRouterTransitionStart("/explore", "push");
    await flush();

    expect(sentry.sdkLoaded).not.toHaveBeenCalled();
    expect(sentry.captureRouterTransitionStart).not.toHaveBeenCalled();
  });

  it("forwards router transitions to Sentry once it is loaded and consent is held", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    const mod = await loadClientInstrumentation();
    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(1));

    mod.onRouterTransitionStart("/explore", "push");

    await vi.waitFor(() =>
      expect(sentry.captureRouterTransitionStart).toHaveBeenCalledWith("/explore", "push"),
    );
  });

  it("stops forwarding router transitions after consent is revoked", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    const mod = await loadClientInstrumentation();
    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(1));

    localStorage.setItem(CONSENT_KEY, "declined");
    localStorage.setItem("stellargive_consent", "declined");
    mod.onRouterTransitionStart("/explore", "push");
    await flush();

    expect(sentry.captureRouterTransitionStart).not.toHaveBeenCalled();
  });
});

describe("after initialization", () => {
  it("does not initialise twice once a client exists", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    sentry.getClient.mockReturnValueOnce({});

    lib.initAnalytics();
    await vi.waitFor(() => expect(sentry.getClient).toHaveBeenCalled());
    await flush();

    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("drops automatically captured events once consent is revoked", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    lib.initAnalytics();
    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(1));
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
