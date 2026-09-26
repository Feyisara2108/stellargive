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

  it("does not render the redundant dropdown button", () => {
    render(<CategorySelector {...defaultProps} />);

    expect(screen.queryByRole("button", { name: /all categories/i })).not.toBeInTheDocument();
  });

  it("calls onChange callback when mobile select option changes", () => {
    const handleChange = vi.fn();
    render(<CategorySelector value="all" onChange={handleChange} />);

    const select = screen.getByLabelText("Select Category");
    fireEvent.change(select, { target: { value: "medical" } });

    expect(handleChange).toHaveBeenCalledWith("medical");
  });

  it("calls onChange callback when a desktop tab is clicked", () => {
    const handleChange = vi.fn();
    render(<CategorySelector value="all" onChange={handleChange} />);

    const medicalTab = screen.getByRole("tab", { name: "Medical" });
    fireEvent.click(medicalTab);

    expect(handleChange).toHaveBeenCalledWith("medical");
  });

  it("reflects selected state via aria-selected on desktop tabs", () => {
    const { rerender } = render(<CategorySelector {...defaultProps} value="medical" />);

    const medicalTab = screen.getByRole("tab", { name: "Medical" });
    expect(medicalTab).toHaveAttribute("aria-selected", "true");

    const allTab = screen.getByRole("tab", { name: "All Categories" });
    expect(allTab).toHaveAttribute("aria-selected", "false");

    rerender(<CategorySelector {...defaultProps} value="education" />);
    expect(medicalTab).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Education" })).toHaveAttribute("aria-selected", "true");
  });

  it("renders all categories in both mobile select options and desktop tabs", () => {
    render(<CategorySelector {...defaultProps} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(CATEGORIES.length);

    const select = screen.getByLabelText("Select Category") as HTMLSelectElement;
    expect(select.options).toHaveLength(CATEGORIES.length);
  });
});
