import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Progress, progressIndicatorVariants } from "./progress";

function getIndicator(container: HTMLElement) {
  const indicator = container.querySelector('[role="progressbar"] > div');
  if (!(indicator instanceof HTMLElement)) {
    throw new Error("Progress indicator not found");
  }
  return indicator;
}

describe("Progress", () => {
  it("sets the indicator transform to fully hidden at 0%", () => {
    const { container } = render(<Progress value={0} />);
    expect(getIndicator(container)).toHaveStyle({ transform: "translateX(-100%)" });
  });

  it("sets the indicator transform to half-visible at 50%", () => {
    const { container } = render(<Progress value={50} />);
    expect(getIndicator(container)).toHaveStyle({ transform: "translateX(-50%)" });
  });

  it("sets the indicator transform to fully visible at 100%", () => {
    const { container } = render(<Progress value={100} />);
    expect(getIndicator(container)).toHaveStyle({ transform: "translateX(-0%)" });
  });

  it("clamps values above 100 to a fully visible indicator", () => {
    const { container } = render(<Progress value={150} />);
    expect(getIndicator(container)).toHaveStyle({ transform: "translateX(-0%)" });
  });

  it("clamps negative values to a fully hidden indicator", () => {
    const { container } = render(<Progress value={-20} />);
    expect(getIndicator(container)).toHaveStyle({ transform: "translateX(-100%)" });
  });

  it("defaults to 0% when no value is provided", () => {
    const { container } = render(<Progress />);
    expect(getIndicator(container)).toHaveStyle({ transform: "translateX(-100%)" });
  });

  it.each(Object.entries(progressIndicatorVariants))(
    "applies the %s indicator variant class",
    (_variant, expectedClass) => {
      const firstClass = expectedClass.split(" ")[0];
      const { container } = render(<Progress value={40} indicatorClassName={expectedClass} />);
      expect(getIndicator(container)).toHaveClass(firstClass);
    },
  );

  it("does not render a value label by default", () => {
    render(<Progress value={42} />);
    expect(screen.queryByText("42%")).not.toBeInTheDocument();
  });

  it("renders the rounded percentage label when showValueLabel is set", () => {
    render(<Progress value={42.6} showValueLabel />);
    expect(screen.getByText("43%")).toBeInTheDocument();
  });

  it("clamps the value label at 100% for out-of-range values", () => {
    render(<Progress value={250} showValueLabel />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
