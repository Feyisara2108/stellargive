import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddressLink } from "./AddressLink";
import * as useSorobanModule from "@/hooks/useSoroban";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

describe("AddressLink — copy interaction", () => {
  beforeEach(() => {
    vi.spyOn(useSorobanModule, "useResolvedName").mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      status: "success",
    } as any);
  });

  it("writes the address to the clipboard when the copy button is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AddressLink address={FULL_ADDRESS} />);

    fireEvent.click(screen.getByRole("button", { name: /copy address/i }));

    // On success the handler resolves and flips into the "copied" (Check) state.
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(FULL_ADDRESS));
  });

  it("handles a failed clipboard write without throwing", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AddressLink address={FULL_ADDRESS} />);

    fireEvent.click(screen.getByRole("button", { name: /copy address/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
  });

  it("copies when Enter is pressed on the copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AddressLink address={FULL_ADDRESS} />);

    fireEvent.keyDown(screen.getByRole("button", { name: /copy address/i }), { key: "Enter" });

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(FULL_ADDRESS));
  });

  it("copies when Space is pressed on the copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AddressLink address={FULL_ADDRESS} />);

    fireEvent.keyDown(screen.getByRole("button", { name: /copy address/i }), { key: " " });

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(FULL_ADDRESS));
  });

  it("ignores unrelated keys on the copy button", () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AddressLink address={FULL_ADDRESS} />);

    fireEvent.keyDown(screen.getByRole("button", { name: /copy address/i }), { key: "a" });

    expect(writeText).not.toHaveBeenCalled();
  });

  it("applies a custom className to the wrapper", () => {
    render(<AddressLink address={FULL_ADDRESS} className="my-custom-class" />);
    expect(document.querySelector(".my-custom-class")).not.toBeNull();
  });
});
