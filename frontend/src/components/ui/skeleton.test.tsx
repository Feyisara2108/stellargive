import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Skeleton } from "./skeleton";

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
