"use client";

import { useWallet } from "@/lib/WalletProvider";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet, LogOut, RefreshCw, ChevronDown } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { formatAddress } from "@/utils/format";
import { getSACBalance, fromStroops } from "@/lib/soroban";
import * as freighter from "@stellar/freighter-api";

const NATIVE_XLM = "CDLZS3ZCDY7SF3SIVR6Y7I6SN636O27T7G5MKSUIU22ZS76E55WJIPZ4";

export function WalletConnect() {
  const { address, isConnected, connect, disconnect } = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchBalance = async () => {
    if (!address) return;
    setIsLoadingBalance(true);
    setBalanceError(null);
    try {
      const balBigInt = await getSACBalance(NATIVE_XLM, address);
      setBalance(fromStroops(balBigInt));
    } catch (e: any) {
      setBalanceError(e.message || "Failed to fetch XLM balance");
    } finally {
      setIsLoadingBalance(false);
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      fetchBalance();
    } else {
      setBalance(null);
      setBalanceError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await connect();
      toast.success("Wallet connected!");
    } catch (e) {
      toast.error("Failed to connect wallet");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    try {
      if (typeof (freighter as any).disconnect === "function") {
        (freighter as any).disconnect();
      }
    } catch (err) {
      console.warn("Freighter disconnect method not available", err);
    }
    disconnect();
    setIsDropdownOpen(false);
    toast.info("Wallet disconnected");
  };

  if (isConnected && address) {
    return (
      <div className="relative" ref={dropdownRef}>
        <Button
          type="button"
          variant="outline"
          className="flex items-center gap-2 bg-secondary/50 border-border hover:bg-secondary transition-all"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        >
          <Wallet className="h-4 w-4 text-primary" />
          <span className="font-mono text-sm">{formatAddress(address)}</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`}
          />
        </Button>

        {isDropdownOpen && (
          <div className="absolute right-0 mt-2 w-64 rounded-xl border border-border bg-popover p-4 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col gap-3">
              <div className="border-b border-border pb-3">
                <span className="text-xs text-muted-foreground font-semibold block mb-1">
                  STRENGTH OF WALLET
                </span>
                <span className="text-sm font-mono text-foreground break-all bg-muted/30 p-2 rounded block">
                  {address}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-semibold">BALANCE (XLM)</span>
                  {balanceError && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive/80"
                      onClick={fetchBalance}
                      title="Retry fetching balance"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {isLoadingBalance ? (
                  <div className="flex items-center gap-2 py-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Loading balance...</span>
                  </div>
                ) : balanceError ? (
                  <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                    {balanceError}
                  </div>
                ) : (
                  <span className="text-lg font-bold text-foreground">
                    {balance
                      ? `${Number(balance).toLocaleString(undefined, { maximumFractionDigits: 4 })} XLM`
                      : "0 XLM"}
                  </span>
                )}
              </div>

              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-full flex items-center justify-center gap-2 mt-2"
                onClick={handleDisconnect}
              >
                <LogOut className="h-4 w-4" />
                Disconnect
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Button
      type="button"
      onClick={handleConnect}
      disabled={isConnecting}
      className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 transition-all"
    >
      {isConnecting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          <Wallet className="mr-2 h-4 w-4" />
          Connect Wallet
        </>
      )}
    </Button>
  );
}
