import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AddressLink } from "./AddressLink";

const FULL_ADDRESS = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
// formatAddress slices first 4 + last 4: "GA7Q...VSGZ"
const TRUNCATED = "GA7Q...VSGZ";

describe("AddressLink — truncation", () => {
  it("renders the truncated form of the address", () => {
    render(<AddressLink address={FULL_ADDRESS} />);
    expect(screen.getByText(TRUNCATED)).toBeInTheDocument();
  });

  it("does not render the full address as visible text", () => {
    render(<AddressLink address={FULL_ADDRESS} />);
    // The full address appears only on the title attribute, not as text
    expect(screen.queryByText(FULL_ADDRESS)).not.toBeInTheDocument();
  });

  it("keeps a short address (< 10 chars) unchanged", () => {
    render(<AddressLink address="GABCD" />);
    expect(screen.getByText("GABCD")).toBeInTheDocument();
  });
});

describe("AddressLink — href / explorer URL", () => {
  it("defaults to the testnet explorer URL", () => {
    render(<AddressLink address={FULL_ADDRESS} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/account/${FULL_ADDRESS}`,
    );
  });

  it("uses the public network explorer URL when network='public'", () => {
    render(<AddressLink address={FULL_ADDRESS} network="public" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/public/account/${FULL_ADDRESS}`,
    );
  });

  it("opens the link in a new tab", () => {
    render(<AddressLink address={FULL_ADDRESS} />);
    expect(screen.getByRole("link")).toHaveAttribute("target", "_blank");
  });

  it("sets rel='noopener noreferrer' for security", () => {
    render(<AddressLink address={FULL_ADDRESS} />);
    expect(screen.getByRole("link")).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("AddressLink — accessible label", () => {
  it("exposes the full address via the title attribute for tooltip/screen readers", () => {
    render(<AddressLink address={FULL_ADDRESS} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("title", FULL_ADDRESS);
  });
});
