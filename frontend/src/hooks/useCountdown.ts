import { useState, useEffect } from "react";

function get_time_left(deadline: bigint | number) {
  const deadlineMs = Number(deadline) < 1e11 ? Number(deadline) * 1000 : Number(deadline);
  const now = Date.now();
  return Math.max(0, deadlineMs - now);
}

export function useCountdown(deadline: bigint | number) {
  const [timeLeft, setTimeLeft] = useState(() => get_time_left(deadline));

  useEffect(() => {
    const initialTimeLeft = get_time_left(deadline);
    setTimeLeft(initialTimeLeft);

    if (initialTimeLeft <= 0) return;

    const timer = setInterval(() => {
      const remaining = get_time_left(deadline);
      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [deadline]);

  const days = Math.floor(timeLeft / (1000 * 3600 * 24));
  const hours = Math.floor((timeLeft % (1000 * 3600 * 24)) / (1000 * 3600));
  const minutes = Math.floor((timeLeft % (1000 * 3600)) / (1000 * 60));

  return {
    days,
    hours,
    minutes,
    isEnded: timeLeft <= 0,
    timeLeft,
  };
}
