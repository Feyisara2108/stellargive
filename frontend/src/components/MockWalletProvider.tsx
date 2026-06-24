"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { WalletContext } from "@/lib/WalletProvider";

/**
 * Mock wallet context for E2E / CI testing without the Freighter browser
 * extension. Activated via `NEXT_PUBLIC_USE_MOCK_WALLET=true`.
 *
 * Provides the same `WalletContextType` interface as the real WalletProvider
 * so all downstream components (`WalletConnect`, `useDonate`, etc.) work
 * without modification.
 */

// Default predictable test address (valid Stellar G-address format)
const DEFAULT_MOCK_ADDRESS = "GTEST7SRIEMJXLK3LXKLS5RQ7JLDUZQUDVFNLWIM6DEDCZM5WLPSERV";

// A fake signed-transaction XDR returned by mock signTransaction.
const DEFAULT_MOCK_SIGNED_TX_XDR = "AAAAAgAAAABNMOCKTXaaaaaaaaaaaaaAAAAAAAAAAAAAAAAAAAA";

// A deterministic mock transaction hash for success dialogs.
export const MOCK_TX_HASH = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

interface MockWalletContextType {
  address: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  // Extra mock controls for test scripts
  setMockAddress: (addr: string) => void;
  setMockBalance: (bal: string) => void;
  setMockSignedTxXdr: (xdr: string) => void;
  mockBalance: string;
  mockSignedTxXdr: string;
}

const MockWalletContext = createContext<MockWalletContextType | undefined>(undefined);

/**
 * Installs global mock overrides for `@stellar/freighter-api` functions so
 * that any code importing them at runtime gets deterministic responses.
 */
function installFreighterMocks(address: string, signedTxXdr: string) {
  if (typeof window !== "undefined") {
    // Patch window.__mockWallet so Playwright tests can read/set state
    (window as any).__mockWallet = {
      address,
      signedTxXdr,
      connected: true,
    };
  }
}

export function MockWalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(DEFAULT_MOCK_ADDRESS);
  const [isConnected, setIsConnected] = useState(true); // auto-connect for E2E
  const [mockBalance, setMockBalance] = useState("1000.0000000");
  const [mockSignedTxXdr, setMockSignedTxXdr] = useState(DEFAULT_MOCK_SIGNED_TX_XDR);

  // Install global mocks on mount
  React.useEffect(() => {
    installFreighterMocks(address || DEFAULT_MOCK_ADDRESS, mockSignedTxXdr);
  }, [address, mockSignedTxXdr]);

  const connect = useCallback(async () => {
    setAddress(DEFAULT_MOCK_ADDRESS);
    setIsConnected(true);
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setIsConnected(false);
  }, []);

  const setMockAddress = useCallback((addr: string) => {
    setAddress(addr);
  }, []);

  return (
    <MockWalletContext.Provider
      value={{
        address,
        isConnected,
        connect,
        disconnect,
        setMockAddress,
        setMockBalance,
        setMockSignedTxXdr,
        mockBalance,
        mockSignedTxXdr,
      }}
    >
      <WalletContext.Provider value={{ address, isConnected, connect, disconnect }}>
        {children}
      </WalletContext.Provider>
    </MockWalletContext.Provider>
  );
}

/**
 * Hook that provides the same shape as `useWallet()` from the real provider.
 * Falls back to the standard interface expected by all components.
 */
export const useMockWallet = () => {
  const context = useContext(MockWalletContext);
  if (!context) {
    throw new Error("useMockWallet must be used within a MockWalletProvider");
  }
  return context;
};
