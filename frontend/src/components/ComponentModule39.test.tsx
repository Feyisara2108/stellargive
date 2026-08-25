import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Breadcrumbs, BreadcrumbItem } from "./Breadcrumbs";

describe("ComponentModule39 — Breadcrumbs Unit Tests", () => {
  const sampleItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Campaigns", href: "/campaigns" },
    { label: "Save the Rainforests Foundation Project", href: "/campaigns/123" },
  ];

  it("renders breadcrumb navigation element with correct accessibility label", () => {
    render(<Breadcrumbs items={sampleItems} />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav).toBeInTheDocument();
  });

  it("renders non-last items as navigation links", () => {
    render(<Breadcrumbs items={sampleItems} />);

    const homeLink = screen.getByRole("link", { name: "Navigate to Home" });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute("href", "/");

    const campaignsLink = screen.getByRole("link", { name: "Navigate to Campaigns" });
    expect(campaignsLink).toBeInTheDocument();
    expect(campaignsLink).toHaveAttribute("href", "/campaigns");
  });

  it("renders the last item as a span with aria-current='page'", () => {
    render(<Breadcrumbs items={sampleItems} />);

    const lastItem = screen.getByText("Save the Rainforests Foundation Project");
    expect(lastItem.tagName).toBe("SPAN");
    expect(lastItem).toHaveAttribute("aria-current", "page");
    expect(lastItem).not.toHaveAttribute("href");
  });

  it("truncates labels longer than 40 characters with an ellipsis", () => {
    const longItems: BreadcrumbItem[] = [
      { label: "Short", href: "/short" },
      {
        label: "This is a very long breadcrumb label that exceeds forty characters by a lot",
        href: "/long",
      },
    ];

    render(<Breadcrumbs items={longItems} />);

    // 40 characters of "This is a very long breadcrumb label that exceeds forty characters by a lot" + "..."
    // "This is a very long breadcrumb label tha..."
    const expectedTruncated = "This is a very long breadcrumb label tha...";
    expect(screen.getByText(expectedTruncated)).toBeInTheDocument();
  });

  it("handles a single-item breadcrumb list correctly", () => {
    const singleItem: BreadcrumbItem[] = [{ label: "Dashboard", href: "/dashboard" }];

    render(<Breadcrumbs items={singleItem} />);

    const item = screen.getByText("Dashboard");
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
