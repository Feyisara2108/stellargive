"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

export function RelativeTime({ date, fallback }: { date: Date; fallback?: string }) {
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    setFormatted(formatDistanceToNow(date, { addSuffix: true }));
  }, [date]);

  if (!formatted) {
    return <span>{fallback ?? "..."}</span>;
  }

  return <span>{formatted}</span>;
}
