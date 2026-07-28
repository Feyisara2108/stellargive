import { useState, useEffect } from "react";

/**
 * Returns `true` when the user has requested reduced motion via the
 * `prefers-reduced-motion: reduce` media query, and updates reactively
 * if the preference changes while the page is open.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefers(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefers(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return prefers;
}
