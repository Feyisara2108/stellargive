import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom";

const wallet = vi.hoisted(() => ({
  walletNetwork: null as string | null,
  isWrongNetwork: false,
}));

vi.mock("@/lib/WalletProvider", () => ({
  useWallet: () => wallet,
}));

import { NetworkMismatchBanner, FREIGHTER_NETWORK_GUIDE_URL, dismissKey } from "./NetworkMismatchBanner";

// Set by src/test/setup.ts.
const APP_NETWORK = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!;
const TESTNET = "Test SDF Network ; September 2015";
const PUBLIC = "Public Global Stellar Network ; September 2015";

/** Mirror WalletProvider: mismatch means a known wallet network that isn't the app's. */
function setWalletNetwork(network: string | null) {
  wallet.walletNetwork = network;
  wallet.isWrongNetwork = network !== null && network !== APP_NETWORK;
}

const banner = () => screen.queryByText("Network Mismatch Detected");

beforeEach(() => {
  sessionStorage.clear();
  setWalletNetwork(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NetworkMismatchBanner — visibility", () => {
  it("renders nothing when no wallet network is known", () => {
    const { container } = render(<NetworkMismatchBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the wallet is on the app's network", () => {
    setWalletNetwork(APP_NETWORK);

    const { container } = render(<NetworkMismatchBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the wallet's and the required network on a mismatch", () => {
    setWalletNetwork(TESTNET);

    render(<NetworkMismatchBanner />);

    expect(banner()).toBeInTheDocument();
    expect(screen.getByText(TESTNET)).toBeInTheDocument();
    expect(screen.getByText(APP_NETWORK)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch Network" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("appears when the wallet moves to a wrong network and hides once it is corrected", () => {
    setWalletNetwork(APP_NETWORK);
    const { rerender } = render(<NetworkMismatchBanner />);
    expect(banner()).toBeNull();

    setWalletNetwork(TESTNET);
    rerender(<NetworkMismatchBanner />);
    expect(banner()).toBeInTheDocument();

    setWalletNetwork(APP_NETWORK);
    rerender(<NetworkMismatchBanner />);
    expect(banner()).toBeNull();
  });
});

describe("NetworkMismatchBanner — switch network", () => {
  beforeEach(() => {
    setWalletNetwork(TESTNET);
  });

  it("opens Freighter's network guide in a new tab and severs the opener", async () => {
    const user = userEvent.setup();
    const guideWindow = { opener: window } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(guideWindow);
    render(<NetworkMismatchBanner />);

    await user.click(screen.getByRole("button", { name: "Switch Network" }));

    expect(open).toHaveBeenCalledWith(FREIGHTER_NETWORK_GUIDE_URL, "_blank");
    expect(guideWindow.opener).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("falls back to inline manual steps when the guide popup is blocked", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "open").mockReturnValue(null);
    render(<NetworkMismatchBanner />);

    expect(screen.queryByRole("status")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Switch Network" }));

    const steps = screen.getByRole("status");
    expect(steps).toHaveTextContent(/in freighter, open settings → network/i);
    const link = within(steps).getByRole("link", { name: /read the network guide/i });
    expect(link).toHaveAttribute("href", FREIGHTER_NETWORK_GUIDE_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    // The banner stays up until the network actually changes or it is dismissed.
    expect(banner()).toBeInTheDocument();
  });
});

describe("NetworkMismatchBanner — per-network dismissal", () => {
  it("hides the banner and remembers the dismissal for the current wallet network", async () => {
    const user = userEvent.setup();
    setWalletNetwork(TESTNET);
    render(<NetworkMismatchBanner />);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(banner()).toBeNull();
    expect(sessionStorage.getItem(dismissKey(TESTNET))).toBe("true");
    expect(sessionStorage.getItem(dismissKey(PUBLIC))).toBeNull();
  });

  it("shows the banner again when the wallet moves to a different wrong network", async () => {
    const user = userEvent.setup();
    setWalletNetwork(TESTNET);
    const { rerender } = render(<NetworkMismatchBanner />);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    setWalletNetwork(PUBLIC);
    rerender(<NetworkMismatchBanner />);

    expect(banner()).toBeInTheDocument();
    expect(screen.getByText(PUBLIC)).toBeInTheDocument();
  });

  it("keeps a network dismissed when the wallet returns to it", async () => {
    const user = userEvent.setup();
    setWalletNetwork(TESTNET);
    const { rerender } = render(<NetworkMismatchBanner />);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    setWalletNetwork(PUBLIC);
    rerender(<NetworkMismatchBanner />);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(banner()).toBeNull();

    setWalletNetwork(TESTNET);
    rerender(<NetworkMismatchBanner />);
    expect(banner()).toBeNull();
  });

  it("honours a dismissal stored earlier in the session only for that network", () => {
    sessionStorage.setItem(dismissKey(TESTNET), "true");

    setWalletNetwork(TESTNET);
    const { unmount } = render(<NetworkMismatchBanner />);
    expect(banner()).toBeNull();
    unmount();

    setWalletNetwork(PUBLIC);
    render(<NetworkMismatchBanner />);
    expect(banner()).toBeInTheDocument();
  });

  it("still dismisses when session storage is unavailable", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    setWalletNetwork(TESTNET);
    render(<NetworkMismatchBanner />);
    expect(banner()).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(banner()).toBeNull();
  });
});
