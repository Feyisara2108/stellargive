import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CategorySelector, CATEGORIES, CategoryKey } from "./CategorySelector";

describe("CategorySelector", () => {
  const defaultProps = {
    value: "all" as CategoryKey,
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with default label and displays selected category", () => {
    render(<CategorySelector {...defaultProps} />);

    expect(screen.getByText("Category")).toBeInTheDocument();
    // Label appears in both the mobile <select> and the desktop tablist.
    expect(screen.getAllByText("All Categories").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /medical/i })).not.toBeInTheDocument();
  });

  it("renders custom label when provided", () => {
    render(<CategorySelector {...defaultProps} label="Select Filter Category" />);

    expect(screen.getByText("Select Filter Category")).toBeInTheDocument();
  });

  it("displays correct text for uncategorized and standard categories", () => {
    const { rerender } = render(<CategorySelector {...defaultProps} value="uncategorized" />);
    expect(screen.getAllByText("Uncategorized").length).toBeGreaterThan(0);

    rerender(<CategorySelector {...defaultProps} value="medical" />);
    // Standard categories are title-cased for display ("medical" -> "Medical").
    expect(screen.getAllByText(/medical/i).length).toBeGreaterThan(0);
  });

  it("toggles dropdown visibility on main button click", () => {
    render(<CategorySelector {...defaultProps} />);

    const toggleButton = screen.getByRole("button", { name: /all categories/i });
    expect(screen.queryByRole("button", { name: /^medical$/i })).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(toggleButton);
    expect(screen.getByRole("button", { name: /^medical$/i })).toBeInTheDocument();

    // Click to close
    fireEvent.click(toggleButton);
    expect(screen.queryByRole("button", { name: /^medical$/i })).not.toBeInTheDocument();
  });

  it("calls onChange callback and closes dropdown when an option is selected", () => {
    const handleChange = vi.fn();
    render(<CategorySelector value="all" onChange={handleChange} />);

    const toggleButton = screen.getByRole("button", { name: /all categories/i });
    fireEvent.click(toggleButton);

    const medicalOption = screen.getByRole("button", { name: /^medical$/i });
    fireEvent.click(medicalOption);

    expect(handleChange).toHaveBeenCalledWith("medical");
    expect(screen.queryByRole("button", { name: /^medical$/i })).not.toBeInTheDocument();
  });

  it("closes dropdown when clicking outside of component container", () => {
    render(
      <div>
        <div data-testid="outside-element">Outside</div>
        <CategorySelector {...defaultProps} />
      </div>,
    );

    const toggleButton = screen.getByRole("button", { name: /all categories/i });
    fireEvent.click(toggleButton);
    expect(screen.getByRole("button", { name: /^medical$/i })).toBeInTheDocument();

    // Trigger mousedown outside
    fireEvent.mouseDown(screen.getByTestId("outside-element"));
    expect(screen.queryByRole("button", { name: /^medical$/i })).not.toBeInTheDocument();
  });
});
