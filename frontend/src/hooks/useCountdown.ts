import { useCallback, useSyncExternalStore } from "react";

function toDeadlineMs(deadline: bigint | number) {
  return Number(deadline) < 1e11 ? Number(deadline) * 1000 : Number(deadline);
}

function get_time_left(deadline: bigint | number) {
  return Math.max(0, toDeadlineMs(deadline) - Date.now());
}

// The current time at one-second resolution. Reading it is cheap and stable
// between ticks, which is what useSyncExternalStore needs from a snapshot.
function getNowSecond() {
  return Math.floor(Date.now() / 1000);
}

// No client clock exists on the server, so the server (and the hydrating client)
// render a deterministic "not ready" value instead of a time-dependent one.
function getServerSnapshot(): number | null {
  return null;
}

export function useCountdown(deadline: bigint | number) {
  const deadlineMs = toDeadlineMs(deadline);

  const subscribe = useCallback(
    (onTick: () => void) => {
      // Already ended: nothing will change, so don't start a timer.
      if (get_time_left(deadlineMs) <= 0) return () => {};

      const timer = setInterval(() => {
        onTick();

        if (get_time_left(deadlineMs) <= 0) {
          clearInterval(timer);
        }
      }, 1000);

      return () => clearInterval(timer);
    },
    [deadlineMs],
  );

  const nowSecond = useSyncExternalStore(subscribe, getNowSecond, getServerSnapshot);

  const isReady = nowSecond !== null;
  const timeLeft = isReady ? Math.max(0, deadlineMs - nowSecond * 1000) : null;
  const remaining = timeLeft ?? 0;

  const days = Math.floor(remaining / (1000 * 3600 * 24));
  const hours = Math.floor((remaining % (1000 * 3600 * 24)) / (1000 * 3600));
  const minutes = Math.floor((remaining % (1000 * 3600)) / (1000 * 60));

  return {
    days,
    hours,
    minutes,
    /** False until the client has computed a real value; render a placeholder until then. */
    isReady,
    isEnded: timeLeft !== null && timeLeft <= 0,
    timeLeft,
  };
}
