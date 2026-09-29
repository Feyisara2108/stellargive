"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

export interface RelativeTimeProps {
  date: Date;
  fallback?: string;
  intervalMs?: number;
}

// Uses date-fns so both past ("3 days ago") and future ("in 14 days")
// timestamps are formatted with a suffix. A prior hand-rolled version only
// handled past dates and rendered future deadlines as "just now".
function getRelativeTimeString(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true });
}

export function RelativeTime({ date, fallback, intervalMs = 60000 }: RelativeTimeProps) {
  const [formatted, setFormatted] = useState<string | null>(null);
  const [fullDate, setFullDate] = useState<string>("");

  useEffect(() => {
    // Only set fullDate on client to avoid hydration mismatch if locales differ slightly
    setFullDate(date.toLocaleString());

    const update = () => {
      setFormatted(getRelativeTimeString(date));
    };

    update();
    const timer = setInterval(update, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [date, intervalMs]);

  if (!formatted) {
    return <span title={fullDate}>{fallback ?? "..."}</span>;
  }

  return <span title={fullDate}>{formatted}</span>;
}
