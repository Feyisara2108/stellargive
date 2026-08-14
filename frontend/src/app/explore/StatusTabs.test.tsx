/**
 * Focused accessibility tests for the ARIA status-tab widget in ExplorePage.
 *
 * We render ExploreContent in isolation with all heavy dependencies mocked so
 * the tests stay fast and deterministic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ExplorePage from "./page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MockWalletProvider } from "@/components/MockWalletProvider";
import { setMockCampaigns } from "@/mocks/handlers";
import React from "react";

// ── mocks ──────────────────────────────────────────────────────────────────
let currentStatus = "";

const mockReplace = vi.fn((url: string) => {
  const match = url.match(/status=([^&]+)/);
  currentStatus = match ? match[1] : "";
});

const searchParamsObj = {
  get: (key: string) => (key === "status" ? (currentStatus || null) : null),
  toString: () => (currentStatus ? `status=${currentStatus}` : ""),
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => searchParamsObj,
  usePathname: () => "/explore",
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav /> }));
vi.mock("@/components/CampaignCard", () => ({
  CampaignCard: ({ campaign }: any) => <div data-testid="campaign-card">{campaign.title}</div>,
}));

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MockWalletProvider>
        <ExplorePage />
      </MockWalletProvider>
    </QueryClientProvider>,
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────
function getTab(name: string) {
  return screen.getByRole("tab", { name: new RegExp(name, "i") });
}

// ── tests ────────────────────────────────────────────────────────────────────
beforeEach(() => {
  setMockCampaigns([]);
});

describe("Status tabs – ARIA wiring", () => {
  it("renders exactly three tabs inside a tablist", () => {
    renderPage();
    const tablist = screen.getByRole("tablist");
    const tabs = screen.getAllByRole("tab");
    expect(tablist).toBeInTheDocument();
    expect(tabs).toHaveLength(3);
  });

  it("marks only the selected tab as aria-selected=true", () => {
    renderPage();
    // Default selection is 'active'
    expect(getTab("active")).toHaveAttribute("aria-selected", "true");
    expect(getTab("all")).toHaveAttribute("aria-selected", "false");
    expect(getTab("funded")).toHaveAttribute("aria-selected", "false");
  });

  it("gives tabIndex=0 only to the selected tab, -1 to others", () => {
    renderPage();
    expect(getTab("active")).toHaveAttribute("tabindex", "0");
    expect(getTab("all")).toHaveAttribute("tabindex", "-1");
    expect(getTab("funded")).toHaveAttribute("tabindex", "-1");
  });

  it("each tab has aria-controls pointing at the results panel", () => {
    renderPage();
    const tabs = screen.getAllByRole("tab");
    const panelId = "campaign-results-panel";
    tabs.forEach((tab) => expect(tab).toHaveAttribute("aria-controls", panelId));
  });

  it("the results panel has role=tabpanel and a matching aria-labelledby", () => {
    renderPage();
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "campaign-results-panel");
    // Initially 'active' tab is selected; panel should be labelled by it
    expect(panel).toHaveAttribute("aria-labelledby", "status-tab-active");
  });
});

describe("Status tabs – keyboard navigation", () => {
  it("ArrowRight moves focus and selection to the next tab (wraps around)", () => {
    renderPage();
    const activeTab = getTab("active");
    activeTab.focus();

    fireEvent.keyDown(activeTab, { key: "ArrowRight" });
    expect(document.activeElement).toBe(getTab("funded"));
    expect(getTab("funded")).toHaveAttribute("aria-selected", "true");
  });

  it("ArrowLeft moves focus and selection to the previous tab (wraps around)", () => {
    renderPage();
    const allTab = getTab("all");
    allTab.focus();

    fireEvent.keyDown(allTab, { key: "ArrowLeft" });
    // Wrap: 'all' (index 0) → 'funded' (index 2)
    expect(document.activeElement).toBe(getTab("funded"));
    expect(getTab("funded")).toHaveAttribute("aria-selected", "true");
  });

  it("Home key moves focus to the first tab", () => {
    renderPage();
    const fundedTab = getTab("funded");
    fireEvent.click(fundedTab); // select last tab first
    fundedTab.focus();

    fireEvent.keyDown(fundedTab, { key: "Home" });
    expect(document.activeElement).toBe(getTab("all"));
  });

  it("End key moves focus to the last tab", () => {
    renderPage();
    const allTab = getTab("all");
    fireEvent.click(allTab);
    allTab.focus();

    fireEvent.keyDown(allTab, { key: "End" });
    expect(document.activeElement).toBe(getTab("funded"));
  });
});
