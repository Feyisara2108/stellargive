import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import React from "react";
import { UIModule55, RewardTier } from "./UIModule55";

expect.extend(toHaveNoViolations);

const sampleTiers: RewardTier[] = [
  {
    id: "t1",
    name: "Supporter Tier",
    minAmount: 50,
    description: "Get digital supporter badge",
    perks: ["NFT Badge", "Discord Role"],
    isPopular: false,
  },
  {
    id: "t2",
    name: "Champion Tier",
    minAmount: 250,
    description: "Featured on donor wall",
    perks: ["NFT Badge", "Discord Role", "Donor Wall Mention"],
    isPopular: true,
  },
];

describe("UIModule55 Component", () => {
  it("renders loading state correctly", () => {
    render(<UIModule55 isLoading={true} />);
    expect(screen.getByTestId("uimodule55-loading")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("renders error state and triggers retry callback", () => {
    const handleRetry = vi.fn();
    render(<UIModule55 error="Failed to load tiers" onRetry={handleRetry} />);

    expect(screen.getByTestId("uimodule55-error")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    const retryBtn = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it("renders empty state when no tiers are available", () => {
    render(<UIModule55 tiers={[]} />);
    expect(screen.getByTestId("uimodule55-empty")).toBeInTheDocument();
    expect(screen.getByText(/no reward tiers available/i)).toBeInTheDocument();
  });

  it("renders reward tiers and triggers selection", () => {
    const handleSelectTier = vi.fn();
    render(<UIModule55 tiers={sampleTiers} onSelectTier={handleSelectTier} />);

    expect(screen.getByTestId("uimodule55-content")).toBeInTheDocument();
    expect(screen.getByText("Supporter Tier")).toBeInTheDocument();

    const selectButtons = screen.getAllByRole("button", { name: /select tier/i });
    expect(selectButtons.length).toBe(2);

    fireEvent.click(selectButtons[0]);
    expect(handleSelectTier).toHaveBeenCalledWith(sampleTiers[0]);
  });

  it("passes accessibility (axe) audit with zero violations", async () => {
    const { container } = render(<UIModule55 tiers={sampleTiers} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
