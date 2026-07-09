"use client";

import { MAX_SIMULATION_FEE_STROOPS, fromStroops } from "@/lib/soroban";
import { useWalletBalance } from "@/hooks/useSoroban";
import { useWallet } from "@/lib/WalletProvider";

const NATIVE_XLM = "CDLZS3ZCDY7SF3SIVR6Y7I6SN636O27T7G5MKSUIU22ZS76E55WJIPZ4";

interface GasWarningProps {
  feeStroops?: number;
  estimatedFeeStroops?: number | null;
  onDismiss?: () => void;
}

/**
 * Shows an estimated fee preview before signing, and/or a warning when
 * a transaction's simulated resource fee exceeds MAX_SIMULATION_FEE_STROOPS.
 */
export function GasWarning({ feeStroops, estimatedFeeStroops, onDismiss }: GasWarningProps) {
  const isHighFee = feeStroops != null && feeStroops > MAX_SIMULATION_FEE_STROOPS;
  const showEstimate = estimatedFeeStroops != null && !isHighFee;

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
              <span className="font-mono">{fromStroops(estimatedFeeStroops!)} XLM</span>, but your
              balance is <span className="font-mono">{fromStroops(balanceStroops)} XLM</span>.
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
          <span className="font-mono">{fromStroops(estimatedFeeStroops)} XLM</span>
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
