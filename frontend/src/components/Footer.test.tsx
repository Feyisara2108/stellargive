import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Footer } from "./Footer";
import "@testing-library/jest-dom";

// Mock Next.js Link for consistent rendering
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock the custom hook if needed, but Footer no longer uses it.
vi.mock("@/hooks/useRpcHealth", () => ({
  useRpcHealth: vi.fn(),
}));

describe("Footer Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Static Footprint & Link Verifications", () => {
    it("renders core navigational elements with expected href attributes", () => {
      render(<Footer />);

      const exploreLink = screen.getByRole("link", { name: /^explore$/i });
      expect(exploreLink).toBeInTheDocument();
      expect(exploreLink).toHaveAttribute("href", "/explore");

      const activityLink = screen.getByRole("link", { name: /activity/i });
      expect(activityLink).toBeInTheDocument();
      expect(activityLink).toHaveAttribute("href", "/activity");

      const faqLink = screen.getByRole("link", { name: /faq/i });
      expect(faqLink).toBeInTheDocument();
      expect(faqLink).toHaveAttribute("href", "/faq");
    });
  });
});
