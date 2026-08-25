import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { CategorySelector, CATEGORIES, CategoryKey } from "./CategorySelector";

describe("ComponentModule37 — CategorySelector Unit Tests", () => {
  const defaultProps = {
    value: "all" as CategoryKey,
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with default label 'Category'", () => {
    render(<CategorySelector {...defaultProps} />);
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByText("All Categories")).toBeInTheDocument();
  });

  it("renders with custom label when provided", () => {
    render(<CategorySelector {...defaultProps} label="Filter by Category" />);
    expect(screen.getByText("Filter by Category")).toBeInTheDocument();
  });

  it("displays correct text for 'uncategorized' value", () => {
    render(<CategorySelector {...defaultProps} value="uncategorized" />);
    expect(screen.getByText("Uncategorized")).toBeInTheDocument();
  });

  it("displays raw value for standard category keys", () => {
    render(<CategorySelector {...defaultProps} value="medical" />);
    expect(screen.getByText("medical")).toBeInTheDocument();
  });

  it("toggles dropdown visibility on button click", () => {
    render(<CategorySelector {...defaultProps} />);
    const triggerButton = screen.getByRole("button");

    // Initially dropdown items are not visible
    expect(screen.queryByText("education")).not.toBeInTheDocument();

    // Open dropdown
    fireEvent.click(triggerButton);
    expect(screen.getByText("education")).toBeInTheDocument();

    // Close dropdown
    fireEvent.click(triggerButton);
    expect(screen.queryByText("education")).not.toBeInTheDocument();
  });

  it("renders all category options when dropdown is open", () => {
    render(<CategorySelector {...defaultProps} />);
    fireEvent.click(screen.getByRole("button"));

    CATEGORIES.forEach((cat) => {
      if (cat === "all") {
        expect(screen.getAllByText("All Categories").length).toBeGreaterThan(0);
      } else if (cat === "uncategorized") {
        expect(screen.getByText("Uncategorized")).toBeInTheDocument();
      } else {
        expect(screen.getByText(cat)).toBeInTheDocument();
      }
    });
  });

  it("calls onChange callback and closes dropdown when an option is selected", () => {
    const handleChange = vi.fn();
    render(<CategorySelector {...defaultProps} onChange={handleChange} />);

    // Open dropdown
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("food")).toBeInTheDocument();

    // Click 'food' option
    fireEvent.click(screen.getByText("food"));

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith("food");

    // Dropdown should be closed after selection
    expect(screen.queryByText("shelter")).not.toBeInTheDocument();
  });

  it("closes dropdown when clicking outside the container", () => {
    render(
      <div>
        <div data-testid="outside-element">Outside</div>
        <CategorySelector {...defaultProps} />
      </div>,
    );

    // Open dropdown
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("shelter")).toBeInTheDocument();

    // Click outside
    fireEvent.mouseDown(screen.getByTestId("outside-element"));
    expect(screen.queryByText("shelter")).not.toBeInTheDocument();
  });

  it("does not close dropdown when clicking inside the container", () => {
    render(<CategorySelector {...defaultProps} />);

    // Open dropdown
    const triggerButton = screen.getByRole("button");
    fireEvent.click(triggerButton);
    expect(screen.getByText("shelter")).toBeInTheDocument();

    // MouseDown inside button area
    fireEvent.mouseDown(triggerButton);
    expect(screen.getByText("shelter")).toBeInTheDocument();
  });
});
