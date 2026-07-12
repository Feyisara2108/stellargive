import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Footer } from "./Footer";
import { useRpcHealth } from "@/hooks/useRpcHealth";
import "@testing-library/jest-dom";

// Mock Next.js Link for consistent rendering
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Footer renders an RPC status dot driven by this hook.
vi.mock("@/hooks/useRpcHealth", () => ({
  useRpcHealth: vi.fn(),
}));

const mockUseRpcHealth = vi.mocked(useRpcHealth);

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

  describe("RPC status indicator", () => {
    it("shows a healthy label with latency when the RPC is healthy", () => {
      mockUseRpcHealth.mockReturnValue({ status: "healthy", latencyMs: 42 } as any);
      render(<Footer />);
      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "RPC healthy · 42ms");
    });

    it("shows a degraded label with latency when the RPC is degraded", () => {
      mockUseRpcHealth.mockReturnValue({ status: "degraded", latencyMs: 900 } as any);
      render(<Footer />);
      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "RPC degraded · 900ms");
    });

    it("shows an unreachable label when the RPC is down", () => {
      mockUseRpcHealth.mockReturnValue({ status: "down", latencyMs: null } as any);
      render(<Footer />);
      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "RPC unreachable");
    });

    it("shows a checking state before the first health result arrives", () => {
      mockUseRpcHealth.mockReturnValue(undefined as any);
      render(<Footer />);
      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Checking RPC…");
    });
  });
});
