"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { isConnected, getAddress, setAllowed } from "@stellar/freighter-api";
import * as Sentry from "@sentry/nextjs";

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (address) {
      Sentry.setUser({ id: address });
    } else {
      Sentry.setUser(null);
    }
  }, [address]);
  const [isWalletConnected, setIsWalletConnected] = useState(false);

  useEffect(() => {
    const checkConnection = async () => {
      const connected = await isConnected();
      if (connected) {
        const result = await getAddress();
        if (result && "address" in result) {
          setAddress(result.address);
          setIsWalletConnected(true);
        }
      }
    };
    checkConnection();
  }, []);

  const connect = async () => {
    try {
      const allowed = await setAllowed();
      if (allowed) {
        const result = await getAddress();
        if (result && "address" in result) {
          setAddress(result.address);
          setIsWalletConnected(true);
        }
      }
    } catch (e) {
      console.error("Failed to connect wallet", e);
    }
  };

  const disconnect = () => {
    setAddress(null);
    setIsWalletConnected(false);
  };

  return (
    <WalletContext.Provider
      value={{ address, isConnected: isWalletConnected, connect, disconnect }}
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
