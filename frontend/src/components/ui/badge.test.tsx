import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, badgeVariants } from "./badge";

// Nothing previously guarded Badge's variant -> class mapping. These tests
// assert on the classes badgeVariants() actually produces rather than
// hardcoding the class strings, so they track badgeVariants as the source of
// truth and only fail on a real behavior change (e.g. a variant losing its
// distinguishing classes), not a cosmetic rewording of an unrelated variant.
describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("applies the default variant when none is specified", () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText("Default");
    for (const cls of badgeVariants({ variant: "default" }).split(" ")) {
      expect(badge).toHaveClass(cls);
    }
  });

  it.each(["default", "secondary", "destructive", "outline"] as const)(
    "applies the %s variant's classes",
    (variant) => {
      render(<Badge variant={variant}>{variant}</Badge>);
      const badge = screen.getByText(variant);
      for (const cls of badgeVariants({ variant }).split(" ")) {
        expect(badge).toHaveClass(cls);
      }
    },
  );

  it("distinguishes each variant's classes from the others", () => {
    const variants = ["default", "secondary", "destructive", "outline"] as const;
    const classSets = variants.map((v) => badgeVariants({ variant: v }));
    expect(new Set(classSets).size).toBe(variants.length);
  });

  it("merges a custom className without dropping the variant's classes", () => {
    render(
      <Badge variant="secondary" className="ml-2">
        Custom
      </Badge>,
    );
    const badge = screen.getByText("Custom");
    expect(badge).toHaveClass("ml-2");
    for (const cls of badgeVariants({ variant: "secondary" }).split(" ")) {
      expect(badge).toHaveClass(cls);
    }
  });

  it("forwards arbitrary div props, e.g. a data-testid", () => {
    render(<Badge data-testid="status-badge">Pending</Badge>);
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Pending");
  });
});
