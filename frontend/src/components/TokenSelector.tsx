"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Check, ChevronDown, Coins, AlertTriangle, ShieldCheck } from "lucide-react";
import { getTokenMetadata, TokenMetadata } from "@/lib/soroban";
import { useTokenMetadata } from "@/hooks/useSoroban";
import { toast } from "sonner";

// Predefined tokens for campaign creation
export const PREDEFINED_TOKENS = [
  {
    symbol: "XLM",
    name: "Stellar Lumens (Native)",
    address: "CDLZS3ZCDY7SF3SIVR6Y7I6SN636O27T7G5MKSUIU22ZS76E55WJIPZ4",
    decimals: 7,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "CA3D5AJURHEK4LI6JE6IWHT3W7YA3UNJKXTYAXISJ3Q2TZ2VT6AI2372",
    decimals: 7,
  },
  {
    symbol: "yXLM",
    name: "Yield Lumens",
    address: "CDA3ZHQ34NOHB2G2R6E55SF3SIVR6Y7I6SN636O27T7G5MKSUIU22ZS76E",
    decimals: 7,
  },
];

// Module-level cache to prevent redundant RPC calls across mounts
const tokenMetadataCache: Record<string, TokenMetadata> = {};

interface TokenSelectorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  allowCustom?: boolean;
}

export function TokenSelector({ value, onChange, label, allowCustom = true }: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customAddress, setCustomAddress] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [customTokenMeta, setCustomTokenMeta] = useState<TokenMetadata | null>(null);

  // Dynamically fetch token metadata via hook for non-predefined or custom tokens
  const { data: dynamicMeta, isLoading: isMetaLoading, isError: isMetaError } = useTokenMetadata(
    value && !PREDEFINED_TOKENS.some((t) => t.address === value) ? value : null,
  );

  // Selected token label resolution
  const predefinedToken = PREDEFINED_TOKENS.find((t) => t.address === value);
  const cachedMeta = tokenMetadataCache[value];

  const resolvedMeta =
    predefinedToken ||
    (dynamicMeta
      ? { symbol: dynamicMeta.symbol, name: dynamicMeta.name || "SAC Token", address: value, decimals: dynamicMeta.decimals }
      : cachedMeta
        ? { symbol: cachedMeta.symbol, name: cachedMeta.name || "SAC Token", address: value, decimals: cachedMeta.decimals }
        : null);

  const isInvalidSAC = !!value && !predefinedToken && (isMetaError || (!isMetaLoading && !resolvedMeta));
  const decimals = resolvedMeta?.decimals ?? 7;
  const decimalPlaceholder = `e.g. ${(10).toFixed(Math.min(decimals, 7))}`;

  const handleSelect = (address: string) => {
    onChange(address);
    setIsOpen(false);
  };

  const handleCustomAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const address = e.target.value.trim();
    setCustomAddress(address);
    setValidationError(null);
    setCustomTokenMeta(null);
  };

  useEffect(() => {
    // Basic regex validation for Soroban Contract ID: starts with 'C' and has length 56
    const isContractId = /^C[A-Z0-9]{55}$/.test(customAddress);

    if (!customAddress) return;

    if (!isContractId) {
      setValidationError("Invalid contract format. Must start with 'C' and be 56 characters.");
      return;
    }

    // Check Cache first
    if (tokenMetadataCache[customAddress]) {
      setCustomTokenMeta(tokenMetadataCache[customAddress]);
      return;
    }

    // Fetch and validate SAC compliance via simulation
    const validateSAC = async () => {
      setIsValidating(true);
      setValidationError(null);
      try {
        const metadata = await getTokenMetadata(customAddress);

        // Caching validated metadata
        tokenMetadataCache[customAddress] = metadata;
        setCustomTokenMeta(metadata);
        toast.success(`Validated SAC compliant token: ${metadata.symbol}`);
      } catch (err: any) {
        setValidationError(err.message || "Failed to validate SAC interface compliance");
      } finally {
        setIsValidating(false);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      validateSAC();
    }, 600); // Debounce user typing

    return () => clearTimeout(delayDebounceFn);
  }, [customAddress]);

  const handleAddCustom = () => {
    if (customTokenMeta && customAddress) {
      handleSelect(customAddress);
      setCustomAddress("");
      setCustomTokenMeta(null);
      setShowCustom(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label ?? "Accepted Token"}</Label>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between bg-background border-border hover:bg-accent hover:text-accent-foreground text-left font-normal"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary shrink-0" />
            {resolvedMeta ? (
              <span className="font-medium text-foreground flex items-center gap-1.5 flex-wrap">
                <span>{resolvedMeta.symbol}</span>
                <Badge variant="secondary" className="text-[10px] px-1 py-0 font-normal bg-emerald-500/10 text-emerald-600 border-emerald-500/20 flex items-center gap-0.5">
                  <ShieldCheck className="h-2.5 w-2.5" /> SAC
                </Badge>
                {resolvedMeta.address && (
                  <span className="text-xs text-muted-foreground font-mono">
                    ({resolvedMeta.address.slice(0, 6)}...{resolvedMeta.address.slice(-6)})
                  </span>
                )}
              </span>
            ) : isInvalidSAC ? (
              <span className="flex items-center gap-1.5 text-foreground">
                <span className="text-xs font-mono">
                  ({value.slice(0, 6)}...{value.slice(-6)})
                </span>
                <Badge variant="destructive" className="text-[10px] px-1 py-0 flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" /> Invalid SAC
                </Badge>
              </span>
            ) : isMetaLoading ? (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                Resolving token metadata...
              </span>
            ) : (
              <span className="text-muted-foreground">
                {allowCustom ? "Select a token..." : "All Tokens"}
              </span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>

        {isOpen && (
          <div className="absolute left-0 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-md z-50 p-2">
            <div className="space-y-1">
              {!allowCustom && (
                <button
                  type="button"
                  onClick={() => handleSelect("")}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <span className="font-medium">All Tokens</span>
                  {value === "" && <Check className="h-4 w-4 text-primary" />}
                </button>
              )}
              {PREDEFINED_TOKENS.map((token) => (
                <button
                  key={token.address}
                  type="button"
                  onClick={() => handleSelect(token.address)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <div className="flex flex-col text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">{token.symbol}</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 text-emerald-600 bg-emerald-500/10 border-emerald-500/20">
                        SAC
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{token.name}</span>
                  </div>
                  {value === token.address && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>

            {allowCustom && (
              <div className="border-t border-border mt-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs text-primary"
                  onClick={() => {
                    setShowCustom(!showCustom);
                    setValidationError(null);
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {showCustom ? "Hide Custom Token Option" : "Add Custom Token"}
                </Button>

                {showCustom && (
                  <div className="p-2 space-y-2 bg-muted/40 rounded mt-1">
                    <Input
                      placeholder={`Contract ID (C...) — ${decimalPlaceholder}`}
                      value={customAddress}
                      onChange={handleCustomAddressChange}
                      className="h-8 text-xs font-mono"
                    />

                    {isValidating && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        Validating SAC interface compliance...
                      </div>
                    )}

                    {validationError && (
                      <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 p-1.5 rounded">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>{validationError}</span>
                      </div>
                    )}

                    {customTokenMeta && (
                      <div className="flex items-center justify-between text-xs bg-primary/10 p-1.5 rounded">
                        <span>
                          Symbol: <strong>{customTokenMeta.symbol}</strong> (Decimals:{" "}
                          {customTokenMeta.decimals})
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={handleAddCustom}
                        >
                          Add & Select
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
