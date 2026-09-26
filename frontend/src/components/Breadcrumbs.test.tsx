import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Breadcrumbs, type BreadcrumbItem } from "./Breadcrumbs";
import { absoluteUrl } from "@/lib/utils";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const multiLevel: BreadcrumbItem[] = [
  { label: "Home", href: "/" },
  { label: "Explore Campaigns", href: "/explore" },
  { label: "Flood Relief — Lagos", href: "/campaign/1" },
];

describe("Breadcrumbs", () => {
  describe("hierarchy rendering", () => {
    it("renders a multi-level hierarchy in the correct order", () => {
      render(<Breadcrumbs items={multiLevel} />);

      const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
      const listItems = within(nav).getAllByRole("listitem");
      expect(listItems).toHaveLength(3);
      expect(listItems[0]).toHaveTextContent("Home");
      expect(listItems[1]).toHaveTextContent("Explore Campaigns");
      expect(listItems[2]).toHaveTextContent("Flood Relief — Lagos");
    });

    it("links every crumb except the current page", () => {
      render(<Breadcrumbs items={multiLevel} />);

      const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
      const links = within(nav).getAllByRole("link");
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute("href", "/");
      expect(links[0]).toHaveAttribute("aria-label", "Navigate to Home");
      expect(links[1]).toHaveAttribute("href", "/explore");

      const current = within(nav).getByText("Flood Relief — Lagos");
      expect(current).toHaveAttribute("aria-current", "page");
      expect(within(nav).queryAllByRole("link")).toHaveLength(2);
    });

    it("does not truncate short labels", () => {
      render(<Breadcrumbs items={multiLevel} />);

      expect(screen.getByText("Explore Campaigns")).toBeInTheDocument();
      expect(screen.queryByText(/\.\.\./)).not.toBeInTheDocument();
    });
  });

  describe("truncation", () => {
    const longLinkLabel = "An Extremely Long Intermediate Breadcrumb Label Over Forty";
    const longCurrentLabel = "Another Very Long Current Page Title Exceeding The Limit";

    it("truncates long titles to 40 characters with an ellipsis", () => {
      expect(longLinkLabel.length).toBeGreaterThan(40);
      expect(longCurrentLabel.length).toBeGreaterThan(40);

      render(
        <Breadcrumbs
          items={[
            { label: longLinkLabel, href: "/a" },
            { label: longCurrentLabel, href: "/b" },
          ]}
        />,
      );

      const link = screen.getByRole("link", { name: `Navigate to ${longLinkLabel}` });
      expect(link).toHaveTextContent(`${longLinkLabel.slice(0, 40)}...`);
      expect(link).toHaveAttribute("title", longLinkLabel);

      const current = screen.getByText(`${longCurrentLabel.slice(0, 40)}...`);
      expect(current).toHaveAttribute("aria-current", "page");
      expect(current).toHaveAttribute("title", longCurrentLabel);
    });

    it("keeps the full label available to assistive tech and tooltips", () => {
      render(
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: longLinkLabel, href: "/campaign/long" },
            { label: "Current Page", href: "/campaign/long/current" },
          ]}
        />,
      );

      const link = screen.getByRole("link", { name: `Navigate to ${longLinkLabel}` });
      expect(link).toHaveAttribute("title", longLinkLabel);
      expect(link).not.toHaveTextContent(longLinkLabel);
    });
  });

  describe("JSON-LD structured data", () => {
    it("emits a BreadcrumbList that matches the visible trail", () => {
      const { container } = render(<Breadcrumbs items={multiLevel} />);

      const script = container.querySelector('script[type="application/ld+json"]');
      expect(script).not.toBeNull();

      const data = JSON.parse(script!.textContent || script!.innerHTML);
      expect(data["@context"]).toBe("https://schema.org");
      expect(data["@type"]).toBe("BreadcrumbList");
      expect(data.itemListElement).toEqual(
        multiLevel.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.label,
          item: absoluteUrl(item.href),
        })),
      );

      const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
      const listItems = within(nav).getAllByRole("listitem");
      data.itemListElement.forEach((entry: { name: string; position: number }, i: number) => {
        expect(entry.position).toBe(i + 1);
        expect(listItems[i]).toHaveTextContent(entry.name);
      });

      const links = within(nav).getAllByRole("link");
      expect(links.map((link) => link.getAttribute("href"))).toEqual(
        multiLevel.slice(0, -1).map((item) => item.href),
      );
    });

    it("numbers positions sequentially starting at 1", () => {
      const { container } = render(<Breadcrumbs items={multiLevel} />);

      const script = container.querySelector('script[type="application/ld+json"]');
      const data = JSON.parse(script!.textContent || script!.innerHTML);
      expect(data.itemListElement.map((entry: { position: number }) => entry.position)).toEqual([
        1, 2, 3,
      ]);
    });
  });
});
