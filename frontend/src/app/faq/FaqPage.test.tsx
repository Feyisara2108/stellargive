import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import FaqPage from "./page";

vi.mock("@/components/Navbar", () => ({ Navbar: () => <div /> }));

describe("FaqPage - accordion", () => {
  it("has the first item expanded by default and the rest collapsed", () => {
    render(<FaqPage />);

    const firstButton = screen.getByRole("button", { name: /How do donations work\?/i });
    expect(firstButton).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText(/transfers tokens into the campaign's smart contract/i),
    ).toBeInTheDocument();

    const stroopsButton = screen.getByRole("button", { name: /What are Stroops\?/i });
    expect(stroopsButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/smallest unit of a Stellar asset/i)).not.toBeInTheDocument();
  });

  it("expands a collapsed item on click and collapses it again on a second click", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<FaqPage />);

    const stroopsButton = screen.getByRole("button", { name: /What are Stroops\?/i });

    await user.click(stroopsButton);
    expect(stroopsButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/smallest unit of a Stellar asset/i)).toBeInTheDocument();

    await user.click(stroopsButton);
    expect(stroopsButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/smallest unit of a Stellar asset/i)).not.toBeInTheDocument();
  });

  it("collapses the default-open item on click", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<FaqPage />);

    const firstButton = screen.getByRole("button", { name: /How do donations work\?/i });
    await user.click(firstButton);

    expect(firstButton).toHaveAttribute("aria-expanded", "false");
  });
});

describe("FaqPage - external links", () => {
  it("links to Friendbot and Stellar Lab with target=_blank and rel=noopener noreferrer", () => {
    render(<FaqPage />);

    const friendbotLink = screen.getByRole("link", { name: /friendbot\.stellar\.org/i });
    expect(friendbotLink).toHaveAttribute("href", "https://friendbot.stellar.org");
    expect(friendbotLink).toHaveAttribute("target", "_blank");
    expect(friendbotLink).toHaveAttribute("rel", "noopener noreferrer");

    const labLink = screen.getByRole("link", { name: /Stellar Lab/i });
    expect(labLink).toHaveAttribute("href", "https://lab.stellar.org");
    expect(labLink).toHaveAttribute("target", "_blank");
    expect(labLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("links to Freighter and StellarExpert", () => {
    render(<FaqPage />);

    const freighterLink = screen.getByRole("link", { name: /Freighter/i });
    expect(freighterLink).toHaveAttribute("href", "https://www.freighter.app");

    const expertLink = screen.getByRole("link", { name: /StellarExpert/i });
    expect(expertLink).toHaveAttribute("href", "https://stellar.expert/explorer/testnet");
  });

  it("links to the Stellar developer docs and the internal activity page", () => {
    render(<FaqPage />);

    const devDocsLink = screen.getByRole("link", { name: /Stellar developer docs/i });
    expect(devDocsLink).toHaveAttribute(
      "href",
      "https://developers.stellar.org/docs/build/smart-contracts/overview",
    );

    const activityLink = screen.getByRole("link", { name: /Transaction History/i });
    expect(activityLink).toHaveAttribute("href", "/activity");
    expect(activityLink).not.toHaveAttribute("target");
  });
});
