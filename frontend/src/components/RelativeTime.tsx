"use client";

import { useEffect, useState } from "react";

export interface RelativeTimeProps {
  date: Date;
  fallback?: string;
  intervalMs?: number;
}

function getRelativeTimeString(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return "just now";
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} min${diffInMinutes > 1 ? "s" : ""} ago`;
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? "s" : ""} ago`;
  }
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `${diffInDays} day${diffInDays > 1 ? "s" : ""} ago`;
  }
  
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths > 1 ? "s" : ""} ago`;
  }
  
  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears} year${diffInYears > 1 ? "s" : ""} ago`;
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
