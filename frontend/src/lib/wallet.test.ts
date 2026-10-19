import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const freighterApi = vi.hoisted(() => ({
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
}));
vi.mock("@stellar/freighter-api", () => freighterApi);

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
} from "./wallet";

const APP_NETWORK = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!;
const SIGN_OPTS = { networkPassphrase: APP_NETWORK, address: "GSIGNER" };

type TestWindow = Window & { hanaWallet?: unknown; rabet?: unknown };

describe("wallet abstraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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
      freighterApi.signTransaction.mockResolvedValue({ signedTxXdr: "SIGNED", signerAddress: "GF" });

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
});
