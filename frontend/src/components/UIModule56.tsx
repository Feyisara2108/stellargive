"use client";

import React, { useState } from "react";
import { AlertCircle, Calendar, Play, RefreshCw, Repeat, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface UIModule56Props {
  isStreamingEnabled?: boolean;
  tokenSymbol?: string;
  isLoading?: boolean;
  error?: Error | string | null;
  onRetry?: () => void;
  onStartStream?: (config: { rateAmount: number; frequency: "daily" | "weekly" | "monthly" }) => void;
}

export function UIModule56({
  isStreamingEnabled = true,
  tokenSymbol = "XLM",
  isLoading = false,
  error = null,
  onRetry,
  onStartStream,
}: UIModule56Props) {
  const [amount, setAmount] = useState<string>("5");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("monthly");

  // 1. Loading State
  if (isLoading) {
    return (
      <div
        data-testid="uimodule56-loading"
        role="status"
        aria-busy="true"
        aria-label="Loading recurring giving configuration"
        className="w-full p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse space-y-4"
      >
        <div className="h-6 w-1/3 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="h-10 w-full bg-slate-100 dark:bg-slate-800/50 rounded-lg" />
        <div className="h-12 w-full bg-slate-200 dark:bg-slate-800 rounded-lg" />
      </div>
    );
  }

  // 2. Error Fallback State
  if (error) {
    const errorMessage = typeof error === "string" ? error : error.message || "Failed to load recurring giving configuration.";

    return (
      <div
        data-testid="uimodule56-error"
        role="alert"
        className="w-full p-6 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200 space-y-4"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <h3 className="font-semibold text-base">Streaming Error</h3>
            <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
          </div>
        </div>
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            onClick={onRetry}
            className="min-h-[44px] min-w-[44px] border-red-300 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-900 dark:text-red-100 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          >
            <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
            Try Again
          </Button>
        )}
      </div>
    );
  }

  // 3. Empty Fallback State
  if (!isStreamingEnabled) {
    return (
      <div
        data-testid="uimodule56-empty"
        role="status"
        className="w-full p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-center space-y-3"
      >
        <Repeat className="w-10 h-10 mx-auto text-slate-400 dark:text-slate-500" aria-hidden="true" />
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-lg">Recurring Giving Disabled</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          Automated payment streaming is currently not supported for this campaign.
        </p>
      </div>
    );
  }

  // 4. Success State
  const numericAmount = parseFloat(amount) || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (numericAmount > 0 && onStartStream) {
      onStartStream({ rateAmount: numericAmount, frequency });
    }
  };

  return (
    <section
      data-testid="uimodule56-content"
      aria-label="Recurring Giving and Payment Stream Configurator"
      className="w-full p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm space-y-5"
    >
      <header className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shrink-0">
          <Zap className="w-6 h-6" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Continuous Micro-Giving Stream</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Stream funds automatically over time on Stellar Soroban with zero lockup.
          </p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Amount Input */}
        <div className="space-y-1.5">
          <label htmlFor="stream-amount" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Amount per Period ({tokenSymbol})
          </label>
          <div className="relative">
            <Input
              id="stream-amount"
              type="number"
              min="0.1"
              step="0.1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="min-h-[44px] pr-12 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
              placeholder="e.g. 10"
              required
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
              {tokenSymbol}
            </span>
          </div>
        </div>

        {/* Frequency Selection */}
        <div className="space-y-1.5">
          <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Streaming Cadence</span>
          <div className="grid grid-cols-3 gap-2">
            {(["daily", "weekly", "monthly"] as const).map((freq) => {
              const isSelected = frequency === freq;
              return (
                <button
                  key={freq}
                  type="button"
                  onClick={() => setFrequency(freq)}
                  aria-pressed={isSelected}
                  className={`min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg text-xs font-semibold capitalize transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 border ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/70"
                  }`}
                >
                  {freq}
                </button>
              );
            })}
          </div>
        </div>

        {/* Rate Summary */}
        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Estimated Monthly Total:</span>
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
              {(frequency === "daily"
                ? numericAmount * 30
                : frequency === "weekly"
                ? numericAmount * 4.33
                : numericAmount
              ).toFixed(2)}{" "}
              {tokenSymbol}
            </span>
          </div>
        </div>

        {/* Submit Action Button */}
        <Button
          type="submit"
          disabled={numericAmount <= 0}
          className="w-full min-h-[44px] min-w-[44px] font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
        >
          <Play className="w-4 h-4 mr-2" aria-hidden="true" />
          Start Stream ({numericAmount} {tokenSymbol}/{frequency.slice(0, -2)})
        </Button>
      </form>
    </section>
  );
}
