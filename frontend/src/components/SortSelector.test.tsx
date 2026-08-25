import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SortSelector, SORT_OPTIONS, SortKey } from "./SortSelector";

describe("SortSelector", () => {
  const defaultProps = {
    value: "newest" as SortKey,
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with default label and displays selected sort option", () => {
    render(<SortSelector {...defaultProps} />);

    expect(screen.getByText("Sort By")).toBeInTheDocument();
    expect(screen.getByText("Newest")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^ending soon$/i })).not.toBeInTheDocument();
  });

  it("renders custom label when provided", () => {
    render(<SortSelector {...defaultProps} label="Order Campaigns" />);

    expect(screen.getByText("Order Campaigns")).toBeInTheDocument();
  });

  it("displays correct text for all sort keys and falls back to Newest if value unknown", () => {
    const { rerender } = render(<SortSelector {...defaultProps} value="ending-soon" />);
    expect(screen.getByText("Ending Soon")).toBeInTheDocument();

    rerender(<SortSelector {...defaultProps} value="near-goal" />);
    expect(screen.getByText("Near Goal")).toBeInTheDocument();

    rerender(<SortSelector {...defaultProps} value="most-raised" />);
    expect(screen.getByText("Most Raised")).toBeInTheDocument();

    rerender(<SortSelector {...defaultProps} value={"unknown" as any} />);
    expect(screen.getByText("Newest")).toBeInTheDocument();
  });

  it("toggles dropdown visibility on main button click", () => {
    render(<SortSelector {...defaultProps} />);

    const toggleButton = screen.getByRole("button", { name: /newest/i });
    expect(screen.queryByRole("button", { name: /^ending soon$/i })).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(toggleButton);
    expect(screen.getByRole("button", { name: /^ending soon$/i })).toBeInTheDocument();

    // Click to close
    fireEvent.click(toggleButton);
    expect(screen.queryByRole("button", { name: /^ending soon$/i })).not.toBeInTheDocument();
  });

  it("calls onChange callback and closes dropdown when an option is selected", () => {
    const handleChange = vi.fn();
    render(<SortSelector value="newest" onChange={handleChange} />);

    const toggleButton = screen.getByRole("button", { name: /newest/i });
    fireEvent.click(toggleButton);

    const option = screen.getByRole("button", { name: /^most raised$/i });
    fireEvent.click(option);

    expect(handleChange).toHaveBeenCalledWith("most-raised");
    expect(screen.queryByRole("button", { name: /^most raised$/i })).not.toBeInTheDocument();
  });

  it("closes dropdown when clicking outside of component container", () => {
    render(
      <div>
        <div data-testid="outside-element">Outside</div>
        <SortSelector {...defaultProps} />
      </div>,
    );

    const toggleButton = screen.getByRole("button", { name: /newest/i });
    fireEvent.click(toggleButton);
    expect(screen.getByRole("button", { name: /^ending soon$/i })).toBeInTheDocument();

    // Trigger mousedown outside
    fireEvent.mouseDown(screen.getByTestId("outside-element"));
    expect(screen.queryByRole("button", { name: /^ending soon$/i })).not.toBeInTheDocument();
  });
});
