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

/** Render the page and expand the given (collapsed by default) accordion items. */
async function openItems(questions: string[]) {
  const { default: userEvent } = await import("@testing-library/user-event");
  const user = userEvent.setup();
  render(<FaqPage />);
  for (const q of questions) {
    await user.click(screen.getByRole("button", { name: q }));
  }
  return user;
}

describe("FaqPage - external links", () => {
  it("links to Friendbot and Stellar Lab with target=_blank and rel=noopener noreferrer", async () => {
    await openItems(["How do I get testnet XLM?"]);

    const friendbotLink = screen.getByRole("link", { name: /friendbot\.stellar\.org/i });
    expect(friendbotLink).toHaveAttribute("href", "https://friendbot.stellar.org");
    expect(friendbotLink).toHaveAttribute("target", "_blank");
    expect(friendbotLink).toHaveAttribute("rel", "noopener noreferrer");

    const labLink = screen.getByRole("link", { name: /Stellar Lab/i });
    expect(labLink).toHaveAttribute("href", "https://lab.stellar.org");
    expect(labLink).toHaveAttribute("target", "_blank");
    expect(labLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("lists Freighter as a supported wallet (plain text) and links to StellarExpert", async () => {
    await openItems(["Which wallet do I need?", "How can I verify activity on-chain?"]);

    // Freighter is named in the wallet answer but is no longer a hyperlink.
    expect(screen.getByText(/supported Stellar wallets: Freighter/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Freighter/i })).not.toBeInTheDocument();

    const expertLink = screen.getByRole("link", { name: /StellarExpert/i });
    expect(expertLink).toHaveAttribute("href", "https://stellar.expert/explorer/testnet");
  });

  it("links to the Stellar developer docs and the internal activity page", async () => {
    await openItems(["What is Soroban?", "How can I verify activity on-chain?"]);

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
