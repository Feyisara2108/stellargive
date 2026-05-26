"use client";

import { MAX_SIMULATION_FEE_STROOPS } from "@/lib/soroban";

interface GasWarningProps {
  feeStroops: number;
  onDismiss?: () => void;
}

/**
 * Shown when a transaction's simulated resource fee exceeds
 * MAX_SIMULATION_FEE_STROOPS.  The user can dismiss and continue signing or
 * cancel the transaction.
 */
export function GasWarning({ feeStroops, onDismiss }: GasWarningProps) {
  const ratio = (feeStroops / MAX_SIMULATION_FEE_STROOPS).toFixed(1);

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
            <span className="font-mono font-bold">{feeStroops.toLocaleString()}</span>{" "}
            stroops — {ratio}× the expected maximum. Unusually high fees may
            indicate a misconfigured transaction or an attempt to exhaust
            resources.
          </p>
          <p className="mt-2 text-xs text-yellow-700">
            You can still proceed, but review the transaction details carefully
            before signing.
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
