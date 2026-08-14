// frontend/src/hooks/useCountdown.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountdown } from './useCountdown';

describe('useCountdown', () => {
  // Mock Date.now to have a fixed reference point
  const MOCK_NOW = 1700000000000; // 2023-11-14T22:13:20.000Z
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const ONE_MINUTE_MS = 60 * 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Time math - days/hours/minutes decomposition', () => {
    it('should calculate correct days, hours, minutes for a deadline several days out', () => {
      // Deadline 5 days, 3 hours, 30 minutes from now
      const deadlineMs = MOCK_NOW + (5 * ONE_DAY_MS) + (3 * ONE_HOUR_MS) + (30 * ONE_MINUTE_MS);
      const { result } = renderHook(() => useCountdown(deadlineMs));

      expect(result.current.days).toBe(5);
      expect(result.current.hours).toBe(3);
      expect(result.current.minutes).toBe(30);
      expect(result.current.isEnded).toBe(false);
      expect(result.current.timeLeft).toBe((5 * ONE_DAY_MS) + (3 * ONE_HOUR_MS) + (30 * ONE_MINUTE_MS));
    });

    it('should handle bigint deadline the same as number deadline', () => {
      const deadlineMs = MOCK_NOW + (3 * ONE_DAY_MS) + (2 * ONE_HOUR_MS) + (15 * ONE_MINUTE_MS);
      const bigintDeadline = BigInt(deadlineMs);
      
      const { result: numberResult } = renderHook(() => useCountdown(deadlineMs));
      const { result: bigintResult } = renderHook(() => useCountdown(bigintDeadline));

      expect(bigintResult.current.days).toBe(numberResult.current.days);
      expect(bigintResult.current.hours).toBe(numberResult.current.hours);
      expect(bigintResult.current.minutes).toBe(numberResult.current.minutes);
      expect(bigintResult.current.isEnded).toBe(numberResult.current.isEnded);
      expect(bigintResult.current.timeLeft).toBe(numberResult.current.timeLeft);
    });

    it('should round down minutes correctly', () => {
      // 2 days, 5 hours, 3 minutes, 45 seconds
      const deadlineMs = MOCK_NOW + (2 * ONE_DAY_MS) + (5 * ONE_HOUR_MS) + (3 * ONE_MINUTE_MS) + 45000;
      const { result } = renderHook(() => useCountdown(deadlineMs));

      expect(result.current.days).toBe(2);
      expect(result.current.hours).toBe(5);
      expect(result.current.minutes).toBe(3);
    });

    it('should update timeLeft as time passes', () => {
      const deadlineMs = MOCK_NOW + (2 * ONE_DAY_MS);
      const { result } = renderHook(() => useCountdown(deadlineMs));

      const initialTimeLeft = result.current.timeLeft;
      expect(initialTimeLeft).toBe(2 * ONE_DAY_MS);

      // Advance 1 hour
      act(() => {
        vi.advanceTimersByTime(ONE_HOUR_MS);
      });

      expect(result.current.timeLeft).toBe((2 * ONE_DAY_MS) - ONE_HOUR_MS);
      expect(result.current.days).toBe(1);
      expect(result.current.hours).toBe(23);
    });
  });

  describe('Already-expired deadlines', () => {
    it('should return isEnded: true and timeLeft: 0 for past deadline', () => {
      const pastDeadline = MOCK_NOW - ONE_DAY_MS;
      const { result } = renderHook(() => useCountdown(pastDeadline));

      expect(result.current.isEnded).toBe(true);
      expect(result.current.timeLeft).toBe(0);
      expect(result.current.days).toBe(0);
      expect(result.current.hours).toBe(0);
      expect(result.current.minutes).toBe(0);
    });

    it('should not start interval for already-expired deadline', () => {
      const pastDeadline = MOCK_NOW - ONE_DAY_MS;
      const { result } = renderHook(() => useCountdown(pastDeadline));

      // Advance timers significantly
      act(() => {
        vi.advanceTimersByTime(10 * ONE_DAY_MS);
      });

      // State should remain unchanged (no interval started)
      expect(result.current.isEnded).toBe(true);
      expect(result.current.timeLeft).toBe(0);
      expect(result.current.days).toBe(0);
      expect(result.current.hours).toBe(0);
      expect(result.current.minutes).toBe(0);
    });
  });

  describe('Interval lifecycle and cleanup', () => {
    it('should transition to isEnded: true when deadline passes', () => {
      const deadlineMs = MOCK_NOW + (2 * ONE_HOUR_MS);
      const { result } = renderHook(() => useCountdown(deadlineMs));

      expect(result.current.isEnded).toBe(false);
      expect(result.current.timeLeft).toBe(2 * ONE_HOUR_MS);

      // Advance past the deadline
      act(() => {
        vi.advanceTimersByTime(2 * ONE_HOUR_MS + 1000);
      });

      expect(result.current.isEnded).toBe(true);
      expect(result.current.timeLeft).toBe(0);
      expect(result.current.days).toBe(0);
      expect(result.current.hours).toBe(0);
      expect(result.current.minutes).toBe(0);
    });

    it('should clear interval on unmount (no state updates after unmount)', () => {
      const deadlineMs = MOCK_NOW + (5 * ONE_DAY_MS);
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
      const setIntervalSpy = vi.spyOn(window, 'setInterval');
      
      const { result, unmount } = renderHook(() => useCountdown(deadlineMs));
      
      // Verify interval was set
      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      
      // Unmount the hook
      unmount();
      
      // Verify interval was cleared
      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
      
      // Advance timers - no state updates should occur
      act(() => {
        vi.advanceTimersByTime(10 * ONE_DAY_MS);
      });
      
      // State should still be initial (not updated after unmount)
      expect(result.current.isEnded).toBe(false);
      expect(result.current.timeLeft).toBe(5 * ONE_DAY_MS);
    });

    it('should clear interval when deadline passes', () => {
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
      const deadlineMs = MOCK_NOW + (1 * ONE_HOUR_MS);
      
      const { result } = renderHook(() => useCountdown(deadlineMs));
      
      // Advance past deadline
      act(() => {
        vi.advanceTimersByTime(1 * ONE_HOUR_MS + 1000);
      });
      
      expect(result.current.isEnded).toBe(true);
      // Interval should be cleared (no further updates)
      expect(clearIntervalSpy).toHaveBeenCalled();
      
      // Advance more and assert state doesn't change
      act(() => {
        vi.advanceTimersByTime(1 * ONE_HOUR_MS);
      });
      
      expect(result.current.isEnded).toBe(true);
      expect(result.current.timeLeft).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero-time deadline', () => {
      const { result } = renderHook(() => useCountdown(MOCK_NOW));
      
      expect(result.current.isEnded).toBe(true);
      expect(result.current.timeLeft).toBe(0);
      expect(result.current.days).toBe(0);
      expect(result.current.hours).toBe(0);
      expect(result.current.minutes).toBe(0);
    });

    it('should handle very large deadline', () => {
      const farFuture = MOCK_NOW + (365 * 24 * 60 * 60 * 1000); // 1 year
      const { result } = renderHook(() => useCountdown(farFuture));
      
      expect(result.current.days).toBe(365);
      expect(result.current.hours).toBe(0);
      expect(result.current.minutes).toBe(0);
      expect(result.current.isEnded).toBe(false);
    });

    it('should handle very small time remaining', () => {
      const deadlineMs = MOCK_NOW + 100; // 100ms
      const { result } = renderHook(() => useCountdown(deadlineMs));
      
      expect(result.current.days).toBe(0);
      expect(result.current.hours).toBe(0);
      expect(result.current.minutes).toBe(0);
      
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      
      expect(result.current.isEnded).toBe(true);
      expect(result.current.timeLeft).toBe(0);
    });
  });
});