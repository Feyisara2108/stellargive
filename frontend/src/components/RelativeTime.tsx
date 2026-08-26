"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

export interface RelativeTimeProps {
  date: Date;
  fallback?: string;
  intervalMs?: number;
}

export function RelativeTime({ date, fallback, intervalMs = 60000 }: RelativeTimeProps) {
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      setFormatted(formatDistanceToNow(date, { addSuffix: true }));
    };

    update();
    const timer = setInterval(update, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [date, intervalMs]);

  if (!formatted) {
    return <span>{fallback ?? "..."}</span>;
  }

  return <span>{formatted}</span>;
}
