import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import React from "react";
import { UIModule53, Milestone } from "./UIModule53";

expect.extend(toHaveNoViolations);

const sampleMilestones: Milestone[] = [
  {
    id: "m1",
    title: "Phase 1: Initial Setup",
    targetAmount: 500,
    currentAmount: 500,
    description: "Setup basic infrastructure",
    isCompleted: true,
  },
  {
    id: "m2",
    title: "Phase 2: Community Outreach",
    targetAmount: 1000,
    currentAmount: 250,
    description: "Launch education campaigns",
    isCompleted: false,
  },
];

describe("UIModule53 Component", () => {
  it("renders loading state correctly", () => {
    render(<UIModule53 isLoading={true} />);
    expect(screen.getByTestId("uimodule53-loading")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("renders error fallback state and triggers retry", () => {
    const handleRetry = vi.fn();
    render(<UIModule53 error="Failed to fetch data" onRetry={handleRetry} />);

    expect(screen.getByTestId("uimodule53-error")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Failed to fetch data")).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: /try again/i });
    expect(retryButton).toBeInTheDocument();
    fireEvent.click(retryButton);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it("renders empty fallback state when no milestones are provided", () => {
    render(<UIModule53 milestones={[]} />);
    expect(screen.getByTestId("uimodule53-empty")).toBeInTheDocument();
    expect(screen.getByText(/no milestones defined/i)).toBeInTheDocument();
  });

  it("renders milestones and handles donation tier selection", () => {
    const handleSelectTier = vi.fn();
    render(<UIModule53 milestones={sampleMilestones} onSelectTier={handleSelectTier} />);

    expect(screen.getByTestId("uimodule53-content")).toBeInTheDocument();
    expect(screen.getByText("Phase 1: Initial Setup")).toBeInTheDocument();

    const tierButton = screen.getByRole("button", { name: "25 XLM" });
    expect(tierButton).toBeInTheDocument();
    fireEvent.click(tierButton);

    expect(handleSelectTier).toHaveBeenCalledWith(25);
    expect(tierButton).toHaveAttribute("aria-pressed", "true");
  });

  it("passes accessibility (axe) audit with zero violations", async () => {
    const { container } = render(<UIModule53 milestones={sampleMilestones} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
