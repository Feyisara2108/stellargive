import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "./useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Initial state ────────────────────────────────────────────────────────

  it("returns the initial value immediately without waiting for the delay", () => {
    const { result } = renderHook(() => useDebouncedValue("hello", 300));
    expect(result.current).toBe("hello");
  });

  // ── Delay enforcement ────────────────────────────────────────────────────

  it("does not update the value before the full delay has elapsed", () => {
    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useDebouncedValue(v, 300),
      { initialProps: { v: "first" } },
    );

    rerender({ v: "second" });

    act(() => {
      vi.advanceTimersByTime(299);
    });

    expect(result.current).toBe("first");
  });

  it("updates the value exactly when the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useDebouncedValue(v, 300),
      { initialProps: { v: "first" } },
    );

    rerender({ v: "second" });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe("second");
  });

  it("does not update between 0 ms and the delay boundary", () => {
    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useDebouncedValue(v, 500),
      { initialProps: { v: "a" } },
    );

    rerender({ v: "b" });

    // One ms short of the delay — still stale
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current).toBe("a");

    // Cross the boundary — now fresh
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("b");
  });

  // ── Timer reset on rapid changes ─────────────────────────────────────────

  it("resets the timer when the value changes before the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useDebouncedValue(v, 300),
      { initialProps: { v: "a" } },
    );

    // First change starts a 300 ms timer
    rerender({ v: "b" });
    act(() => { vi.advanceTimersByTime(200); }); // 200 ms — timer still pending

    // Second change cancels the first timer and starts a new 300 ms one
    rerender({ v: "c" });
    act(() => { vi.advanceTimersByTime(100); }); // only 100 ms since "c" was set

    expect(result.current).toBe("a"); // neither "b" nor "c" should have landed

    act(() => { vi.advanceTimersByTime(200); }); // total 300 ms since "c"
    expect(result.current).toBe("c"); // "b" was cancelled; "c" wins
  });

  it("collapses rapid-fire changes to only the final value", () => {
    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useDebouncedValue(v, 300),
      { initialProps: { v: "start" } },
    );

    // Simulate a user typing quickly — five changes in 250 ms total
    const keystrokes = ["s", "se", "sea", "sear", "search"];
    keystrokes.forEach((v, i) => {
      rerender({ v });
      if (i < keystrokes.length - 1) {
        act(() => { vi.advanceTimersByTime(50); });
      }
    });

    // 250 ms elapsed, 300 ms timer started after "search" — still pending
    expect(result.current).toBe("start");

    // Let the final timer fire
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe("search");
  });

  it("does not fire intermediate values for any intermediate keystrokes", () => {
    const observed: string[] = [];

    const { rerender } = renderHook(
      ({ v }: { v: string }) => {
        const d = useDebouncedValue(v, 200);
        observed.push(d);
        return d;
      },
      { initialProps: { v: "a" } },
    );

    rerender({ v: "ab" });
    act(() => { vi.advanceTimersByTime(100); });

    rerender({ v: "abc" });
    act(() => { vi.advanceTimersByTime(100); });

    rerender({ v: "abcd" });
    act(() => { vi.advanceTimersByTime(200); }); // timer for "abcd" fires

    // The debounced output should never have emitted "ab" or "abc"
    expect(observed).not.toContain("ab");
    expect(observed).not.toContain("abc");
    expect(observed).toContain("abcd");
  });

  // ── Different value types ────────────────────────────────────────────────

  it("works with number values", () => {
    const { result, rerender } = renderHook(
      ({ v }: { v: number }) => useDebouncedValue(v, 150),
      { initialProps: { v: 0 } },
    );

    rerender({ v: 42 });
    act(() => { vi.advanceTimersByTime(150); });

    expect(result.current).toBe(42);
  });

  it("works with object references", () => {
    const obj1 = { name: "Alice" };
    const obj2 = { name: "Bob" };

    const { result, rerender } = renderHook(
      ({ v }: { v: typeof obj1 }) => useDebouncedValue(v, 100),
      { initialProps: { v: obj1 } },
    );

    rerender({ v: obj2 });
    act(() => { vi.advanceTimersByTime(100); });

    expect(result.current).toBe(obj2);
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  it("responds immediately when the delay is 0 ms", () => {
    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useDebouncedValue(v, 0),
      { initialProps: { v: "a" } },
    );

    rerender({ v: "b" });
    act(() => { vi.advanceTimersByTime(0); });

    expect(result.current).toBe("b");
  });

  it("does not update when the same value is rerendered", () => {
    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useDebouncedValue(v, 300),
      { initialProps: { v: "same" } },
    );

    rerender({ v: "same" });
    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current).toBe("same");
  });

  it("respects a changed delay on subsequent renders", () => {
    const { result, rerender } = renderHook(
      ({ v, delay }: { v: string; delay: number }) => useDebouncedValue(v, delay),
      { initialProps: { v: "a", delay: 300 } },
    );

    // Switch to a longer delay and update the value at the same time
    rerender({ v: "b", delay: 600 });

    act(() => { vi.advanceTimersByTime(300); }); // would have fired at old delay
    expect(result.current).toBe("a");

    act(() => { vi.advanceTimersByTime(300); }); // full 600 ms elapsed
    expect(result.current).toBe("b");
  });
});
