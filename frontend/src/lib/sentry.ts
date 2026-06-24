import * as Sentry from "@sentry/nextjs";

/**
 * Checks if the error is an expected user-driven error (e.g. rejecting a wallet prompt).
 */
const isExpectedError = (error: any): boolean => {
  if (!error) return false;
  const message = error?.message || error?.toString() || "";

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

export const captureRpcError = (error: any, context?: Record<string, any>) => {
  if (isExpectedError(error)) return;

  Sentry.captureException(error, {
    tags: {
      feature: "rpc_call",
    },
    extra: context,
  });
};

export const captureTransactionError = (error: any, context?: Record<string, any>) => {
  if (isExpectedError(error)) return;

  Sentry.captureException(error, {
    tags: {
      feature: "transaction",
    },
    extra: context,
  });
};

export const captureUnexpectedError = (error: any, context?: Record<string, any>) => {
  if (isExpectedError(error)) return;

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
export const captureRouteError = (error: any, context?: Record<string, any>) => {
  if (isExpectedError(error)) return;

  Sentry.captureException(error, {
    tags: {
      feature: "route_render",
    },
    extra: context,
  });
};
