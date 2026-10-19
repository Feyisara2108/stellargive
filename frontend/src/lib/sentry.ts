import * as Sentry from "@sentry/nextjs";

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

/**
 * Initializes Sentry client-side analytics if user consent has been granted.
 *
 * This is the only client-side Sentry.init call: it runs from
 * `src/instrumentation-client.ts` for returning visitors and from
 * ConsentBanner on Accept. Calling it again once a client exists is a no-op.
 */
export function initAnalytics(options?: Sentry.BrowserOptions): void {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;
  if (Sentry.getClient()) return;

  // Consent can be revoked after init (another tab, setAnalyticsConsent), so
  // automatically captured events are re-checked before they leave the browser.
  const dropWithoutConsent = <T>(event: T): T | null => (hasAnalyticsConsent() ? event : null);

  Sentry.init({
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
  if (isExpectedError(error) || !hasAnalyticsConsent()) return;

  Sentry.captureException(error, {
    tags: {
      feature: "rpc_call",
    },
    extra: context,
  });
};

export const captureTransactionError = (error: unknown, context?: Record<string, unknown>) => {
  if (isExpectedError(error) || !hasAnalyticsConsent()) return;

  Sentry.captureException(error, {
    tags: {
      feature: "transaction",
    },
    extra: context,
  });
};

export const captureUnexpectedError = (error: unknown, context?: Record<string, unknown>) => {
  if (isExpectedError(error) || !hasAnalyticsConsent()) return;

  Sentry.captureException(error, {
    tags: {
      feature: "unexpected",
    },
    extra: context,
  });
};

/**
 * Captures render-time errors caught by an App Router route-segment
 * boundary (`app/error.tsx`). `context` should include the pathname and the
 * Next.js error digest so the report can be cross-referenced with the
 * server-side log.
 */
export const captureRouteError = (error: unknown, context?: Record<string, unknown>) => {
  if (isExpectedError(error) || !hasAnalyticsConsent()) return;

  Sentry.captureException(error, {
    tags: {
      feature: "route_render",
    },
    extra: context,
  });
};
