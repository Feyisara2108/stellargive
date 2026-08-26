import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { SortSelector, SORT_OPTIONS, SortKey } from "./SortSelector";

describe("ComponentModule40 — SortSelector Unit Tests", () => {
  const defaultProps = {
    value: "newest" as SortKey,
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with default label 'Sort By'", () => {
    render(<SortSelector {...defaultProps} />);
    expect(screen.getByText("Sort By")).toBeInTheDocument();
    expect(screen.getByText("Newest")).toBeInTheDocument();
  });

  it("renders with custom label when provided", () => {
    render(<SortSelector {...defaultProps} label="Order Campaigns" />);
    expect(screen.getByText("Order Campaigns")).toBeInTheDocument();
  });

  it("displays corresponding label for selected value", () => {
    render(<SortSelector {...defaultProps} value="most-raised" />);
    expect(screen.getByText("Most Raised")).toBeInTheDocument();
  });

  it("toggles dropdown open and closed on button click", () => {
    render(<SortSelector {...defaultProps} />);
    const triggerButton = screen.getByRole("button");

    // Dropdown options should initially be hidden
    expect(screen.queryByText("Ending Soon")).not.toBeInTheDocument();

    // Open dropdown
    fireEvent.click(triggerButton);
    expect(screen.getByText("Ending Soon")).toBeInTheDocument();

    // Close dropdown
    fireEvent.click(triggerButton);
    expect(screen.queryByText("Ending Soon")).not.toBeInTheDocument();
  });

  it("renders all sort options when open", () => {
    render(<SortSelector {...defaultProps} />);
    fireEvent.click(screen.getByRole("button"));

    SORT_OPTIONS.forEach((opt) => {
      if (opt.key === "newest") {
        expect(screen.getAllByText("Newest").length).toBeGreaterThan(0);
      } else {
        expect(screen.getByText(opt.label)).toBeInTheDocument();
      }
    });
  });

  it("calls onChange callback and closes dropdown when an option is clicked", () => {
    const handleChange = vi.fn();
    render(<SortSelector {...defaultProps} onChange={handleChange} />);

    // Open dropdown
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Near Goal")).toBeInTheDocument();

    // Select option
    fireEvent.click(screen.getByText("Near Goal"));

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith("near-goal");

    // Dropdown should close
    expect(screen.queryByText("Ending Soon")).not.toBeInTheDocument();
  });

  it("closes dropdown when clicking outside container", () => {
    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <SortSelector {...defaultProps} />
      </div>,
    );

    // Open dropdown
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Ending Soon")).toBeInTheDocument();

    // Click outside
    fireEvent.mouseDown(screen.getByTestId("outside-area"));
    expect(screen.queryByText("Ending Soon")).not.toBeInTheDocument();
  });

  it("keeps dropdown open when clicking inside container element", () => {
    render(<SortSelector {...defaultProps} />);

    const triggerButton = screen.getByRole("button");
    fireEvent.click(triggerButton);
    expect(screen.getByText("Ending Soon")).toBeInTheDocument();

    // MouseDown inside button element
    fireEvent.mouseDown(triggerButton);
    expect(screen.getByText("Ending Soon")).toBeInTheDocument();
  });
});
