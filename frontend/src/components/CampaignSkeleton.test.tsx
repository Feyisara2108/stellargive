import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CampaignSkeleton, CampaignSkeletonGrid, CampaignDetailSkeleton } from "./CampaignSkeleton";
import "@testing-library/jest-dom";

// Every placeholder bar is rendered by the shared Skeleton primitive, which
// always carries `animate-pulse`.
const skeletonBars = (root: HTMLElement) => root.querySelectorAll(".animate-pulse");

describe("CampaignSkeleton", () => {
  it("renders the card placeholder layout mirroring CampaignCard", () => {
    const { container } = render(<CampaignSkeleton />);
    const card = container.firstElementChild as HTMLElement;

    expect(card).toHaveClass("flex", "flex-col");
    // badge + title, 2 progress labels, progress bar, 2 progress meta,
    // deadline, 4 creator/beneficiary cells, 2 footer buttons.
    expect(skeletonBars(card)).toHaveLength(14);
    // Full-width progress bar placeholder.
    expect(card.querySelector(".animate-pulse.h-2.w-full")).not.toBeNull();
  });
});

describe("CampaignSkeletonGrid", () => {
  it("renders 6 card placeholders by default", () => {
    const { container } = render(<CampaignSkeletonGrid />);
    const grid = container.firstElementChild as HTMLElement;

    expect(grid).toHaveClass("grid");
    expect(grid.children).toHaveLength(6);
  });

  it.each([1, 3, 9])("renders %i card placeholders when count=%i", (count) => {
    const { container } = render(<CampaignSkeletonGrid count={count} />);
    const grid = container.firstElementChild as HTMLElement;

    expect(grid.children).toHaveLength(count);
    expect(skeletonBars(grid)).toHaveLength(count * 14);
  });

  it("renders nothing inside the grid when count=0", () => {
    const { container } = render(<CampaignSkeletonGrid count={0} />);

    expect((container.firstElementChild as HTMLElement).children).toHaveLength(0);
  });
});

describe("CampaignDetailSkeleton", () => {
  it("is announced as a busy loading region", () => {
    render(<CampaignDetailSkeleton />);

    const region = screen.getByLabelText("Loading campaign");
    expect(region).toHaveAttribute("aria-busy", "true");
  });

  it("renders the detail layout placeholders including the donor sidebar", () => {
    const { container } = render(<CampaignDetailSkeleton />);
    const root = container.firstElementChild as HTMLElement;

    // Hero image placeholder.
    expect(root.querySelector(".animate-pulse.aspect-video")).not.toBeNull();
    // Donor sidebar: 3 rows, each with a round avatar placeholder.
    expect(root.querySelectorAll(".animate-pulse.rounded-full.h-8.w-8")).toHaveLength(3);
    // 17 breadcrumb/header/main-column bars + 1 sidebar title + 3 × 3 donor-row bars.
    expect(skeletonBars(root)).toHaveLength(27);
  });
});
