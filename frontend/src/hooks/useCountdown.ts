import { useState, useEffect } from "react";

function get_time_left(deadline: bigint | number) {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, Number(deadline) - now);
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

  const days = Math.floor(timeLeft / (3600 * 24));
  const hours = Math.floor((timeLeft % (3600 * 24)) / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);

  return {
    days,
    hours,
    minutes,
    isEnded: timeLeft <= 0,
    timeLeft,
  };
}
