"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  restoreWallet,
  connectWallet,
  disconnectWallet,
  getWalletNetwork,
  getNetworkSwitcher,
  type WalletId,
} from "@/lib/wallet";
import { WalletPicker } from "@/components/WalletPicker";
import * as Sentry from "@sentry/nextjs";
import { notify } from "@/lib/toast";
import { logger } from "@/lib/logger";

const APP_NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!;
export const WALLET_CONNECTED_KEY = "stellargive:wallet-previously-connected";
/** Set when the user explicitly disconnects, so a reload doesn't silently reconnect. */
export const WALLET_DISCONNECTED_KEY = "stellargive:wallet-disconnected";
export const FREIGHTER_INSTALL_URL = "https://www.freighter.app/";

/** How often Freighter is polled for an account switch while connected, in ms. */
const ACCOUNT_WATCH_INTERVAL_MS = 3000;

/** Query-key prefixes whose data belongs to the connected account. */
const USER_SCOPED_QUERY_PREFIXES = ["wallet-balance", "refund-eligibility", "fee-estimate"];

export type ConnectResult =
  | { success: true; address: string }
  | { success: false; reason: "not-installed" | "rejected" | "error"; error?: unknown };

// localStorage can throw (private mode, blocked site data); the wallet must still work.
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    if (value) {
      localStorage.setItem(key, "true");
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export interface NetworkSwitchResult {
  /** Whether the connected wallet exposed a programmatic switch capability at all. */
  supported: boolean;
  success: boolean;
}

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  walletNetwork: string | null;
  isWrongNetwork: boolean;
  /** Opens the wallet picker; resolves true once a wallet is connected, false if the user closes it. */
  connect: () => Promise<boolean>;
  disconnect: () => void;
  switchNetwork: (targetNetworkPassphrase: string) => Promise<NetworkSwitchResult>;
}

export const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [address, setAddress] = useState<string | null>(null);
  // Read by the account watcher, which outlives any single render's `address`.
  const addressRef = useRef(address);
  useEffect(() => {
    addressRef.current = address;
  }, [address]);
  const [walletNetwork, setWalletNetwork] = useState<string | null>(null);
  const walletNetworkRef = useRef(walletNetwork);
  walletNetworkRef.current = walletNetwork;

  const isWrongNetwork = walletNetwork !== null && walletNetwork !== APP_NETWORK_PASSPHRASE;

  useEffect(() => {
    if (address) {
      Sentry.setUser({ id: address });
    } else {
      Sentry.setUser(null);
    }
  }, [address]);
  const [isWalletConnected, setIsWalletConnected] = useState(false);

  const fetchWalletNetwork = useCallback(async () => {
    try {
      setWalletNetwork(await getWalletNetwork());
    } catch {
      setWalletNetwork(null);
    }
  }, []);

  /**
   * Adopts the account Freighter currently has selected. When it differs from the
   * one in use, everything cached for the previous account is invalidated so no
   * balance, eligibility or fee estimate leaks across accounts.
   */
  const applyAccountChange = useCallback(
    (nextAddress: string) => {
      const previous = addressRef.current;
      if (!nextAddress || previous === null || nextAddress === previous) return;

      addressRef.current = nextAddress;
      setAddress(nextAddress);
      void queryClient.invalidateQueries({
        predicate: (query: Query) => {
          const [prefix] = query.queryKey;
          return (
            (typeof prefix === "string" && USER_SCOPED_QUERY_PREFIXES.includes(prefix)) ||
            query.queryKey.includes(previous)
          );
        },
      });
    },
    [queryClient],
  );

  const refreshAddress = useCallback(async () => {
    try {
      const result = await getAddress();
      if (result && "address" in result && !result.error) {
        applyAccountChange(result.address);
      }
    } catch {
      // keep the current address; the next poll or focus retries
    }
  }, [applyAccountChange]);

  useEffect(() => {
    const checkConnection = async () => {
      // The user explicitly disconnected; stay disconnected until they connect again.
      if (readFlag(WALLET_DISCONNECTED_KEY)) return;
      try {
        const restored = await restoreWallet();
        if (restored) {
          setAddress(restored);
          setIsWalletConnected(true);
          fetchWalletNetwork();

          const wasConnected = localStorage.getItem(WALLET_CONNECTED_KEY) === "true";
          if (wasConnected) {
            notify.info("Wallet reconnected");
          } else {
            localStorage.setItem(WALLET_CONNECTED_KEY, "true");
          }
        }
      } catch {
        // ignore
      }
    };
    checkConnection();
  }, [fetchWalletNetwork]);

  // Freighter emits no events, so poll it for account switches while connected.
  useEffect(() => {
    if (!isWalletConnected) return;

    const watcher = new WatchWalletChanges(ACCOUNT_WATCH_INTERVAL_MS);
    watcher.watch(({ address: nextAddress, error }) => {
      if (!error) applyAccountChange(nextAddress);
    });
    return () => watcher.stop();
  }, [isWalletConnected, applyAccountChange]);

  useEffect(() => {
    if (!isWalletConnected) return;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchWalletNetwork();
        refreshAddress();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [isWalletConnected, fetchWalletNetwork, refreshAddress]);

  // connect() opens the wallet picker and resolves once the user has connected a
  // wallet (true) or closed the picker (false).
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerResolver = useRef<((connected: boolean) => void) | null>(null);

  const settlePicker = useCallback((connected: boolean) => {
    setIsPickerOpen(false);
    pickerResolver.current?.(connected);
    pickerResolver.current = null;
  }, []);

  const connect = useCallback(() => {
    pickerResolver.current?.(false);
    setIsPickerOpen(true);
    return new Promise<boolean>((resolve) => {
      pickerResolver.current = resolve;
    });
  }, []);

  const connectWith = useCallback(
    async (walletId: WalletId) => {
      try {
        const connected = await connectWallet(walletId);
        setAddress(connected);
        setIsWalletConnected(true);
        fetchWalletNetwork();
        localStorage.setItem(WALLET_CONNECTED_KEY, "true");
        settlePicker(true);
      } catch (e) {
        logger.error("Failed to connect wallet", e);
        // The picker shows the error and stays open so another wallet can be tried.
        throw e;
      }
    },
    [fetchWalletNetwork, settlePicker],
  );

  const disconnect = () => {
    void disconnectWallet();
    setAddress(null);
    setIsWalletConnected(false);
    setWalletNetwork(null);
    writeFlag(WALLET_DISCONNECTED_KEY, true);
    writeFlag(WALLET_CONNECTED_KEY, false);
  };

  // Freighter (and most wallets) can't change the active network on the user's
  // behalf, but some may. The wallet layer feature-detects that capability on the
  // selected wallet, so callers can fall back to manual instructions when it's
  // unsupported.
  const switchNetwork = useCallback(
    async (targetNetworkPassphrase: string): Promise<NetworkSwitchResult> => {
      const requestNetworkChange = await getNetworkSwitcher();
      if (!requestNetworkChange) {
        return { supported: false, success: false };
      }
      try {
        await requestNetworkChange(targetNetworkPassphrase);
        await fetchWalletNetwork();
        return { supported: true, success: true };
      } catch (e) {
        logger.error("Failed to switch wallet network", e);
        return { supported: true, success: false };
      }
    },
    [fetchWalletNetwork],
  );

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected: isWalletConnected,
        walletNetwork,
        isWrongNetwork,
        connect,
        disconnect,
        switchNetwork,
      }}
    >
      {children}
      <WalletPicker
        open={isPickerOpen}
        onSelect={connectWith}
        onClose={() => settlePicker(false)}
      />
    </WalletContext.Provider>
  );
}

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
};
