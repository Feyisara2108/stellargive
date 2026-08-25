import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("should toggle open/close via Ctrl+K and Cmd+K keyboard shortcuts", () => {
    render(<CommandPalette />);

    // Initially palette dialog is closed
    expect(screen.queryByPlaceholderText("Search navigation...")).not.toBeInTheDocument();

    // Trigger Ctrl+K keydown on document
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(screen.getByPlaceholderText("Search navigation...")).toBeInTheDocument();

    // Trigger Ctrl+K again to toggle closed
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(screen.queryByPlaceholderText("Search navigation...")).not.toBeInTheDocument();

    // Trigger Cmd+K keydown on document
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(screen.getByPlaceholderText("Search navigation...")).toBeInTheDocument();
  });

  it("filters navigation items based on search input", () => {
    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    const input = screen.getByPlaceholderText("Search navigation...");
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Explore Campaigns")).toBeInTheDocument();

    // Type query matching "explore"
    fireEvent.change(input, { target: { value: "explore" } });
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
    expect(screen.getByText("Explore Campaigns")).toBeInTheDocument();
  });

  it("displays empty state when search returns no results", () => {
    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    const input = screen.getByPlaceholderText("Search navigation...");
    fireEvent.change(input, { target: { value: "nonexistentquery12345" } });

    expect(screen.getByText("No results found")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("navigates to selected item on option button click", () => {
    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    const exploreButton = screen.getByText("Explore Campaigns");
    fireEvent.click(exploreButton);

    expect(mockPush).toHaveBeenCalledWith("/explore");
    expect(screen.queryByPlaceholderText("Search navigation...")).not.toBeInTheDocument();
  });

  it("handles keyboard navigation with ArrowDown, ArrowUp, and Enter key", () => {
    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    const dialogContent = screen.getByRole("dialog");

    // Initially active index is 0 (Home)
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    // Press ArrowDown -> active index 1 (Explore Campaigns)
    fireEvent.keyDown(dialogContent, { key: "ArrowDown" });
    expect(options[1]).toHaveAttribute("aria-selected", "true");

    // Press ArrowUp -> active index back to 0 (Home)
    fireEvent.keyDown(dialogContent, { key: "ArrowUp" });
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    // Press ArrowUp when at 0 -> wraps around to last item (Profile, index 3)
    fireEvent.keyDown(dialogContent, { key: "ArrowUp" });
    expect(options[3]).toHaveAttribute("aria-selected", "true");

    // Press Enter to select active item
    fireEvent.keyDown(dialogContent, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith("/profile");
  });

  it("ignores unrelated keyboard shortcuts", () => {
    render(<CommandPalette />);

    // Press Ctrl+J or plain K without ctrl/meta
    fireEvent.keyDown(document, { key: "j", ctrlKey: true });
    fireEvent.keyDown(document, { key: "k" });

    expect(screen.queryByPlaceholderText("Search navigation...")).not.toBeInTheDocument();
  });
});
