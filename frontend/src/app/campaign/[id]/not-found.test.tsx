import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import CampaignNotFoundPage from "./not-found";

describe("CampaignNotFoundPage (app/campaign/[id]/not-found.tsx)", () => {
  it("renders the campaign-not-found heading and message", () => {
    render(<CampaignNotFoundPage />);
    expect(screen.getByRole("heading", { name: /campaign not found/i })).toBeInTheDocument();
    expect(screen.getByText(/doesn't exist or has been removed/i)).toBeInTheDocument();
  });

  it("renders a 'Browse Campaigns' link pointing to '/explore'", () => {
    render(<CampaignNotFoundPage />);
    const link = screen.getByRole("link", { name: /browse campaigns/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/explore");
  });
});
