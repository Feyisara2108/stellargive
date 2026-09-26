"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { isConnected, getAddress, setAllowed, getNetwork } from "@stellar/freighter-api";
import * as Sentry from "@sentry/nextjs";
import { notify } from "@/lib/toast";

const APP_NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!;
export const WALLET_CONNECTED_KEY = "stellargive:wallet-previously-connected";

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  walletNetwork: string | null;
  isWrongNetwork: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
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
      const network = await getNetwork();
      if (network && "network" in network) {
        setWalletNetwork(network.network);
      }
    } catch {
      setWalletNetwork(null);
    }
  }, []);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const connected = await isConnected();
        if (connected && connected.isConnected) {
          const result = await getAddress();
          if (result && "address" in result) {
            setAddress(result.address);
            setIsWalletConnected(true);
            fetchWalletNetwork();

            const wasConnected = localStorage.getItem(WALLET_CONNECTED_KEY) === "true";
            if (wasConnected) {
              notify.info("Wallet reconnected");
            } else {
              localStorage.setItem(WALLET_CONNECTED_KEY, "true");
            }
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

  const connect = async () => {
    try {
      const allowed = await setAllowed();
      if (allowed && allowed.isAllowed) {
        const result = await getAddress();
        if (result && "address" in result) {
          setAddress(result.address);
          setIsWalletConnected(true);
          fetchWalletNetwork();
          localStorage.setItem(WALLET_CONNECTED_KEY, "true");
        }
      }
    } catch (e) {
      console.error("Failed to connect wallet", e);
    }
  };

  const disconnect = () => {
    setAddress(null);
    setIsWalletConnected(false);
    setWalletNetwork(null);
  };

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected: isWalletConnected,
        walletNetwork,
        isWrongNetwork,
        connect,
        disconnect,
      }}
    >
      {children}
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
