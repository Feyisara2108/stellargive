import type { BrowserOptions } from "@sentry/nextjs";

const CONSENT_KEY = "stellargive_consent";
const LEGACY_CONSENT_KEY = "stellargive_analytics_consent";

/**
 * Checks if analytics consent has been granted by the user.
 */
export function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  const consent = localStorage.getItem(CONSENT_KEY) ?? localStorage.getItem(LEGACY_CONSENT_KEY);
  return consent === "accepted";
}

type SentryModule = typeof import("@sentry/nextjs");

// The SDK is a separate chunk (about 413 KiB with session replay) that is only
// requested once the visitor has accepted analytics. Every helper below goes
// through this promise, so a capture made while the chunk is still loading
// waits for it and for Sentry.init instead of being dropped.
let sentryModule: Promise<SentryModule> | null = null;

function startSentry(mod: SentryModule, options?: BrowserOptions): void {
  if (mod.getClient()) return;

  // Consent can be revoked after init (another tab, setAnalyticsConsent), so
  // automatically captured events are re-checked before they leave the browser.
  const dropWithoutConsent = <T>(event: T): T | null => (hasAnalyticsConsent() ? event : null);

  mod.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    debug: false,
    environment: process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    beforeSend: dropWithoutConsent,
    beforeSendTransaction: dropWithoutConsent,
    ...options,
  });
}

/** Loads and initialises the SDK, or returns null when there is no consent. */
function loadSentry(options?: BrowserOptions): Promise<SentryModule> | null {
  if (typeof window === "undefined" || !hasAnalyticsConsent()) return null;
  if (!sentryModule) {
    const loading = import("@sentry/nextjs").then((mod) => {
      startSentry(mod, options);
      return mod;
    });
    // A failed chunk load must not stick; the next call tries again.
    loading.catch(() => {
      if (sentryModule === loading) sentryModule = null;
    });
    sentryModule = loading;
  }
  return sentryModule;
}

/** Runs `use` with the SDK once it is ready. A no-op without consent. */
function withSentry(use: (mod: SentryModule) => void): void {
  loadSentry()
    ?.then((mod) => {
      if (hasAnalyticsConsent()) use(mod);
    })
    .catch(() => {
      // Analytics must never break the app.
    });
}

/**
 * Initializes Sentry client-side analytics if user consent has been granted.
 *
 * This is the only client-side Sentry.init call: it runs from
 * `src/instrumentation-client.ts` for returning visitors and from
 * ConsentBanner on Accept. The SDK is loaded lazily here, so visitors who have
 * not accepted never download it. Calling it again once a client exists is a
 * no-op.
 */
export function initAnalytics(options?: BrowserOptions): void {
  loadSentry(options)?.catch(() => {
    // Analytics must never break the app.
  });
}

export const initializeAnalytics = initAnalytics;

/**
 * Updates analytics consent in localStorage and immediately initializes analytics
 * if accepted.
 */
export function setAnalyticsConsent(consent: "accepted" | "declined"): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONSENT_KEY, consent);
  localStorage.setItem(LEGACY_CONSENT_KEY, consent);

  if (consent === "accepted") {
    initAnalytics();
  }
}

/**
 * Checks if the error is an expected user-driven error (e.g. rejecting a wallet prompt).
 */
const isExpectedError = (error: unknown): boolean => {
  if (!error) return false;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);

  const expectedKeywords = [
    "User declined",
    "Rejected",
    "cancelled",
    "user rejected",
    "User rejected",
  ];

  for (const keyword of expectedKeywords) {
    if (message.includes(keyword)) {
      return true;
    }
  }

  return false;
};

export const captureRpcError = (error: unknown, context?: Record<string, unknown>) => {
  if (isExpectedError(error)) return;

  withSentry((mod) =>
    mod.captureException(error, {
      tags: {
        feature: "rpc_call",
      },
      extra: context,
    }),
  );
};

export const captureTransactionError = (error: unknown, context?: Record<string, unknown>) => {
  if (isExpectedError(error)) return;

  withSentry((mod) =>
    mod.captureException(error, {
      tags: {
        feature: "transaction",
      },
      extra: context,
    }),
  );
};

export const captureUnexpectedError = (error: unknown, context?: Record<string, unknown>) => {
  if (isExpectedError(error)) return;

  withSentry((mod) =>
    mod.captureException(error, {
      tags: {
        feature: "unexpected",
      },
      extra: context,
    }),
  );
};

/**
 * Captures render-time errors caught by an App Router route-segment
 * boundary (`app/error.tsx`). `context` should include the pathname and the
 * Next.js error digest so the report can be cross-referenced with the
 * server-side log.
 */
export const captureRouteError = (error: unknown, context?: Record<string, unknown>) => {
  if (isExpectedError(error)) return;

  withSentry((mod) =>
    mod.captureException(error, {
      tags: {
        feature: "route_render",
      },
      extra: context,
    }),
  );
};

/**
 * Tags Sentry events with the connected wallet address, or clears it with
 * `null`. Setting a user needs consent; clearing only touches the SDK if it
 * has already been loaded.
 */
export function setSentryUser(user: { id: string } | null): void {
  if (user) {
    withSentry((mod) => mod.setUser(user));
    return;
  }
  sentryModule
    ?.then((mod) => mod.setUser(null))
    .catch(() => {
      // Analytics must never break the app.
    });
}

/**
 * Reports a client-side router transition to Sentry. Next.js calls this on
 * every navigation, so it never loads the SDK: it only forwards once the
 * visitor has consented and the SDK is already loaded.
 */
export function captureRouterTransitionStart(
  ...args: Parameters<SentryModule["captureRouterTransitionStart"]>
): void {
  sentryModule
    ?.then((mod) => {
      if (hasAnalyticsConsent()) mod.captureRouterTransitionStart(...args);
    })
    .catch(() => {
      // Analytics must never break the app.
    });
}
