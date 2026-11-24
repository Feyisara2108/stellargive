import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Footer } from "./Footer";
import { useRpcHealth } from "@/hooks/useRpcHealth";
import { toast } from "sonner";
import { CONTRACT_ID } from "@/lib/config";
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

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockUseRpcHealth = vi.mocked(useRpcHealth);
const mockToast = vi.mocked(toast);

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

    it("renders external navigation links and social links", () => {
      render(<Footer />);

      const explorerLink = screen.getByRole("link", { name: /^explorer /i });
      expect(explorerLink).toHaveAttribute("href", "https://stellar.expert/explorer/testnet");
      expect(explorerLink).toHaveAttribute("target", "_blank");

      const docLink = screen.getByRole("link", { name: /^documentation /i });
      expect(docLink).toHaveAttribute("href", "https://github.com/Feyisara2108/stellargive#readme");

      const contractLink = screen.getByRole("link", { name: /^contracts /i });
      expect(contractLink).toHaveAttribute(
        "href",
        "https://github.com/Feyisara2108/stellargive#contracts",
      );

      const githubLink = screen.getByRole("link", { name: /^github /i });
      expect(githubLink).toHaveAttribute("href", "https://github.com/Feyisara2108/stellargive");

      const securityLink = screen.getByRole("link", { name: /security policy/i });
      expect(securityLink).toHaveAttribute(
        "href",
        "https://github.com/Feyisara2108/stellargive/blob/main/SECURITY.md",
      );

      const webLink = screen.getByRole("link", { name: /stellargive website/i });
      expect(webLink).toHaveAttribute("href", "https://stellargive.org");

      const xLink = screen.getByRole("link", { name: /stellargive on x/i });
      expect(xLink).toHaveAttribute("href", "https://twitter.com/stellargive");
    });

    it("gives every link that opens in a new tab an accessible name ending in '(opens in a new tab)'", () => {
      render(<Footer />);

      const newTabLinks = screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("target") === "_blank");
      expect(newTabLinks.length).toBeGreaterThan(0);

      newTabLinks.forEach((link) => {
        const accessibleName = (link.getAttribute("aria-label") ?? link.textContent ?? "").trim();
        expect(accessibleName.endsWith("(opens in a new tab)")).toBe(true);
      });
    });
  });

  describe("RPC status indicator", () => {
    it("shows a healthy label with latency when the RPC is healthy", () => {
      mockUseRpcHealth.mockReturnValue({ status: "healthy", latencyMs: 42 } as any);
      render(<Footer />);
      expect(screen.getByRole("status")).toHaveAttribute(
        "aria-label",
        "RPC healthy · 42ms · custom",
      );
    });

    it("shows a degraded label with latency when the RPC is degraded", () => {
      mockUseRpcHealth.mockReturnValue({ status: "degraded", latencyMs: 900 } as any);
      render(<Footer />);
      expect(screen.getByRole("status")).toHaveAttribute(
        "aria-label",
        "RPC degraded · 900ms · custom",
      );
    });

    it("shows an unreachable label when the RPC is down", () => {
      mockUseRpcHealth.mockReturnValue({ status: "down", latencyMs: null } as any);
      render(<Footer />);
      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "RPC unreachable · custom");
    });

    it("shows a checking state before the first health result arrives", () => {
      mockUseRpcHealth.mockReturnValue(undefined as any);
      render(<Footer />);
      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Checking RPC… · custom");
    });
  });

  describe("ContractIdDisplay", () => {
    beforeEach(() => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      });
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows truncated contract ID by default and toggles expand/collapse on click", () => {
      render(<Footer />);

      const toggleButton = screen.getByTitle("Click to expand");
      const truncated = `${CONTRACT_ID.slice(0, 6)}…${CONTRACT_ID.slice(-6)}`;
      expect(toggleButton).toHaveTextContent(truncated);
      expect(toggleButton).toHaveAttribute("aria-expanded", "false");

      fireEvent.click(toggleButton);
      expect(toggleButton).toHaveTextContent(CONTRACT_ID);
      expect(toggleButton).toHaveAttribute("title", "Click to collapse");
      expect(toggleButton).toHaveAttribute("aria-expanded", "true");

      fireEvent.click(toggleButton);
      expect(toggleButton).toHaveTextContent(truncated);
      expect(toggleButton).toHaveAttribute("title", "Click to expand");
      expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    });

    it("copies contract ID to clipboard on copy button click and reverts after 2 seconds", async () => {
      render(<Footer />);

      const copyButton = screen.getByRole("button", { name: /copy contract id/i });
      expect(copyButton).not.toHaveClass("text-green-500");

      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(CONTRACT_ID);
      expect(mockToast.success).toHaveBeenCalledWith("Contract ID copied!");
      expect(copyButton).toHaveClass("text-green-500");

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(copyButton).not.toHaveClass("text-green-500");
    });

    it("shows error toast when copying to clipboard fails", async () => {
      vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("Clipboard error"));
      render(<Footer />);

      const copyButton = screen.getByRole("button", { name: /copy contract id/i });

      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(mockToast.error).toHaveBeenCalledWith("Couldn't copy — copy it manually.");
      expect(copyButton).not.toHaveClass("text-green-500");
    });
  });

  describe("ContractIdDisplay with empty or short CONTRACT_ID", () => {
    it("renders nothing when CONTRACT_ID is empty", async () => {
      vi.resetModules();
      vi.doMock("@/lib/config", () => ({
        CONTRACT_ID: "",
      }));
      vi.doMock("@/hooks/useRpcHealth", () => ({
        useRpcHealth: () => ({ status: "healthy", latencyMs: 30 }),
      }));

      const { Footer: DynamicFooter } = await import("./Footer");
      render(<DynamicFooter />);

      expect(screen.queryByText(/Contract ID:/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /copy contract id/i })).not.toBeInTheDocument();
    });

    it("does not truncate when contract ID is 12 characters or less", async () => {
      vi.resetModules();
      vi.doMock("@/lib/config", () => ({
        CONTRACT_ID: "SHORT_ID_123",
      }));
      vi.doMock("@/hooks/useRpcHealth", () => ({
        useRpcHealth: () => ({ status: "healthy", latencyMs: 30 }),
      }));

      const { Footer: DynamicFooter } = await import("./Footer");
      render(<DynamicFooter />);

      const toggleButton = screen.getByTitle("Click to expand");
      expect(toggleButton).toHaveTextContent("SHORT_ID_123");
    });
  });

  describe("networkLabel via NETWORK_PASSPHRASE", () => {
    const testCases = [
      { passphrase: "Test SDF Network ; September 2015", expected: "testnet" },
      { passphrase: "Public Global (Mainnet) ; September 2015", expected: "mainnet" },
      { passphrase: "Custom Standalone Network", expected: "custom" },
      { passphrase: "", expected: "unknown" },
    ];

    testCases.forEach(({ passphrase, expected }) => {
      it(`resolves network label as '${expected}' for passphrase '${passphrase}'`, async () => {
        vi.resetModules();
        vi.doMock("@/lib/network", async () => {
          const actual = await vi.importActual<typeof import("@/lib/network")>("@/lib/network");
          return { ...actual, NETWORK_PASSPHRASE: passphrase };
        });
        vi.doMock("@/hooks/useRpcHealth", () => ({
          useRpcHealth: () => ({ status: "healthy", latencyMs: 50 }),
        }));

        const { Footer: DynamicFooter } = await import("./Footer");
        render(<DynamicFooter />);

        const status = screen.getByRole("status");
        expect(status).toHaveAttribute("aria-label", `RPC healthy · 50ms · ${expected}`);
      });
    });
  });

  describe("Explorer link network derivation", () => {
    it("points at /explorer/testnet by default", () => {
      render(<Footer />);
      const explorerLink = screen.getByRole("link", { name: /^explorer /i });
      expect(explorerLink).toHaveAttribute("href", "https://stellar.expert/explorer/testnet");
    });

    it("points at /explorer/public for a public-network passphrase, matching AddressLink", async () => {
      vi.resetModules();
      vi.doMock("@/lib/network", async () => {
        const actual = await vi.importActual<typeof import("@/lib/network")>("@/lib/network");
        return { ...actual, NETWORK_PASSPHRASE: actual.Networks.PUBLIC };
      });
      vi.doMock("@/hooks/useRpcHealth", () => ({
        useRpcHealth: () => ({ status: "healthy", latencyMs: 30 }),
      }));

      const { Footer: DynamicFooter } = await import("./Footer");
      render(<DynamicFooter />);

      const explorerLink = screen.getByRole("link", { name: /^explorer /i });
      expect(explorerLink).toHaveAttribute("href", "https://stellar.expert/explorer/public");
    });
  });
});
