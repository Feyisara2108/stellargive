import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button, buttonVariants } from "./button";

describe("Button", () => {
  it.each([
    ["default", "bg-primary"],
    ["destructive", "bg-destructive"],
    ["outline", "border"],
    ["secondary", "bg-secondary"],
    ["ghost", "hover:bg-accent"],
    ["link", "text-primary"],
  ] as const)("renders the %s variant with its expected classes", (variant, expectedClass) => {
    render(<Button variant={variant}>Click me</Button>);
    expect(screen.getByRole("button")).toHaveClass(expectedClass);
  });

  it.each([
    ["default", "h-10"],
    ["sm", "h-9"],
    ["lg", "h-11"],
    ["icon", "h-10", "w-10"],
  ] as const)("renders the %s size with its expected classes", (size, ...expectedClasses) => {
    render(<Button size={size}>Click me</Button>);
    for (const expectedClass of expectedClasses) {
      expect(screen.getByRole("button")).toHaveClass(expectedClass);
    }
  });

  it("matches buttonVariants output for the default variant/size combination", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button")).toHaveClass(buttonVariants());
  });

  it("renders a native button element by default", () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole("button");
    expect(button.tagName).toBe("BUTTON");
  });

  it("renders the child element instead of a button when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/explore">Explore</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Explore" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/explore");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("applies button variant classes to the composed child when asChild is set", () => {
    render(
      <Button asChild variant="destructive">
        <a href="/danger">Danger</a>
      </Button>,
    );

    expect(screen.getByRole("link")).toHaveClass("bg-destructive");
  });

  it("does not fire the click handler when disabled", async () => {
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick}>
        Click me
      </Button>,
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();

    button.click();
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("fires the click handler when enabled", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    screen.getByRole("button").click();
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
