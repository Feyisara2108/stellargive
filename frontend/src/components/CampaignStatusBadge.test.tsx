import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CampaignStatusBadge } from "./CampaignStatusBadge";

describe("CampaignStatusBadge — label text", () => {
  it("renders Active label", () => {
    render(<CampaignStatusBadge status="Active" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders Funded label", () => {
    render(<CampaignStatusBadge status="Funded" />);
    expect(screen.getByText("Funded")).toBeInTheDocument();
  });

  it("renders Claimed label", () => {
    render(<CampaignStatusBadge status="Claimed" />);
    expect(screen.getByText("Claimed")).toBeInTheDocument();
  });

  it("renders Expired label", () => {
    render(<CampaignStatusBadge status="Expired" />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("renders Cancelled label", () => {
    render(<CampaignStatusBadge status="Cancelled" />);
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });
});

describe("CampaignStatusBadge — style classes", () => {
  it("applies green classes for Active", () => {
    const { container } = render(<CampaignStatusBadge status="Active" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("bg-green-500/20");
    expect(badge.className).toContain("text-green-500");
  });

  it("applies blue classes for Funded", () => {
    // Funded/Claimed default to 100% progress and also render milestone badges,
    // so query the status badge by its label rather than container.firstChild.
    render(<CampaignStatusBadge status="Funded" />);
    const badge = screen.getByText("Funded");
    expect(badge.className).toContain("bg-blue-500/20");
    expect(badge.className).toContain("text-blue-500");
  });

  it("applies blue classes for Claimed", () => {
    render(<CampaignStatusBadge status="Claimed" />);
    const badge = screen.getByText("Claimed");
    expect(badge.className).toContain("bg-blue-500/20");
    expect(badge.className).toContain("text-blue-500");
  });

  it("applies destructive classes for Cancelled", () => {
    const { container } = render(<CampaignStatusBadge status="Cancelled" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("bg-destructive/20");
    expect(badge.className).toContain("text-destructive");
  });

  it("applies muted classes for Expired", () => {
    const { container } = render(<CampaignStatusBadge status="Expired" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("bg-muted");
    expect(badge.className).toContain("text-muted-foreground");
  });
});

describe("CampaignStatusBadge — fallback", () => {
  it("renders fallback for unknown status without throwing", () => {
    render(<CampaignStatusBadge status="UnknownStatus" />);
    expect(screen.getByText("UnknownStatus")).toBeInTheDocument();
  });

  it("applies muted classes for unknown status (default fallback)", () => {
    const { container } = render(<CampaignStatusBadge status="Random" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("bg-muted");
    expect(badge.className).toContain("text-muted-foreground");
  });
});

describe("CampaignStatusBadge — deadline override", () => {
  it("shows Expired when Active status but deadline has passed", () => {
    const pastDeadline = BigInt(Math.floor(Date.now() / 1000) - 1000);
    render(<CampaignStatusBadge status="Active" deadline={pastDeadline} />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("shows Active when Active status and deadline is in the future", () => {
    const futureDeadline = BigInt(Math.floor(Date.now() / 1000) + 86400);
    render(<CampaignStatusBadge status="Active" deadline={futureDeadline} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});
