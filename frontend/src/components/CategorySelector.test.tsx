import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
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

  it("names the category group with the visible label", () => {
    render(<CategorySelector {...defaultProps} />);

    expect(screen.getByText("Category")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Category" });
    expect(within(group).getAllByRole("button")).toHaveLength(CATEGORIES.length);
  });

  it("uses the custom label as the group name", () => {
    render(<CategorySelector {...defaultProps} label="Select Filter Category" />);

    expect(screen.getByRole("group", { name: "Select Filter Category" })).toBeInTheDocument();
  });

  it("does not use incomplete tab semantics", () => {
    render(<CategorySelector {...defaultProps} />);

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryAllByRole("tablist")).toHaveLength(0);
  });

  it("displays correct text for uncategorized and standard categories", () => {
    const { rerender } = render(<CategorySelector {...defaultProps} value="uncategorized" />);
    expect(screen.getAllByText("Uncategorized").length).toBeGreaterThan(0);

    rerender(<CategorySelector {...defaultProps} value="medical" />);
    // Standard categories are title-cased for display ("medical" -> "Medical").
    expect(screen.getAllByText(/medical/i).length).toBeGreaterThan(0);
  });

  it("calls onChange callback when mobile select option changes", () => {
    const handleChange = vi.fn();
    render(<CategorySelector value="all" onChange={handleChange} />);

    const select = screen.getByLabelText("Select Category");
    fireEvent.change(select, { target: { value: "medical" } });

    expect(handleChange).toHaveBeenCalledWith("medical");
  });

  it("calls onChange callback when a desktop category button is clicked", () => {
    const handleChange = vi.fn();
    render(<CategorySelector value="all" onChange={handleChange} />);

    const medicalButton = screen.getByRole("button", { name: "Medical" });
    fireEvent.click(medicalButton);

    expect(handleChange).toHaveBeenCalledWith("medical");
  });

  it("exposes the selected category through aria-pressed", () => {
    const { rerender } = render(<CategorySelector {...defaultProps} value="medical" />);

    const medicalButton = screen.getByRole("button", { name: "Medical" });
    expect(medicalButton).toHaveAttribute("aria-pressed", "true");

    const allButton = screen.getByRole("button", { name: "All Categories" });
    expect(allButton).toHaveAttribute("aria-pressed", "false");

    rerender(<CategorySelector {...defaultProps} value="education" />);
    expect(medicalButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Education" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("renders every category in the mobile select", () => {
    render(<CategorySelector {...defaultProps} />);

    const select = screen.getByLabelText("Select Category") as HTMLSelectElement;
    expect(select.options).toHaveLength(CATEGORIES.length);
  });

  it("shows per-category counts next to the category names", () => {
    render(<CategorySelector {...defaultProps} counts={{ medical: 3 }} />);

    expect(screen.getByRole("button", { name: /Medical\s*\(3\)/ })).toBeInTheDocument();
  });
});
