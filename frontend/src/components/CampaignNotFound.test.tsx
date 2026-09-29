import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CampaignNotFound } from "./CampaignNotFound";
import "@testing-library/jest-dom";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("CampaignNotFound", () => {
  it("renders the not-found heading and explanation", () => {
    render(<CampaignNotFound />);

    expect(screen.getByRole("heading", { name: /campaign not found/i })).toBeInTheDocument();
    expect(screen.getByText(/doesn.t exist or has been removed/i)).toBeInTheDocument();
  });

  it("renders Browse and Create recovery CTAs with the expected destinations", () => {
    render(<CampaignNotFound />);

    expect(screen.getByRole("link", { name: /browse campaigns/i })).toHaveAttribute(
      "href",
      "/explore",
    );
    expect(screen.getByRole("link", { name: /create a campaign/i })).toHaveAttribute(
      "href",
      "/create",
    );
  });

  it("omits the suggested-campaigns section when no suggestions are provided", () => {
    render(<CampaignNotFound />);

    expect(screen.queryByRole("region", { name: /you might be interested in/i })).toBeNull();
    // Only the two CTAs are links.
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("omits the suggested-campaigns section when suggestions is empty", () => {
    render(<CampaignNotFound suggestions={[]} />);

    expect(screen.queryByRole("region", { name: /you might be interested in/i })).toBeNull();
  });

  it("renders a link to each suggested campaign when suggestions are provided", () => {
    render(
      <CampaignNotFound
        suggestions={[
          { id: 1n, title: "Clean Water Initiative" },
          { id: 42n, title: "School Supplies Drive" },
        ]}
      />,
    );

    const section = screen.getByRole("region", { name: /you might be interested in/i });
    const links = within(section).getAllByRole("link");

    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent("Clean Water Initiative");
    expect(links[0]).toHaveAttribute("href", "/campaign/1");
    expect(links[1]).toHaveTextContent("School Supplies Drive");
    expect(links[1]).toHaveAttribute("href", "/campaign/42");

    // Recovery CTAs are still present alongside the suggestions.
    expect(screen.getByRole("link", { name: /browse campaigns/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create a campaign/i })).toBeInTheDocument();
  });
});
