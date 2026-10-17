import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import NotFound from "./not-found";

vi.mock("@/components/Navbar", () => ({ Navbar: () => <div data-testid="navbar" /> }));

describe("NotFound (app/not-found.tsx)", () => {
  it("renders the 404 heading and message", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByText(/doesn't exist or has moved/i)).toBeInTheDocument();
  });

  it("renders a 'Go Home' link pointing to '/'", () => {
    render(<NotFound />);
    const link = screen.getByRole("link", { name: /go home/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });

  it("renders an 'Explore Campaigns' link pointing to '/explore'", () => {
    render(<NotFound />);
    const link = screen.getByRole("link", { name: /explore campaigns/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/explore");
  });

  it("renders the app Navbar", () => {
    render(<NotFound />);
    expect(screen.getByTestId("navbar")).toBeInTheDocument();
  });
});
