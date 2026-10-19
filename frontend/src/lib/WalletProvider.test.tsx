import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { WalletProvider, useWallet } from "./WalletProvider";
import * as wallet from "@/lib/wallet";
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

vi.mock("@/lib/wallet", () => ({
  WALLETS: [
    { id: "freighter", name: "Freighter", url: "https://www.freighter.app", kind: "extension" },
    { id: "albedo", name: "Albedo", url: "https://albedo.link", kind: "web" },
  ],
  isWalletAvailable: vi.fn().mockResolvedValue(true),
  restoreWallet: vi.fn(),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  getWalletNetwork: vi.fn(),
  getNetworkSwitcher: vi.fn(),
}));

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

/** Opens the wallet picker via connect() and chooses a wallet in it. */
async function connectVia(user: ReturnType<typeof userEvent.setup>, walletName: string) {
  await user.click(screen.getByTestId("btn-connect"));
  await user.click(await screen.findByRole("button", { name: new RegExp(walletName, "i") }));
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
    vi.mocked(wallet.restoreWallet).mockResolvedValue(null);
    vi.mocked(wallet.connectWallet).mockRejectedValue(new Error("User declined access"));
    vi.mocked(wallet.isWalletAvailable).mockResolvedValue(true);
    vi.mocked(wallet.disconnectWallet).mockResolvedValue(undefined);
    vi.mocked(wallet.getWalletNetwork).mockResolvedValue(process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!);
    // No wallet in these tests supports a programmatic switch unless a test opts in.
    vi.mocked(wallet.getNetworkSwitcher).mockResolvedValue(null);
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

  it("auto-connects on mount if a previously connected wallet is restored", async () => {
    vi.mocked(wallet.restoreWallet).mockResolvedValue("G12345");
    vi.mocked(wallet.getWalletNetwork).mockResolvedValue(process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!);

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

    vi.mocked(wallet.connectWallet).mockResolvedValue("G54321");

    await connectVia(user, "Albedo");

    await waitFor(() => {
      expect(screen.getByTestId("address")).toHaveTextContent("G54321");
      expect(screen.getByTestId("is-connected")).toHaveTextContent("true");
    });
    expect(wallet.connectWallet).toHaveBeenCalledWith("albedo");
    // The picker closes once a wallet is connected.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the picker open with an error when the chosen wallet refuses access", async () => {
    const user = userEvent.setup();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    vi.mocked(wallet.connectWallet).mockRejectedValue(new Error("User declined access"));
    await connectVia(user, "Freighter");

    expect(await screen.findByRole("alert")).toHaveTextContent(/user declined access/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("is-connected")).toHaveTextContent("false");
    consoleSpy.mockRestore();
  });

  it("offers an install link for wallets whose extension isn't installed", async () => {
    const user = userEvent.setup();
    vi.mocked(wallet.isWalletAvailable).mockImplementation(async (id) => id !== "freighter");
    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await user.click(screen.getByTestId("btn-connect"));

    expect(await screen.findByRole("link", { name: /install freighter/i })).toHaveAttribute(
      "href",
      "https://www.freighter.app",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /freighter/i })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: /albedo/i })).toBeEnabled();
  });

  it("does not connect if the user closes the wallet picker", async () => {
    const user = userEvent.setup();
    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await user.click(screen.getByTestId("btn-connect"));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /close/i }));

    // Should remain disconnected
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(wallet.connectWallet).not.toHaveBeenCalled();
    expect(screen.getByTestId("address")).toHaveTextContent("none");
    expect(screen.getByTestId("is-connected")).toHaveTextContent("false");
  });

  it("disconnects and clears state when disconnect is called", async () => {
    const user = userEvent.setup();
    vi.mocked(wallet.restoreWallet).mockResolvedValue("G12345");

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
    });    // The selected wallet is told to forget the session too.
    expect(wallet.disconnectWallet).toHaveBeenCalled();
  });

  it("detects wrong network", async () => {
    const user = userEvent.setup();
    vi.mocked(wallet.restoreWallet).mockResolvedValue("G12345");
    // Provide a different network passphrase than the app expects
    vi.mocked(wallet.getWalletNetwork).mockResolvedValue("Wrong Network");

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
    it("stays disconnected when the wallet layer fails to restore a session", async () => {
      vi.mocked(wallet.restoreWallet).mockRejectedValue(new Error("kit failed to load"));

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await waitFor(() => expect(wallet.restoreWallet).toHaveBeenCalled());
      expect(screen.getByTestId("address")).toHaveTextContent("none");
      expect(screen.getByTestId("is-connected")).toHaveTextContent("false");
      expect(wallet.getWalletNetwork).not.toHaveBeenCalled();
    });

    it("does not query the wallet network when no previous session is restored", async () => {
      vi.mocked(wallet.restoreWallet).mockResolvedValue(null);

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await waitFor(() => expect(wallet.restoreWallet).toHaveBeenCalled());
      expect(wallet.getWalletNetwork).not.toHaveBeenCalled();
      expect(screen.getByTestId("is-connected")).toHaveTextContent("false");
    });

    it("fetches the wallet network once the initial connection is detected", async () => {
      vi.mocked(wallet.restoreWallet).mockResolvedValue("G12345");
      vi.mocked(wallet.getWalletNetwork).mockResolvedValue(process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!);

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
      vi.mocked(wallet.restoreWallet).mockResolvedValue(null);

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await waitFor(() => expect(wallet.restoreWallet).toHaveBeenCalled());
      vi.mocked(wallet.getWalletNetwork).mockClear();

      await simulateTabRefocus("visibility");
      await simulateTabRefocus("focus");

      expect(wallet.getWalletNetwork).not.toHaveBeenCalled();
    });

    it("re-fetches and reflects a network switch when the tab regains visibility", async () => {
      vi.mocked(wallet.restoreWallet).mockResolvedValue("G12345");
      vi.mocked(wallet.getWalletNetwork).mockResolvedValue(process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!);

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

      // User switches the active network inside their wallet.
      vi.mocked(wallet.getWalletNetwork).mockResolvedValue("Wrong Network");
      await simulateTabRefocus("visibility");

      await waitFor(() => {
        expect(screen.getByTestId("network")).toHaveTextContent("Wrong Network");
        expect(screen.getByTestId("is-wrong-network")).toHaveTextContent("true");
      });
    });

    it("re-fetches the network when the window regains focus", async () => {
      vi.mocked(wallet.restoreWallet).mockResolvedValue("G12345");
      vi.mocked(wallet.getWalletNetwork).mockResolvedValue(process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!);

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );
      await waitFor(() => expect(screen.getByTestId("is-connected")).toHaveTextContent("true"));

      vi.mocked(wallet.getWalletNetwork).mockClear();
      vi.mocked(wallet.getWalletNetwork).mockResolvedValue("Wrong Network");
      await simulateTabRefocus("focus");

      await waitFor(() => {
        expect(wallet.getWalletNetwork).toHaveBeenCalled();
        expect(screen.getByTestId("is-wrong-network")).toHaveTextContent("true");
      });
    });

    it("reflects the newly selected account when reconnecting after an account switch", async () => {
      const user = userEvent.setup();
      vi.mocked(wallet.connectWallet).mockResolvedValue("GFIRSTACCOUNT");

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );

      await connectVia(user, "Freighter");
      await waitFor(() => expect(screen.getByTestId("address")).toHaveTextContent("GFIRSTACCOUNT"));

      // User switches accounts inside their wallet, then reconnects from the app.
      vi.mocked(wallet.connectWallet).mockResolvedValue("GSECONDACCOUNT");
      await connectVia(user, "Freighter");

      await waitFor(() =>
        expect(screen.getByTestId("address")).toHaveTextContent("GSECONDACCOUNT"),
      );
    });

    it("stops polling the network after the wallet disconnects", async () => {
      const user = userEvent.setup();
      vi.mocked(wallet.restoreWallet).mockResolvedValue("G12345");
      vi.mocked(wallet.getWalletNetwork).mockResolvedValue(process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!);

      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );
      await waitFor(() => expect(screen.getByTestId("is-connected")).toHaveTextContent("true"));

      await user.click(screen.getByTestId("btn-disconnect"));
      await waitFor(() => expect(screen.getByTestId("is-connected")).toHaveTextContent("false"));

      vi.mocked(wallet.getWalletNetwork).mockClear();
      await simulateTabRefocus("visibility");
      await simulateTabRefocus("focus");

      expect(wallet.getWalletNetwork).not.toHaveBeenCalled();
    });
  });

  describe("disconnect clears local session state", () => {
    it("resets address, connection flag, and network together", async () => {
      const user = userEvent.setup();
      vi.mocked(wallet.restoreWallet).mockResolvedValue("G12345");
      vi.mocked(wallet.getWalletNetwork).mockResolvedValue("Wrong Network");

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
      vi.mocked(wallet.restoreWallet).mockResolvedValue("G12345");

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
      vi.mocked(wallet.restoreWallet).mockResolvedValue("G12345");

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
      vi.mocked(wallet.restoreWallet).mockResolvedValue("G12345");

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
      vi.mocked(wallet.restoreWallet).mockResolvedValue("G12345");

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
      const setNetwork = vi.fn().mockResolvedValue(undefined);
      vi.mocked(wallet.getNetworkSwitcher).mockResolvedValue(setNetwork);
      vi.mocked(wallet.getWalletNetwork).mockResolvedValue("Old Network");

      render(
        <WalletProvider>
          <TestComponent switchTarget="New Network" />
        </WalletProvider>,
      );

      vi.mocked(wallet.getWalletNetwork).mockResolvedValue("New Network");
      await user.click(screen.getByTestId("btn-switch-network"));

      expect(setNetwork).toHaveBeenCalledWith("New Network");
      await waitFor(() => {
        expect(screen.getByTestId("switch-result")).toHaveTextContent(
          JSON.stringify({ supported: true, success: true }),
        );
        expect(screen.getByTestId("network")).toHaveTextContent("New Network");
      });
    });

    it("reports failure when the wallet's switch capability rejects", async () => {
      const user = userEvent.setup();
      vi.mocked(wallet.getNetworkSwitcher).mockResolvedValue(
        vi.fn().mockRejectedValue(new Error("user rejected")),
      );
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
