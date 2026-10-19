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

const APP_NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!;
export const WALLET_CONNECTED_KEY = "stellargive:wallet-previously-connected";

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
  const [address, setAddress] = useState<string | null>(null);
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

  useEffect(() => {
    const checkConnection = async () => {
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

  useEffect(() => {
    if (!isWalletConnected) return;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchWalletNetwork();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [isWalletConnected, fetchWalletNetwork]);

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
        console.error("Failed to connect wallet", e);
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
        console.error("Failed to switch wallet network", e);
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
