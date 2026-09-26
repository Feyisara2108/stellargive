import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Skeleton,
  SkeletonCard,
  SkeletonDetail,
  SkeletonList,
  SkeletonPreset,
  SkeletonStat,
} from "./skeleton";

// Skeleton has no shape prop of its own — every consumer configures its
// shape (line, circle, block) purely through className, e.g.
// `h-16 w-full`, `h-12 w-12 rounded-full`. These tests confirm the base
// pulse/rounded styling always applies and that a consumer's shape classes
// are preserved alongside it, for the shapes actually used across the app
// (leaderboard rows, avatar circles, table rows).
describe("Skeleton", () => {
  it("always applies the animate-pulse and rounded-md base classes", () => {
    render(<Skeleton data-testid="skeleton" />);
    const skeleton = screen.getByTestId("skeleton");
    expect(skeleton).toHaveClass("animate-pulse", "rounded-md", "bg-muted");
  });

  it("renders as a bare div with no children", () => {
    render(<Skeleton data-testid="skeleton" />);
    expect(screen.getByTestId("skeleton").tagName).toBe("DIV");
    expect(screen.getByTestId("skeleton")).toBeEmptyDOMElement();
  });

  it("renders a full-width line shape as configured", () => {
    render(<Skeleton data-testid="skeleton" className="h-16 w-full" />);
    const skeleton = screen.getByTestId("skeleton");
    expect(skeleton).toHaveClass("h-16", "w-full", "animate-pulse");
  });

  it("renders a circular avatar shape as configured, overriding the base rounding", () => {
    render(<Skeleton data-testid="skeleton" className="h-12 w-12 rounded-full" />);
    const skeleton = screen.getByTestId("skeleton");
    expect(skeleton).toHaveClass("h-12", "w-12", "rounded-full");
  });

  it("renders a block/card shape as configured", () => {
    render(<Skeleton data-testid="skeleton" className="h-28 w-full rounded-lg" />);
    const skeleton = screen.getByTestId("skeleton");
    expect(skeleton).toHaveClass("h-28", "w-full", "rounded-lg");
  });

  it("forwards arbitrary div props such as aria-hidden", () => {
    render(<Skeleton data-testid="skeleton" aria-hidden="true" />);
    expect(screen.getByTestId("skeleton")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Skeleton presets", () => {
  it("SkeletonCard renders the requested number of cards", () => {
    const { container } = render(<SkeletonCard count={2} />);
    const root = container.querySelector('[data-skeleton-variant="card"]')!;
    expect(root.children).toHaveLength(2);
  });

  it("SkeletonList renders fixed-height rows to avoid layout shift", () => {
    const { container } = render(<SkeletonList count={3} />);
    const rows = container.querySelectorAll('[data-skeleton-variant="list"] > li');
    expect(rows).toHaveLength(3);
    rows.forEach((row) => expect(row).toHaveClass("h-16"));
  });

  it("SkeletonStat mirrors StatCard label and value heights", () => {
    const { container } = render(<SkeletonStat count={1} />);
    const tile = container.querySelector('[data-skeleton-variant="stat"] > div')!;
    const [label, value] = Array.from(tile.children);
    expect(label).toHaveClass("h-4");
    expect(value).toHaveClass("h-8");
  });

  it("SkeletonDetail renders a heading, hero and body block", () => {
    const { container } = render(<SkeletonDetail />);
    expect(
      container.querySelector('[data-skeleton-variant="detail"] .aspect-video'),
    ).not.toBeNull();
  });

  it.each(["card", "list", "detail", "stat"] as const)(
    "SkeletonPreset renders the %s variant",
    (variant) => {
      const { container } = render(<SkeletonPreset variant={variant} />);
      expect(container.querySelector(`[data-skeleton-variant="${variant}"]`)).not.toBeNull();
    },
  );

  it("applies a consumer className to the preset root", () => {
    const { container } = render(<SkeletonPreset variant="stat" className="my-stats" />);
    expect(container.querySelector('[data-skeleton-variant="stat"]')).toHaveClass("my-stats");
  });
});
