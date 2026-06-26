import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AddressLink } from "./AddressLink";
import * as useSorobanModule from "@/hooks/useSoroban";

const FULL_ADDRESS = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
// formatAddress slices first 4 + last 4: "GA7Q...VSGZ"
const TRUNCATED = "GA7Q...VSGZ";
const RESOLVED_NAME = "myname.stellar";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("AddressLink — truncation", () => {
  it("renders the truncated form of the address when no name is resolved", () => {
    vi.spyOn(useSorobanModule, "useResolvedName").mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      status: "success",
    } as any);
    render(<AddressLink address={FULL_ADDRESS} />);
    expect(screen.getByText(TRUNCATED)).toBeInTheDocument();
  });

  it("renders the resolved name when available", () => {
    vi.spyOn(useSorobanModule, "useResolvedName").mockReturnValue({
      data: RESOLVED_NAME,
      isLoading: false,
      isError: false,
      error: null,
      status: "success",
    } as any);
    render(<AddressLink address={FULL_ADDRESS} />);
    expect(screen.getByText(RESOLVED_NAME)).toBeInTheDocument();
  });

  it("does not render the full address as visible text", () => {
    vi.spyOn(useSorobanModule, "useResolvedName").mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      status: "success",
    } as any);
    render(<AddressLink address={FULL_ADDRESS} />);
    // The full address appears only on the title attribute, not as text
    expect(screen.queryByText(FULL_ADDRESS)).not.toBeInTheDocument();
  });

  it("keeps a short address (< 10 chars) unchanged", () => {
    vi.spyOn(useSorobanModule, "useResolvedName").mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      status: "success",
    } as any);
    render(<AddressLink address="GABCD" />);
    expect(screen.getByText("GABCD")).toBeInTheDocument();
  });
});

describe("AddressLink — href / explorer URL", () => {
  beforeEach(() => {
    vi.spyOn(useSorobanModule, "useResolvedName").mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      status: "success",
    } as any);
  });

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
  beforeEach(() => {
    vi.spyOn(useSorobanModule, "useResolvedName").mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      status: "success",
    } as any);
  });

  it("exposes the full address via the title attribute for tooltip/screen readers", () => {
    render(<AddressLink address={FULL_ADDRESS} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("title", FULL_ADDRESS);
  });
});
