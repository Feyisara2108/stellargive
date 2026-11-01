import { captureUnexpectedError } from "@/lib/sentry";

const isProduction = process.env.NODE_ENV === "production";

function toError(value: unknown, details: unknown[]): Error {
  if (value instanceof Error) return value;
  const nestedError = details.find((detail): detail is Error => detail instanceof Error);
  return (
    nestedError ?? new Error(typeof value === "string" ? value : String(value ?? "Unknown error"))
  );
}

export const logger = {
  debug(...args: unknown[]) {
    if (!isProduction) console.debug(...args);
  },

  warn(...args: unknown[]) {
    if (!isProduction) console.warn(...args);
  },

  error(...args: unknown[]) {
    const [message, ...details] = args;
    const error = toError(message, details);
    captureUnexpectedError(error, {
      message: typeof message === "string" ? message : undefined,
      details: details.filter((detail) => detail !== error).map(String),
    });
    if (!isProduction) console.error(...args);
  },
};
