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
      <div data-testid="network">{wallet.walletNetwork || "none"}</div>
      <div data-testid="is-wrong-network">{String(wallet.isWrongNetwork)}</div>
      <button onClick={wallet.connect} data-testid="btn-connect">
        Connect
      </button>
      <button onClick={wallet.disconnect} data-testid="btn-disconnect">
        Disconnect
      </button>
    </div>
  );
}

/** Simulates the tab regaining focus, the trigger WalletProvider uses to re-poll the wallet's network. */
async function simulateTabRefocus(via: "visibility" | "focus" = "visibility") {
  if (via === "visibility") {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  } else {
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
  }
}

describe("WalletProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: false });
    vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "" });
    vi.mocked(freighterApi.setAllowed).mockResolvedValue({ isAllowed: false });
    vi.mocked(freighterApi.getNetwork).mockResolvedValue({
      network: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE,
    } as any);
  });

  it("initializes with default disconnected state", async () => {
    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    expect(screen.getByTestId("address")).toHaveTextContent("none");
    expect(screen.getByTestId("is-connected")).toHaveTextContent("false");
    expect(screen.getByTestId("is-wrong-network")).toHaveTextContent("false");
  });

  it("auto-connects on mount if freighter returns isConnected: true", async () => {
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "G12345" });
    vi.mocked(freighterApi.getNetwork).mockResolvedValue({
      network: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE,
    } as any);

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
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
      </WalletProvider>,
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
      </WalletProvider>,
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
      </WalletProvider>,
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
      </WalletProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("address")).toHaveTextContent("G12345");
      expect(screen.getByTestId("is-wrong-network")).toHaveTextContent("true");
    });
  });

  it("throws an error if useWallet is used outside of WalletProvider", () => {
    // Suppress React error boundary console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestComponent />)).toThrow(
      "useWallet must be used within a WalletProvider",
    );
    consoleSpy.mockRestore();
  });

  describe("initial connection state detection", () => {
    it("stays disconnected when freighter reports connected but returns no address", async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ error: "no address" } as any);

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await waitFor(() => expect(freighterApi.getAddress).toHaveBeenCalled());
      expect(screen.getByTestId("address")).toHaveTextContent("none");
      expect(screen.getByTestId("is-connected")).toHaveTextContent("false");
      expect(freighterApi.getNetwork).not.toHaveBeenCalled();
    });

    it("does not query the wallet address at all when freighter reports disconnected", async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: false });

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await waitFor(() => expect(freighterApi.isConnected).toHaveBeenCalled());
      expect(freighterApi.getAddress).not.toHaveBeenCalled();
      expect(screen.getByTestId("is-connected")).toHaveTextContent("false");
    });

    it("fetches the wallet network once the initial connection is detected", async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "G12345" });
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({
        network: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE,
      } as any);

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("network")).toHaveTextContent(
          process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!,
        );
      });
    });
  });

  describe("account and network change callbacks", () => {
    it("does not poll the network on tab refocus while disconnected", async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: false });

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await waitFor(() => expect(freighterApi.isConnected).toHaveBeenCalled());
      vi.mocked(freighterApi.getNetwork).mockClear();

      await simulateTabRefocus("visibility");
      await simulateTabRefocus("focus");

      expect(freighterApi.getNetwork).not.toHaveBeenCalled();
    });

    it("re-fetches and reflects a network switch when the tab regains visibility", async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "G12345" });
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({
        network: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE,
      } as any);

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("network")).toHaveTextContent(
          process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!,
        );
      });
      expect(screen.getByTestId("is-wrong-network")).toHaveTextContent("false");

      // User switches the active network inside the Freighter extension.
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({ network: "Wrong Network" } as any);
      await simulateTabRefocus("visibility");

      await waitFor(() => {
        expect(screen.getByTestId("network")).toHaveTextContent("Wrong Network");
        expect(screen.getByTestId("is-wrong-network")).toHaveTextContent("true");
      });
    });

    it("re-fetches the network when the window regains focus", async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "G12345" });
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({
        network: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE,
      } as any);

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );
      await waitFor(() => expect(screen.getByTestId("is-connected")).toHaveTextContent("true"));

      vi.mocked(freighterApi.getNetwork).mockClear();
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({ network: "Wrong Network" } as any);
      await simulateTabRefocus("focus");

      await waitFor(() => {
        expect(freighterApi.getNetwork).toHaveBeenCalled();
        expect(screen.getByTestId("is-wrong-network")).toHaveTextContent("true");
      });
    });

    it("reflects the newly selected account when reconnecting after an account switch", async () => {
      const user = userEvent.setup();
      vi.mocked(freighterApi.setAllowed).mockResolvedValue({ isAllowed: true });
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "GFIRSTACCOUNT" });

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await user.click(screen.getByTestId("btn-connect"));
      await waitFor(() =>
        expect(screen.getByTestId("address")).toHaveTextContent("GFIRSTACCOUNT"),
      );

      // User switches accounts inside Freighter, then reconnects from the app.
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "GSECONDACCOUNT" });
      await user.click(screen.getByTestId("btn-connect"));

      await waitFor(() =>
        expect(screen.getByTestId("address")).toHaveTextContent("GSECONDACCOUNT"),
      );
    });

    it("stops polling the network after the wallet disconnects", async () => {
      const user = userEvent.setup();
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "G12345" });
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({
        network: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE,
      } as any);

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );
      await waitFor(() => expect(screen.getByTestId("is-connected")).toHaveTextContent("true"));

      await user.click(screen.getByTestId("btn-disconnect"));
      await waitFor(() => expect(screen.getByTestId("is-connected")).toHaveTextContent("false"));

      vi.mocked(freighterApi.getNetwork).mockClear();
      await simulateTabRefocus("visibility");
      await simulateTabRefocus("focus");

      expect(freighterApi.getNetwork).not.toHaveBeenCalled();
    });
  });

  describe("disconnect clears local session state", () => {
    it("resets address, connection flag, and network together", async () => {
      const user = userEvent.setup();
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "G12345" });
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({ network: "Wrong Network" } as any);

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("address")).toHaveTextContent("G12345");
        expect(screen.getByTestId("is-wrong-network")).toHaveTextContent("true");
      });

      await user.click(screen.getByTestId("btn-disconnect"));

      await waitFor(() => {
        expect(screen.getByTestId("address")).toHaveTextContent("none");
        expect(screen.getByTestId("is-connected")).toHaveTextContent("false");
        expect(screen.getByTestId("network")).toHaveTextContent("none");
        // Clearing walletNetwork also clears the derived wrong-network flag.
        expect(screen.getByTestId("is-wrong-network")).toHaveTextContent("false");
      });
    });

    it("does not re-establish a session on its own after disconnect", async () => {
      const user = userEvent.setup();
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "G12345" });

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );
      await waitFor(() => expect(screen.getByTestId("is-connected")).toHaveTextContent("true"));

      await user.click(screen.getByTestId("btn-disconnect"));
      await waitFor(() => expect(screen.getByTestId("is-connected")).toHaveTextContent("false"));

      // Disconnect only clears local state — it does not re-run the initial
      // isConnected() probe, so the cleared session stays cleared.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.getByTestId("address")).toHaveTextContent("none");
      expect(screen.getByTestId("is-connected")).toHaveTextContent("false");
    });
  });
});
