import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, render, screen, fireEvent } from "@testing-library/react";
import { useBookmarks, resetBookmarksCache, BOOKMARKS_STORAGE_KEY } from "./useBookmarks";
import { BookmarkButton } from "@/components/BookmarkButton";

beforeEach(() => {
  window.localStorage.clear();
  resetBookmarksCache();
});

describe("useBookmarks", () => {
  it("toggles and persists bookmarks to localStorage", () => {
    const { result } = renderHook(() => useBookmarks());
    expect(result.current.bookmarks).toEqual([]);

    act(() => result.current.toggle(5n));
    expect(result.current.isBookmarked("5")).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(BOOKMARKS_STORAGE_KEY)!)).toEqual(["5"]);

    act(() => result.current.toggle("5"));
    expect(result.current.isBookmarked(5n)).toBe(false);
  });

  it("restores bookmarks from a previous session", () => {
    window.localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(["1", "2"]));
    resetBookmarksCache();
    const { result } = renderHook(() => useBookmarks());
    expect(result.current.bookmarks).toEqual(["1", "2"]);
  });

  it("survives corrupt storage", () => {
    window.localStorage.setItem(BOOKMARKS_STORAGE_KEY, "oops");
    resetBookmarksCache();
    const { result } = renderHook(() => useBookmarks());
    expect(result.current.bookmarks).toEqual([]);
  });
});

describe("BookmarkButton", () => {
  it("exposes pressed state and an accessible label", () => {
    render(<BookmarkButton campaignId={7n} title="Flood relief" />);
    const btn = screen.getByRole("button", { name: "Bookmark Flood relief" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    const saved = screen.getByRole("button", { name: "Remove bookmark for Flood relief" });
    expect(saved).toHaveAttribute("aria-pressed", "true");
  });
});
