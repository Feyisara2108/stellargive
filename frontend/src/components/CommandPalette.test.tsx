import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
    expect(screen.getByText("Try a different search term.")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("announces the result count to screen readers after typing settles", async () => {
    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    await waitFor(() => expect(status).toHaveTextContent("6 results available"));

    const input = screen.getByPlaceholderText("Search navigation...");
    fireEvent.change(input, { target: { value: "c" } });
    fireEvent.change(input, { target: { value: "cr" } });
    fireEvent.change(input, { target: { value: "create" } });

    await waitFor(() => expect(status).toHaveTextContent("1 result available"));

    await waitFor(() => expect(status).toHaveTextContent("1 result available"));
  });

  it("announces a zero-result summary when nothing matches the query", async () => {
    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    const input = screen.getByPlaceholderText("Search navigation...");
    fireEvent.change(input, { target: { value: "nonexistentquery12345" } });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    const status = screen.getByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("No results found"));
    expect(screen.getByText("Try a different search term.")).toBeInTheDocument();
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

    // Press ArrowUp when at 0 -> wraps around to last item (Toggle Theme, index 5)
    fireEvent.keyDown(dialogContent, { key: "ArrowUp" });
    expect(options[5]).toHaveAttribute("aria-selected", "true");

    // Press Enter to select active item (Toggle Theme executes handler)
    fireEvent.keyDown(dialogContent, { key: "Enter" });
    expect(screen.queryByPlaceholderText("Search navigation...")).not.toBeInTheDocument();
  });

  it("ignores unrelated keyboard shortcuts", () => {
    render(<CommandPalette />);

    // Press Ctrl+J or plain K without ctrl/meta
    fireEvent.keyDown(document, { key: "j", ctrlKey: true });
    fireEvent.keyDown(document, { key: "k" });

    expect(screen.queryByPlaceholderText("Search navigation...")).not.toBeInTheDocument();
  });

  it("wraps ArrowDown navigation from the last item back to the first", () => {
    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    const dialogContent = screen.getByRole("dialog");
    const options = screen.getAllByRole("option");

    // Home(0) -> Explore(1) -> Create(2) -> Profile(3) -> Connect Wallet(4) -> Toggle Theme(5) -> wraps to Home(0)
    fireEvent.keyDown(dialogContent, { key: "ArrowDown" });
    fireEvent.keyDown(dialogContent, { key: "ArrowDown" });
    fireEvent.keyDown(dialogContent, { key: "ArrowDown" });
    fireEvent.keyDown(dialogContent, { key: "ArrowDown" });
    fireEvent.keyDown(dialogContent, { key: "ArrowDown" });
    expect(options[5]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(dialogContent, { key: "ArrowDown" });
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("defers to the open/onOpenChange props when used as a controlled component", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<CommandPalette open={false} onOpenChange={onOpenChange} />);

    expect(screen.queryByPlaceholderText("Search navigation...")).not.toBeInTheDocument();

    // The internal Ctrl+K handler still fires, but in controlled mode it must
    // report the intended state via onOpenChange instead of opening itself.
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByPlaceholderText("Search navigation...")).not.toBeInTheDocument();

    rerender(<CommandPalette open={true} onOpenChange={onOpenChange} />);
    expect(screen.getByPlaceholderText("Search navigation...")).toBeInTheDocument();
  });

  // NOTE: the "recently-viewed campaigns" and "quick actions" (Create /
  // Connect Wallet / Toggle Theme) groups described in issue #884 are not
  // present in the current CommandPalette implementation, which still
  // renders a single flat navigationItems list. The tests above cover the
  // component as it exists today; recents/quick-action coverage should be
  // added once those groups are actually implemented.
});
