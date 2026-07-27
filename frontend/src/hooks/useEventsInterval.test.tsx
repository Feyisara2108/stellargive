import { describe, it, expect, afterEach } from "vitest";

// The interval callback is pure apart from reading `document.hidden`, so it is
// exercised directly instead of through a rendered query (#541).
import {
  eventsRefetchInterval,
  EVENTS_POLL_INTERVAL_MS,
  EVENTS_MAX_BACKOFF_MS,
} from "./useSoroban";

/** Minimal stand-in for the query object react-query hands the callback. */
function queryState(status: string, fetchFailureCount = 0) {
  return { state: { status, fetchFailureCount } };
}

/** jsdom's `document.hidden` is read-only, so override the descriptor. */
function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
}

afterEach(() => {
  setHidden(false);
});

describe("eventsRefetchInterval — paused while the tab is hidden", () => {
  it("returns false when the document is hidden", () => {
    setHidden(true);
    expect(eventsRefetchInterval(queryState("success"))).toBe(false);
  });

  it("stays paused even when the query is erroring", () => {
    setHidden(true);
    expect(eventsRefetchInterval(queryState("error", 3))).toBe(false);
  });

  it("resumes the steady interval once the tab is visible again", () => {
    setHidden(true);
    expect(eventsRefetchInterval(queryState("success"))).toBe(false);

    setHidden(false);
    expect(eventsRefetchInterval(queryState("success"))).toBe(EVENTS_POLL_INTERVAL_MS);
  });
});

describe("eventsRefetchInterval — steady state", () => {
  it("polls every 10s for a successful query", () => {
    expect(eventsRefetchInterval(queryState("success"))).toBe(10_000);
  });

  it("polls every 10s while the query is still pending", () => {
    expect(eventsRefetchInterval(queryState("pending"))).toBe(10_000);
  });

  it("ignores a stale failure count once the query is no longer erroring", () => {
    // fetchFailureCount can linger after a recovery; only `status` decides.
    expect(eventsRefetchInterval(queryState("success", 5))).toBe(EVENTS_POLL_INTERVAL_MS);
  });
});

describe("eventsRefetchInterval — exponential backoff on error", () => {
  it.each([
    [0, 10_000],
    [1, 20_000],
    [2, 40_000],
  ])("backs off to %ims after %i failures", (failures, expected) => {
    expect(eventsRefetchInterval(queryState("error", failures))).toBe(expected);
  });

  it("doubles the interval with each additional failure below the cap", () => {
    const first = eventsRefetchInterval(queryState("error", 0)) as number;
    const second = eventsRefetchInterval(queryState("error", 1)) as number;
    expect(second).toBe(first * 2);
  });
});

describe("eventsRefetchInterval — backoff cap", () => {
  it("caps at 60s once doubling would exceed it", () => {
    // 10_000 * 2^3 = 80_000, above the cap.
    expect(eventsRefetchInterval(queryState("error", 3))).toBe(EVENTS_MAX_BACKOFF_MS);
  });

  it("holds the cap for large failure counts", () => {
    for (const failures of [4, 10, 50, 100]) {
      expect(eventsRefetchInterval(queryState("error", failures))).toBe(60_000);
    }
  });

  it("never returns a non-finite interval, even for absurd failure counts", () => {
    // Math.pow(2, 1024) is Infinity; the cap has to absorb it.
    const interval = eventsRefetchInterval(queryState("error", 1024)) as number;
    expect(Number.isFinite(interval)).toBe(true);
    expect(interval).toBe(EVENTS_MAX_BACKOFF_MS);
  });
});
