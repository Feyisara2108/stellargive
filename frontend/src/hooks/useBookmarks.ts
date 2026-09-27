"use client";

import { useCallback, useSyncExternalStore } from "react";

export const BOOKMARKS_STORAGE_KEY = "stellargive:bookmarks";

const EMPTY: readonly string[] = Object.freeze([]);
const listeners = new Set<() => void>();
let cache: readonly string[] | null = null;

function readStorage(): readonly string[] {
  try {
    const raw = window.localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return EMPTY;
  }
}

function writeStorage(ids: readonly string[]) {
  try {
    window.localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable (private mode / quota): keep in-memory state only.
  }
}

function getSnapshot(): readonly string[] {
  if (cache === null) cache = readStorage();
  return cache;
}

function getServerSnapshot(): readonly string[] {
  return EMPTY;
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === BOOKMARKS_STORAGE_KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Test helper: drop the in-memory cache so the next read hits localStorage. */
export function resetBookmarksCache() {
  cache = null;
  emit();
}

export function useBookmarks() {
  const bookmarks = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isBookmarked = useCallback(
    (id: string | bigint) => bookmarks.includes(String(id)),
    [bookmarks],
  );

  const toggle = useCallback((id: string | bigint) => {
    const key = String(id);
    const current = getSnapshot();
    cache = current.includes(key) ? current.filter((b) => b !== key) : [...current, key];
    writeStorage(cache);
    emit();
  }, []);

  return { bookmarks, isBookmarked, toggle };
}
