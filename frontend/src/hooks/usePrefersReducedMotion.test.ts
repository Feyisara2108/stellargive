import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

type Listener = (e: MediaQueryListEvent) => void;

function mockMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const mq = {
    matches: initial,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: vi.fn((_: string, cb: Listener) => listeners.add(cb)),
    removeEventListener: vi.fn((_: string, cb: Listener) => listeners.delete(cb)),
  };
  const matchMedia = vi.fn(() => mq);
  vi.stubGlobal("matchMedia", matchMedia);

  const change = (matches: boolean) => {
    mq.matches = matches;
    listeners.forEach((cb) => cb({ matches } as MediaQueryListEvent));
  };

  return { mq, matchMedia, listeners, change };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePrefersReducedMotion", () => {
  it("queries the reduced-motion media feature", () => {
    const { matchMedia } = mockMatchMedia(false);

    renderHook(() => usePrefersReducedMotion());

    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  it("returns false when the user has no reduced-motion preference", () => {
    mockMatchMedia(false);

    const { result } = renderHook(() => usePrefersReducedMotion());

    expect(result.current).toBe(false);
  });

  it("detects an initial reduced-motion preference", () => {
    mockMatchMedia(true);

    const { result } = renderHook(() => usePrefersReducedMotion());

    expect(result.current).toBe(true);
  });

  it("updates when the preference is turned on", () => {
    const { change } = mockMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());

    act(() => change(true));

    expect(result.current).toBe(true);
  });

  it("updates when the preference is turned off", () => {
    const { change } = mockMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());

    act(() => change(false));

    expect(result.current).toBe(false);
  });

  it("removes the same listener it added on unmount", () => {
    const { mq, listeners } = mockMatchMedia(false);
    const { unmount } = renderHook(() => usePrefersReducedMotion());

    expect(mq.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    const added = mq.addEventListener.mock.calls[0][1];

    unmount();

    expect(mq.removeEventListener).toHaveBeenCalledWith("change", added);
    expect(listeners.size).toBe(0);
  });

  it("ignores media query changes after unmount", () => {
    const { change } = mockMatchMedia(false);
    const { result, unmount } = renderHook(() => usePrefersReducedMotion());

    unmount();
    change(true);

    expect(result.current).toBe(false);
  });
});
