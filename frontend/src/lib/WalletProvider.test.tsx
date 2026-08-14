import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { WalletProvider, useWallet } from "./WalletProvider";
import * as freighterApi from "@stellar/freighter-api";
import React from "react";
import userEvent from "@testing-library/user-event";

vi.mock("@stellar/freighter-api", () => ({
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  setAllowed: vi.fn(),
  getNetwork: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
}));

function TestComponent() {
  const wallet = useWallet();
  return (
    <div>
      <div data-testid="address">{wallet.address || "none"}</div>
      <div data-testid="is-connected">{String(wallet.isConnected)}</div>
      <div data-testid="is-wrong-network">{String(wallet.isWrongNetwork)}</div>
      <button onClick={wallet.connect} data-testid="btn-connect">Connect</button>
      <button onClick={wallet.disconnect} data-testid="btn-disconnect">Disconnect</button>
    </div>
  );
}

describe("WalletProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: false });
    vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "" });
    vi.mocked(freighterApi.setAllowed).mockResolvedValue({ isAllowed: false });
    vi.mocked(freighterApi.getNetwork).mockResolvedValue({ network: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE } as any);
  });

  it("initializes with default disconnected state", async () => {
    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>
    );

    expect(screen.getByTestId("address")).toHaveTextContent("none");
    expect(screen.getByTestId("is-connected")).toHaveTextContent("false");
    expect(screen.getByTestId("is-wrong-network")).toHaveTextContent("false");
  });

  it("auto-connects on mount if freighter returns isConnected: true", async () => {
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "G12345" });
    vi.mocked(freighterApi.getNetwork).mockResolvedValue({ network: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE } as any);

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("address")).toHaveTextContent("G12345");
      expect(screen.getByTestId("is-connected")).toHaveTextContent("true");
    });
  });

  it("connects successfully when user clicks connect", async () => {
    const user = userEvent.setup();
    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>
    );

    vi.mocked(freighterApi.setAllowed).mockResolvedValue({ isAllowed: true });
    vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "G54321" });

    await user.click(screen.getByTestId("btn-connect"));

    await waitFor(() => {
      expect(screen.getByTestId("address")).toHaveTextContent("G54321");
      expect(screen.getByTestId("is-connected")).toHaveTextContent("true");
    });
  });

  it("does not connect if setAllowed returns false (user cancels)", async () => {
    const user = userEvent.setup();
    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>
    );

    vi.mocked(freighterApi.setAllowed).mockResolvedValue({ isAllowed: false });

    await user.click(screen.getByTestId("btn-connect"));

    // Should remain disconnected
    expect(screen.getByTestId("address")).toHaveTextContent("none");
    expect(screen.getByTestId("is-connected")).toHaveTextContent("false");
  });

  it("disconnects and clears state when disconnect is called", async () => {
    const user = userEvent.setup();
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "G12345" });

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("address")).toHaveTextContent("G12345");
    });

    await user.click(screen.getByTestId("btn-disconnect"));

    await waitFor(() => {
      expect(screen.getByTestId("address")).toHaveTextContent("none");
      expect(screen.getByTestId("is-connected")).toHaveTextContent("false");
    });
  });

  it("detects wrong network", async () => {
    const user = userEvent.setup();
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "G12345" });
    // Provide a different network passphrase than the app expects
    vi.mocked(freighterApi.getNetwork).mockResolvedValue({ network: "Wrong Network" } as any);

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("address")).toHaveTextContent("G12345");
      expect(screen.getByTestId("is-wrong-network")).toHaveTextContent("true");
    });
  });

  it("throws an error if useWallet is used outside of WalletProvider", () => {
    // Suppress React error boundary console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestComponent />)).toThrow("useWallet must be used within a WalletProvider");
    consoleSpy.mockRestore();
  });
});
