"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MAX_SIMULATION_FEE_STROOPS } from "@/lib/soroban";
import { useWalletBalance } from "@/hooks/useSoroban";
import { useWallet } from "@/lib/WalletProvider";
import { Skeleton } from "@/components/ui/skeleton";

// Inclusion (base) fee for a Soroban transaction, in stroops.
export const BASE_FEE_STROOPS = 100;
const RESOURCE_FEE_DOCS_URL =
  "https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering";

const NATIVE_XLM = "CDLZS3ZCDY7SF3SIVR6Y7I6SN636O27T7G5MKSUIU22ZS76E55WJIPZ4";

interface GasWarningProps {
  feeStroops?: number;
  estimatedFeeStroops?: number | null;
  feeLoading?: boolean;
  feeError?: boolean;
  onRetry?: () => void;
  onDismiss?: () => void;
}

function formatFeeXlm(stroops: number): string {
  const n = BigInt(stroops);
  const intPart = (n / 10_000_000n).toString();
  const decRaw = (n % 10_000_000n).toString().padStart(7, "0");
  return `${intPart}.${decRaw}`;
}

/** Splits a total fee into base + resource parts that always sum to the total. */
export function splitFee(totalStroops: number): { base: number; resource: number } {
  const base = Math.min(BASE_FEE_STROOPS, totalStroops);
  return { base, resource: totalStroops - base };
}

function FeeBreakdownPopover({ totalStroops }: { totalStroops: number }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const { base, resource } = splitFee(totalStroops);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  return (
    <span ref={wrapperRef} className="relative ml-1 inline-block align-middle">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Fee breakdown"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] font-bold leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        i
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Fee breakdown"
          className="absolute left-0 top-6 z-20 w-64 rounded-lg border border-blue-200 bg-white p-3 text-xs text-slate-800 shadow-lg dark:border-blue-800 dark:bg-slate-900 dark:text-slate-200"
        >
          <dl className="space-y-1">
            <div className="flex justify-between gap-2">
              <dt>Base fee</dt>
              <dd className="font-mono">{formatFeeXlm(base)} XLM</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Resource fee (est.)</dt>
              <dd className="font-mono">{formatFeeXlm(resource)} XLM</dd>
            </div>
            <div className="flex justify-between gap-2 border-t pt-1 font-semibold">
              <dt>Total</dt>
              <dd className="font-mono">{formatFeeXlm(totalStroops)} XLM</dd>
            </div>
          </dl>
          <a
            href={RESOURCE_FEE_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block underline"
          >
            How Soroban resource fees work
          </a>
        </div>
      )}
    </span>
  );
}

/**
 * Shows an estimated fee preview before signing, and/or a warning when
 * a transaction's simulated resource fee exceeds MAX_SIMULATION_FEE_STROOPS.
 */
export function GasWarning({
  feeStroops,
  estimatedFeeStroops,
  feeLoading = false,
  feeError = false,
  onRetry,
  onDismiss,
}: GasWarningProps) {
  const { address, walletNetwork } = useWallet();
  const { data: balance } = useWalletBalance(NATIVE_XLM, address);

  const balanceStroops = balance ?? 0n;
  const network = walletNetwork && walletNetwork.includes("Test") ? "testnet" : "mainnet";
  const isLowBalance = estimatedFeeStroops != null && balanceStroops < BigInt(estimatedFeeStroops);

  const isHighFee = feeStroops != null && feeStroops > MAX_SIMULATION_FEE_STROOPS;
  const showEstimate = estimatedFeeStroops != null && !isHighFee;

  if (feeLoading) {
    return (
      <div
        role="status"
        aria-label="Loading fee estimate"
        className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
      >
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    );
  }

  if (feeError) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-yellow-400 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300"
      >
        <div className="flex items-center justify-between">
          <span>Could not estimate network fee.</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs underline text-yellow-700 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-200"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!isHighFee && !showEstimate && !isLowBalance) return null;

  if (isLowBalance) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-400 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
      >
        <div className="flex items-start gap-3">
          <span className="text-lg leading-none">❌</span>
          <div className="flex-1">
            <p className="font-semibold">Insufficient XLM Balance</p>
            <p className="mt-1">
              You do not have enough XLM to cover the network fee. Estimated fee is{" "}
              <span className="font-mono">{formatFeeXlm(estimatedFeeStroops!)} XLM</span>, but your
              balance is{" "}
              <span className="font-mono">{formatFeeXlm(Number(balanceStroops))} XLM</span>.
            </p>
            {network === "testnet" && (
              <p className="mt-2 text-xs">
                Since you are on testnet, you can fund your wallet using the{" "}
                <a
                  href="https://laboratory.stellar.org/#account-creator?network=testnet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-red-600 dark:hover:text-red-400"
                >
                  Stellar Laboratory Friendbot
                </a>
                .
              </p>
            )}
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              aria-label="Dismiss gas warning"
              className="ml-auto text-red-600 hover:text-red-900 dark:hover:text-red-200"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    );
  }

  if (showEstimate) {
    return (
      <div
        role="status"
        className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-800 dark:text-blue-300"
      >
        <p className="font-medium">
          Estimated network fee:{" "}
          <span className="font-mono">{formatFeeXlm(estimatedFeeStroops)} XLM</span>
          <FeeBreakdownPopover totalStroops={estimatedFeeStroops} />
        </p>
        <p className="mt-0.5 text-xs text-blue-600 dark:text-blue-400">
          Approximate fee charged by the Stellar network to process your transaction.
        </p>
      </div>
    );
  }

  const ratio = ((feeStroops as number) / MAX_SIMULATION_FEE_STROOPS).toFixed(1);

  return (
    <div
      role="alert"
      className="rounded-lg border border-yellow-400 bg-yellow-50 p-4 text-sm text-yellow-800"
    >
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none">⚠️</span>
        <div className="flex-1">
          <p className="font-semibold">High transaction cost detected</p>
          <p className="mt-1">
            This transaction is estimated to use{" "}
            <span className="font-mono font-bold">{(feeStroops as number).toLocaleString()}</span>{" "}
            stroops — {ratio}× the expected maximum. Unusually high fees may indicate a
            misconfigured transaction or an attempt to exhaust resources.
          </p>
          <p className="mt-2 text-xs text-yellow-700">
            You can still proceed, but review the transaction details carefully before signing.
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss gas warning"
            className="ml-auto text-yellow-600 hover:text-yellow-900"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
