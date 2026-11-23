import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const freighterApi = vi.hoisted(() => ({
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
}));

// Stand-in for Freighter's WatchWalletChanges: records each watcher so a test can
// push changes through it and check it was stopped.
type WatchCallback = (change: {
  address: string;
  network: string;
  networkPassphrase: string;
  error?: { code: number; message: string };
}) => void;
const freighterWatch = vi.hoisted(() => {
  const instances: {
    timeout: number;
    callback?: WatchCallback;
    stop: ReturnType<typeof vi.fn>;
  }[] = [];
  class WatchWalletChanges {
    timeout: number;
    callback?: WatchCallback;
    stop = vi.fn();
    constructor(timeout: number) {
      this.timeout = timeout;
      instances.push(this);
    }
    watch(callback: WatchCallback) {
      this.callback = callback;
      return {};
    }
  }
  return { instances, WatchWalletChanges };
});
vi.mock("@stellar/freighter-api", () => ({
  ...freighterApi,
  WatchWalletChanges: freighterWatch.WatchWalletChanges,
}));

const albedoIntent = vi.hoisted(() => ({
  publicKey: vi.fn(),
  tx: vi.fn(),
}));
vi.mock("@albedo-link/intent", () => ({ default: albedoIntent }));

import {
  WALLETS,
  SELECTED_WALLET_KEY,
  WALLET_ADDRESS_KEY,
  isWalletAvailable,
  restoreWallet,
  connectWallet,
  getWalletNetwork,
  getNetworkSwitcher,
  signTransaction,
  disconnectWallet,
  watchWallet,
  watchByPolling,
} from "./wallet";

const APP_NETWORK = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!;
const SIGN_OPTS = { networkPassphrase: APP_NETWORK, address: "GSIGNER" };

type TestWindow = Window & { hanaWallet?: unknown; rabet?: unknown };

describe("wallet abstraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    freighterWatch.instances.length = 0;
    freighterApi.isConnected.mockResolvedValue({ isConnected: true });
  });

  afterEach(() => {
    delete (window as TestWindow).hanaWallet;
    delete (window as TestWindow).rabet;
  });

  it("offers Freighter plus other wallets, including one that needs no extension", () => {
    const ids = WALLETS.map((w) => w.id);
    expect(ids).toContain("freighter");
    expect(ids.length).toBeGreaterThan(1);
    expect(WALLETS.some((w) => w.kind === "web")).toBe(true);
  });

  describe("availability", () => {
    it("treats Albedo as always available and extensions as available once injected", async () => {
      await expect(isWalletAvailable("albedo")).resolves.toBe(true);
      await expect(isWalletAvailable("rabet")).resolves.toBe(false);
      (window as TestWindow).rabet = { connect: vi.fn(), sign: vi.fn() };
      await expect(isWalletAvailable("rabet")).resolves.toBe(true);
    });

    it("treats a wallet probe that never answers as unavailable", async () => {
      vi.useFakeTimers();
      freighterApi.isConnected.mockReturnValue(new Promise(() => {}));
      const result = isWalletAvailable("freighter");
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(result).resolves.toBe(false);
      vi.useRealTimers();
    });

    it("reports Freighter unavailable when the extension isn't installed", async () => {
      freighterApi.isConnected.mockResolvedValue({ isConnected: false });
      await expect(isWalletAvailable("freighter")).resolves.toBe(false);
    });
  });

  describe("connect / restore / disconnect", () => {
    it("connects the chosen wallet and remembers it", async () => {
      albedoIntent.publicKey.mockResolvedValue({ pubkey: "GALBEDO" });

      await expect(connectWallet("albedo")).resolves.toBe("GALBEDO");
      expect(localStorage.getItem(SELECTED_WALLET_KEY)).toBe("albedo");
      expect(localStorage.getItem(WALLET_ADDRESS_KEY)).toBe("GALBEDO");
    });

    it("rejects with a readable error when the wallet refuses access", async () => {
      freighterApi.requestAccess.mockResolvedValue({
        address: "",
        error: { code: -4, message: "User declined access" },
      });

      await expect(connectWallet("freighter")).rejects.toThrow("User declined access");
      expect(localStorage.getItem(SELECTED_WALLET_KEY)).toBeNull();
    });

    it("restores nothing when no wallet was connected before", async () => {
      await expect(restoreWallet()).resolves.toBeNull();
    });

    it("re-reads Freighter's current account silently on restore", async () => {
      freighterApi.requestAccess.mockResolvedValue({ address: "GOLD" });
      await connectWallet("freighter");
      freighterApi.getAddress.mockResolvedValue({ address: "GSWITCHED" });

      await expect(restoreWallet()).resolves.toBe("GSWITCHED");
      expect(freighterApi.requestAccess).toHaveBeenCalledTimes(1);
    });

    it("restores the stored address for wallets that can't be queried silently", async () => {
      albedoIntent.publicKey.mockResolvedValue({ pubkey: "GALBEDO" });
      await connectWallet("albedo");
      albedoIntent.publicKey.mockClear();

      await expect(restoreWallet()).resolves.toBe("GALBEDO");
      expect(albedoIntent.publicKey).not.toHaveBeenCalled();
    });

    it("doesn't restore a wallet whose extension has since been removed", async () => {
      (window as TestWindow).rabet = { connect: vi.fn().mockResolvedValue({ publicKey: "GR" }) };
      await connectWallet("rabet");
      delete (window as TestWindow).rabet;

      await expect(restoreWallet()).resolves.toBeNull();
    });

    it("forgets the wallet on disconnect", async () => {
      albedoIntent.publicKey.mockResolvedValue({ pubkey: "GALBEDO" });
      await connectWallet("albedo");

      await disconnectWallet();
      await expect(restoreWallet()).resolves.toBeNull();
    });
  });

  describe("network", () => {
    it("reads the network passphrase from Freighter", async () => {
      freighterApi.requestAccess.mockResolvedValue({ address: "GF" });
      await connectWallet("freighter");
      freighterApi.getNetwork.mockResolvedValue({
        network: "TESTNET",
        networkPassphrase: "Test SDF Network ; September 2015",
      });

      await expect(getWalletNetwork()).resolves.toBe("Test SDF Network ; September 2015");
    });

    it("uses the app network for wallets that sign for whichever network they're given", async () => {
      albedoIntent.publicKey.mockResolvedValue({ pubkey: "GALBEDO" });
      await connectWallet("albedo");

      await expect(getWalletNetwork()).resolves.toBe(APP_NETWORK);
    });

    it("is unknown when no wallet is connected", async () => {
      await expect(getWalletNetwork()).resolves.toBeNull();
    });

    it("has no programmatic network switcher for the supported wallets", async () => {
      freighterApi.requestAccess.mockResolvedValue({ address: "GF" });
      await connectWallet("freighter");
      await expect(getNetworkSwitcher()).resolves.toBeNull();
    });
  });

  describe("signing", () => {
    it("signs with Freighter for the connected account", async () => {
      freighterApi.requestAccess.mockResolvedValue({ address: "GF" });
      await connectWallet("freighter");
      freighterApi.signTransaction.mockResolvedValue({
        signedTxXdr: "SIGNED",
        signerAddress: "GF",
      });

      await expect(signTransaction("UNSIGNED", SIGN_OPTS)).resolves.toBe("SIGNED");
      expect(freighterApi.signTransaction).toHaveBeenCalledWith("UNSIGNED", SIGN_OPTS);
    });

    it("signs with Albedo, mapping the SDF testnet passphrase to Albedo's network id", async () => {
      albedoIntent.publicKey.mockResolvedValue({ pubkey: "GALBEDO" });
      await connectWallet("albedo");
      albedoIntent.tx.mockResolvedValue({ signed_envelope_xdr: "ALBEDO_SIGNED" });

      await expect(
        signTransaction("UNSIGNED", {
          networkPassphrase: "Test SDF Network ; September 2015",
          address: "GALBEDO",
        }),
      ).resolves.toBe("ALBEDO_SIGNED");
      expect(albedoIntent.tx).toHaveBeenCalledWith({
        xdr: "UNSIGNED",
        pubkey: "GALBEDO",
        network: "testnet",
      });
    });

    it("signs with Hana through its injected API", async () => {
      const hana = {
        getPublicKey: vi.fn().mockResolvedValue("GHANA"),
        signTransaction: vi.fn().mockResolvedValue("HANA_SIGNED"),
      };
      (window as TestWindow).hanaWallet = { stellar: hana };
      await connectWallet("hana");

      await expect(signTransaction("UNSIGNED", SIGN_OPTS)).resolves.toBe("HANA_SIGNED");
      expect(hana.signTransaction).toHaveBeenCalledWith({
        xdr: "UNSIGNED",
        accountToSign: "GSIGNER",
        networkPassphrase: APP_NETWORK,
      });
    });

    it("prefixes wallet failures with 'Wallet error' so the UI treats them as a cancellation", async () => {
      freighterApi.requestAccess.mockResolvedValue({ address: "GF" });
      await connectWallet("freighter");
      freighterApi.signTransaction.mockResolvedValue({
        signedTxXdr: "",
        error: { code: -4, message: "User declined" },
      });

      await expect(signTransaction("UNSIGNED", SIGN_OPTS)).rejects.toThrow(
        "Wallet error: User declined",
      );
    });

    it("refuses to sign when no wallet is connected", async () => {
      await expect(signTransaction("UNSIGNED", SIGN_OPTS)).rejects.toThrow(
        "Wallet error: No wallet connected",
      );
    });
  });

  describe("watching for account changes", () => {
    async function connectFreighter() {
      freighterApi.requestAccess.mockResolvedValue({ address: "GFIRST" });
      await connectWallet("freighter");
    }

    it("does nothing when no wallet is connected", async () => {
      const onChange = vi.fn();

      const stop = watchWallet(onChange);
      await Promise.resolve();

      expect(freighterWatch.instances).toHaveLength(0);
      expect(onChange).not.toHaveBeenCalled();
      expect(() => stop()).not.toThrow();
    });

    it("uses Freighter's own watcher and reports the account and network", async () => {
      await connectFreighter();
      const onChange = vi.fn();

      watchWallet(onChange);
      await vi.waitFor(() => expect(freighterWatch.instances).toHaveLength(1));
      const [watcher] = freighterWatch.instances;
      expect(watcher.timeout).toBeGreaterThan(0);

      watcher.callback?.({
        address: "GSECOND",
        network: "TESTNET",
        networkPassphrase: APP_NETWORK,
      });

      expect(onChange).toHaveBeenCalledWith({ address: "GSECOND", network: APP_NETWORK });
    });

    it("reports no address when Freighter returns an empty one", async () => {
      await connectFreighter();
      const onChange = vi.fn();
      watchWallet(onChange);
      await vi.waitFor(() => expect(freighterWatch.instances).toHaveLength(1));

      freighterWatch.instances[0].callback?.({
        address: "",
        network: "",
        networkPassphrase: "",
      });

      expect(onChange).toHaveBeenCalledWith({ address: null, network: null });
    });

    it("ignores a failed Freighter poll instead of treating it as a lost account", async () => {
      await connectFreighter();
      const onChange = vi.fn();
      watchWallet(onChange);
      await vi.waitFor(() => expect(freighterWatch.instances).toHaveLength(1));

      freighterWatch.instances[0].callback?.({
        address: "",
        network: "",
        networkPassphrase: "",
        error: { code: -1, message: "locked" },
      });

      expect(onChange).not.toHaveBeenCalled();
    });

    it("stops Freighter's watcher and ignores late changes once unsubscribed", async () => {
      await connectFreighter();
      const onChange = vi.fn();
      const stop = watchWallet(onChange);
      await vi.waitFor(() => expect(freighterWatch.instances).toHaveLength(1));
      const [watcher] = freighterWatch.instances;

      stop();

      expect(watcher.stop).toHaveBeenCalledTimes(1);
      watcher.callback?.({
        address: "GLATE",
        network: "TESTNET",
        networkPassphrase: APP_NETWORK,
      });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("never starts a watcher if it is stopped before Freighter has loaded", async () => {
      await connectFreighter();

      const stop = watchWallet(vi.fn());
      stop();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(freighterWatch.instances).toHaveLength(0);
    });

    it("is a no-op under the mock wallet", async () => {
      vi.stubEnv("NEXT_PUBLIC_USE_MOCK_WALLET", "true");
      vi.resetModules();
      const mocked = await import("./wallet");
      localStorage.setItem(mocked.SELECTED_WALLET_KEY, "freighter");

      const stop = mocked.watchWallet(vi.fn());
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(freighterWatch.instances).toHaveLength(0);
      expect(() => stop()).not.toThrow();
      vi.unstubAllEnvs();
    });
  });

  describe("polling fallback for wallets without a watcher", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("reports the first reading and then only real changes", async () => {
      const restore = vi.fn().mockResolvedValue("GONE");
      const getNetwork = vi.fn().mockResolvedValue(APP_NETWORK);
      const onChange = vi.fn();

      const stop = watchByPolling({ restore, getNetwork }, onChange);
      await vi.advanceTimersByTimeAsync(0);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith({ address: "GONE", network: APP_NETWORK });

      await vi.advanceTimersByTimeAsync(3_000);
      expect(onChange).toHaveBeenCalledTimes(1);

      restore.mockResolvedValue("GTWO");
      await vi.advanceTimersByTimeAsync(3_000);
      expect(onChange).toHaveBeenCalledTimes(2);
      expect(onChange).toHaveBeenLastCalledWith({ address: "GTWO", network: APP_NETWORK });

      restore.mockResolvedValue(null);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(onChange).toHaveBeenLastCalledWith({ address: null, network: APP_NETWORK });
      stop();
    });

    it("keeps polling after a failed read", async () => {
      const restore = vi.fn().mockRejectedValueOnce(new Error("busy")).mockResolvedValue("GONE");
      const onChange = vi.fn();

      const stop = watchByPolling(
        { restore, getNetwork: vi.fn().mockResolvedValue(null) },
        onChange,
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(onChange).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(3_000);
      expect(onChange).toHaveBeenCalledWith({ address: "GONE", network: null });
      stop();
    });

    it("stops polling once unsubscribed", async () => {
      const restore = vi.fn().mockResolvedValue("GONE");
      const stop = watchByPolling(
        { restore, getNetwork: vi.fn().mockResolvedValue(null) },
        vi.fn(),
      );
      await vi.advanceTimersByTimeAsync(0);
      const callsWhenStopped = restore.mock.calls.length;

      stop();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(restore).toHaveBeenCalledTimes(callsWhenStopped);
    });

    it("does nothing for a wallet that can't be queried silently", async () => {
      const getNetwork = vi.fn();
      const onChange = vi.fn();

      const stop = watchByPolling({ getNetwork }, onChange);
      await vi.advanceTimersByTimeAsync(10_000);

      expect(getNetwork).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
      expect(() => stop()).not.toThrow();
    });
  });
});
