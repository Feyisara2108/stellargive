import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { WalletProvider, useWallet } from "./WalletProvider";
import * as freighterApi from "@stellar/freighter-api";
import React from "react";
import userEvent from "@testing-library/user-event";

const notifyMock = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  loading: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  notify: notifyMock,
}));

vi.mock("@stellar/freighter-api", () => {
  const api = {
    isConnected: vi.fn(),
    getAddress: vi.fn(),
    setAllowed: vi.fn(),
    getNetwork: vi.fn(),
  };
  // The real package's default export is the same object as its named exports;
  // WalletProvider feature-detects extra capabilities (e.g. setNetwork) on it.
  return { ...api, default: api };
});

vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
}));

function TestComponent({ switchTarget }: { switchTarget?: string }) {
  const wallet = useWallet();
  const [switchResult, setSwitchResult] = React.useState<string>("none");
  return (
    <div>
      <div data-testid="address">{wallet.address || "none"}</div>
      <div data-testid="is-connected">{String(wallet.isConnected)}</div>
      <div data-testid="network">{wallet.walletNetwork || "none"}</div>
      <div data-testid="is-wrong-network">{String(wallet.isWrongNetwork)}</div>
      <div data-testid="switch-result">{switchResult}</div>
      <button onClick={wallet.connect} data-testid="btn-connect">
        Connect
      </button>
      <button onClick={wallet.disconnect} data-testid="btn-disconnect">
        Disconnect
      </button>
      <button
        onClick={async () => {
          const result = await wallet.switchNetwork(switchTarget ?? "Target Network");
          setSwitchResult(JSON.stringify(result));
        }}
        data-testid="btn-switch-network"
      >
        Switch Network
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
    // No wallet in these tests supports a programmatic switch unless a test opts in.
    delete (freighterApi.default as Record<string, unknown>).setNetwork;
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
      await waitFor(() => expect(screen.getByTestId("address")).toHaveTextContent("GFIRSTACCOUNT"));

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

  describe("auto-reconnect toast", () => {
    it("shows a reconnect toast when auto-connecting a previously connected wallet", async () => {
      localStorage.setItem("stellargive:wallet-previously-connected", "true");
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "G12345" });

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("is-connected")).toHaveTextContent("true");
        expect(notifyMock.info).toHaveBeenCalledWith("Wallet reconnected");
      });
    });

    it("suppresses the reconnect toast on the first ever connection", async () => {
      localStorage.removeItem("stellargive:wallet-previously-connected");
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "G12345" });

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("is-connected")).toHaveTextContent("true");
      });
      expect(notifyMock.info).not.toHaveBeenCalled();
    });

    it("does not trigger auto-reconnect toast on manual disconnect", async () => {
      const user = userEvent.setup();
      localStorage.setItem("stellargive:wallet-previously-connected", "true");
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: "G12345" });

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await waitFor(() => expect(screen.getByTestId("is-connected")).toHaveTextContent("true"));
      notifyMock.info.mockClear();

      await user.click(screen.getByTestId("btn-disconnect"));
      await waitFor(() => expect(screen.getByTestId("is-connected")).toHaveTextContent("false"));

      expect(notifyMock.info).not.toHaveBeenCalled();
    });
  });

  describe("switchNetwork", () => {
    it("reports unsupported when the wallet API has no switch capability", async () => {
      const user = userEvent.setup();
      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await user.click(screen.getByTestId("btn-switch-network"));

      await waitFor(() => {
        expect(screen.getByTestId("switch-result")).toHaveTextContent(
          JSON.stringify({ supported: false, success: false }),
        );
      });
    });

    it("calls the wallet's switch capability and refreshes the network on success", async () => {
      const user = userEvent.setup();
      const setNetwork = vi.fn().mockResolvedValue({});
      (freighterApi.default as Record<string, unknown>).setNetwork = setNetwork;
      vi.mocked(freighterApi.getNetwork).mockResolvedValue({ network: "Old Network" } as any);

      render(
        <WalletProvider>
          <TestComponent switchTarget="New Network" />
        </WalletProvider>,
      );

      vi.mocked(freighterApi.getNetwork).mockResolvedValue({ network: "New Network" } as any);
      await user.click(screen.getByTestId("btn-switch-network"));

      expect(setNetwork).toHaveBeenCalledWith({ networkPassphrase: "New Network" });
      await waitFor(() => {
        expect(screen.getByTestId("switch-result")).toHaveTextContent(
          JSON.stringify({ supported: true, success: true }),
        );
        expect(screen.getByTestId("network")).toHaveTextContent("New Network");
      });
    });

    it("reports failure when the wallet's switch capability rejects", async () => {
      const user = userEvent.setup();
      (freighterApi.default as Record<string, unknown>).setNetwork = vi
        .fn()
        .mockRejectedValue(new Error("user rejected"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await user.click(screen.getByTestId("btn-switch-network"));

      await waitFor(() => {
        expect(screen.getByTestId("switch-result")).toHaveTextContent(
          JSON.stringify({ supported: true, success: false }),
        );
      });
      consoleSpy.mockRestore();
    });

    it("reports failure when the wallet's switch capability resolves with an error", async () => {
      const user = userEvent.setup();
      (freighterApi.default as Record<string, unknown>).setNetwork = vi
        .fn()
        .mockResolvedValue({ error: "denied" });
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await user.click(screen.getByTestId("btn-switch-network"));

      await waitFor(() => {
        expect(screen.getByTestId("switch-result")).toHaveTextContent(
          JSON.stringify({ supported: true, success: false }),
        );
      });
      consoleSpy.mockRestore();
    });
  });
});
