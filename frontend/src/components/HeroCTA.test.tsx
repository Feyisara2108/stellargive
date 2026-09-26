import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroCTA } from "./HeroCTA";

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: vi.fn(),
}));

import { useWallet } from "@/lib/WalletProvider";

describe("HeroCTA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes connect when clicked while disconnected", () => {
    const connect = vi.fn();
    vi.mocked(useWallet).mockReturnValue({
      isConnected: false,
      connect,
    } as unknown as ReturnType<typeof useWallet>);

    render(<HeroCTA />);
    screen.getByRole("button").click();

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("scrolls to the campaigns section when clicked while connected", () => {
    const connect = vi.fn();
    vi.mocked(useWallet).mockReturnValue({
      isConnected: true,
      connect,
    } as unknown as ReturnType<typeof useWallet>);

    const scrollIntoView = vi.fn();
    const campaignsSection = document.createElement("div");
    campaignsSection.id = "explore-campaigns";
    campaignsSection.scrollIntoView = scrollIntoView;
    document.body.appendChild(campaignsSection);

    render(<HeroCTA />);
    screen.getByRole("button").click();

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth" });
    expect(connect).not.toHaveBeenCalled();

    document.body.removeChild(campaignsSection);
  });

  it("does not throw when connected and the campaigns section is not in the DOM", () => {
    vi.mocked(useWallet).mockReturnValue({
      isConnected: true,
      connect: vi.fn(),
    } as unknown as ReturnType<typeof useWallet>);

    render(<HeroCTA />);
    expect(() => screen.getByRole("button").click()).not.toThrow();
  });

  it("shows the 'Get Started' label when disconnected", () => {
    vi.mocked(useWallet).mockReturnValue({
      isConnected: false,
      connect: vi.fn(),
    } as unknown as ReturnType<typeof useWallet>);

    render(<HeroCTA />);
    expect(screen.getByRole("button")).toHaveTextContent("Get Started");
  });

  it("shows the 'Explore Campaigns' label when connected", () => {
    vi.mocked(useWallet).mockReturnValue({
      isConnected: true,
      connect: vi.fn(),
    } as unknown as ReturnType<typeof useWallet>);

    render(<HeroCTA />);
    expect(screen.getByRole("button")).toHaveTextContent("Explore Campaigns");
  });
});
