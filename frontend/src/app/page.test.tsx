import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@/test/render";
import React from "react";

// Mock the Soroban hooks. useRecentCampaigns is overridden per-test to feed
// the featured carousel curated highlights.
vi.mock("@/hooks/useSoroban", async () =>
  (await import("@/test/mockSoroban")).createSorobanMock({
    useRecentCampaigns: vi.fn(() => ({ data: [], isLoading: false })),
  }),
);

// Keep the page lightweight: stub the heavy siblings so the carousel is the
// only thing under test.
vi.mock("@/components/Navbar", () => ({ Navbar: () => <div data-testid="navbar" /> }));
vi.mock("@/components/HeroCTA", () => ({ HeroCTA: () => <div data-testid="hero-cta" /> }));
vi.mock("@/components/PlatformStats", () => ({
  PlatformStats: () => <div data-testid="platform-stats" />,
}));
vi.mock("@/components/CampaignList", () => ({
  CampaignList: () => <div data-testid="campaign-list" />,
}));
vi.mock("@/components/EventFeed", () => ({ EventFeed: () => <div data-testid="event-feed" /> }));

// CampaignCard is stubbed so the carousel's current slide is identifiable by
// its title/label without pulling in the real card's wallet + token hooks.
vi.mock("@/components/CampaignCard", () => ({
  CampaignCard: ({
    campaign,
    highlightLabel,
  }: {
    campaign: { title: string };
    highlightLabel?: string;
  }) => (
    <div data-testid="campaign-card">
      <span data-testid="campaign-title">{campaign.title}</span>
      {highlightLabel ? <span data-testid="highlight-label">{highlightLabel}</span> : null}
    </div>
  ),
}));

import Home from "@/app/page";
import { useRecentCampaigns } from "@/hooks/useSoroban";
import { buildCampaign } from "@/test/factories";

const NOW = Math.floor(Date.now() / 1000);

// Three active campaigns: two near their goal (50–99% funded) and one trending.
// `curateHighlights` orders near-goal by progress desc, then trending by score,
// so the reel is: 0 "Near Goal Two" (75%), 1 "Near Goal One" (60%), 2 "Trending One".
const CAMPAIGNS = [
  buildCampaign({
    id: 1n,
    title: "Near Goal One",
    target_amount: 100n,
    raised_amount: 60n,
    deadline: BigInt(NOW + 86_400 * 10),
    status: "Active",
  }),
  buildCampaign({
    id: 2n,
    title: "Near Goal Two",
    target_amount: 100n,
    raised_amount: 75n,
    deadline: BigInt(NOW + 86_400 * 10),
    status: "Active",
  }),
  buildCampaign({
    id: 3n,
    title: "Trending One",
    target_amount: 100n,
    raised_amount: 10n,
    deadline: BigInt(NOW + 86_400),
    status: "Active",
  }),
];

/** Override window.matchMedia so prefers-reduced-motion is controllable. */
function setPrefersReducedMotion(prefers: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? prefers : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

/** The carousel's aria-live status line, matched by slide number. */
const slide = (n: number) => new RegExp(`Showing featured campaign ${n} of 3`);

/**
 * Dispatch native touch events with the touches/changedTouches the React
 * synthetic handlers read. jsdom lacks a Touch constructor, so the touch
 * lists are attached to a plain Event via Object.defineProperty.
 */
function swipe(element: HTMLElement, fromX: number, toX: number) {
  const start = new Event("touchstart", { bubbles: true, cancelable: true });
  Object.defineProperty(start, "touches", { value: [{ clientX: fromX }], configurable: true });
  act(() => {
    element.dispatchEvent(start);
  });

  const end = new Event("touchend", { bubbles: true, cancelable: true });
  Object.defineProperty(end, "changedTouches", { value: [{ clientX: toX }], configurable: true });
  act(() => {
    element.dispatchEvent(end);
  });
}

beforeEach(() => {
  setPrefersReducedMotion(false);
  vi.mocked(useRecentCampaigns).mockReturnValue({ data: CAMPAIGNS, isLoading: false } as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Home page", () => {
  describe("Featured carousel navigation", () => {
    it("shows the first curated highlight on load", () => {
      render(<Home />);
      expect(screen.getByText(slide(1))).toBeInTheDocument();
      expect(screen.getByTestId("campaign-title")).toHaveTextContent("Near Goal Two");
    });

    it("advances and wraps via the previous/next buttons", () => {
      render(<Home />);

      fireEvent.click(screen.getByRole("button", { name: "Next featured campaign" }));
      expect(screen.getByText(slide(2))).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Next featured campaign" }));
      expect(screen.getByText(slide(3))).toBeInTheDocument();

      // Next wraps back to the first slide.
      fireEvent.click(screen.getByRole("button", { name: "Next featured campaign" }));
      expect(screen.getByText(slide(1))).toBeInTheDocument();

      // Previous wraps from the first slide to the last.
      fireEvent.click(screen.getByRole("button", { name: "Previous featured campaign" }));
      expect(screen.getByText(slide(3))).toBeInTheDocument();
    });

    it("jumps straight to a slide via the pagination dots", () => {
      render(<Home />);

      fireEvent.click(screen.getByRole("button", { name: "Go to featured campaign 3 of 3" }));
      expect(screen.getByText(slide(3))).toBeInTheDocument();
      expect(screen.getByTestId("campaign-title")).toHaveTextContent("Trending One");
    });

    it("moves with ArrowRight/ArrowLeft and ignores other keys", () => {
      render(<Home />);
      const carousel = screen.getByRole("region", { name: "Featured campaigns" });

      fireEvent.keyDown(carousel, { key: "ArrowRight" });
      expect(screen.getByText(slide(2))).toBeInTheDocument();

      fireEvent.keyDown(carousel, { key: "ArrowLeft" });
      expect(screen.getByText(slide(1))).toBeInTheDocument();

      // A non-arrow key leaves the current slide in place.
      fireEvent.keyDown(carousel, { key: "Enter" });
      expect(screen.getByText(slide(1))).toBeInTheDocument();
    });

    it("swipes to the next slide past the threshold and ignores small drags", () => {
      render(<Home />);
      const carousel = screen.getByRole("region", { name: "Featured campaigns" });

      // A 30px drag is below the 50px threshold — no movement.
      swipe(carousel, 100, 70);
      expect(screen.getByText(slide(1))).toBeInTheDocument();

      // A leftward 80px swipe advances to the next slide.
      swipe(carousel, 100, 20);
      expect(screen.getByText(slide(2))).toBeInTheDocument();

      // A rightward 80px swipe goes back to the previous slide.
      swipe(carousel, 20, 100);
      expect(screen.getByText(slide(1))).toBeInTheDocument();
    });
  });

  describe("Auto-advance and reduced motion", () => {
    it("auto-advances the carousel on an interval", () => {
      vi.useFakeTimers();
      render(<Home />);
      expect(screen.getByText(slide(1))).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(6_000);
      });
      expect(screen.getByText(slide(2))).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(6_000);
      });
      expect(screen.getByText(slide(3))).toBeInTheDocument();
    });

    it("pauses auto-advance and renders a static grid under reduced motion", () => {
      setPrefersReducedMotion(true);
      vi.useFakeTimers();
      render(<Home />);

      // Reduced motion renders a static grid instead of the carousel.
      expect(screen.queryByRole("region", { name: "Featured campaigns" })).not.toBeInTheDocument();
      expect(screen.getAllByTestId("campaign-card")).toHaveLength(3);

      // No auto-advance fires even after the interval would have elapsed.
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(screen.getAllByTestId("campaign-card")).toHaveLength(3);
    });
  });

  describe("How It Works", () => {
    it("renders the three lifecycle steps in order", () => {
      render(<Home />);
      const section = screen.getByRole("region", { name: /How It Works/i });
      const steps = within(section).getAllByRole("heading", { level: 3 });
      expect(steps.map((h) => h.textContent)).toEqual(["Create", "Fund", "Claim"]);
    });

    it("links the Claim step to the create-campaign flow", () => {
      render(<Home />);
      const link = screen.getByRole("link", { name: /Start your own campaign/i });
      expect(link).toHaveAttribute("href", "/create");
    });
  });
});
