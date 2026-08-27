"use client";

import React, { useState } from "react";
import { AlertCircle, Award, Check, Gift, RefreshCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface RewardTier {
  id: string;
  name: string;
  minAmount: number;
  description: string;
  perks: string[];
  badgeColor?: string;
  isPopular?: boolean;
}

export interface UIModule55Props {
  tiers?: RewardTier[];
  isLoading?: boolean;
  error?: Error | string | null;
  selectedTierId?: string | null;
  onRetry?: () => void;
  onSelectTier?: (tier: RewardTier) => void;
}

export function UIModule55({
  tiers = [],
  isLoading = false,
  error = null,
  selectedTierId = null,
  onRetry,
  onSelectTier,
}: UIModule55Props) {
  const [activeTierId, setActiveTierId] = useState<string | null>(selectedTierId);

  // 1. Loading State
  if (isLoading) {
    return (
      <div
        data-testid="uimodule55-loading"
        role="status"
        aria-busy="true"
        aria-label="Loading donor reward tiers"
        className="w-full p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse space-y-4"
      >
        <div className="h-6 w-1/3 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="h-44 bg-slate-100 dark:bg-slate-800/50 rounded-xl" />
          <div className="h-44 bg-slate-100 dark:bg-slate-800/50 rounded-xl" />
          <div className="h-44 bg-slate-100 dark:bg-slate-800/50 rounded-xl" />
        </div>
      </div>
    );
  }

  // 2. Error Fallback State
  if (error) {
    const errorMessage = typeof error === "string" ? error : error.message || "Failed to load donor reward tiers.";

    return (
      <div
        data-testid="uimodule55-error"
        role="alert"
        className="w-full p-6 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200 space-y-4"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <h3 className="font-semibold text-base">Unable to Load Reward Tiers</h3>
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
  if (!tiers || tiers.length === 0) {
    return (
      <div
        data-testid="uimodule55-empty"
        role="status"
        className="w-full p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-center space-y-3"
      >
        <Gift className="w-10 h-10 mx-auto text-slate-400 dark:text-slate-500" aria-hidden="true" />
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-lg">No Reward Tiers Available</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          This campaign currently offers open-amount giving without preset reward tiers.
        </p>
      </div>
    );
  }

  // 4. Success State
  const handleSelect = (tier: RewardTier) => {
    setActiveTierId(tier.id);
    if (onSelectTier) {
      onSelectTier(tier);
    }
  };

  return (
    <section
      data-testid="uimodule55-content"
      aria-label="Donor Reward & Recognition Tiers"
      className="w-full p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm space-y-6"
    >
      <header className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Donor Recognition Tiers
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Unlock exclusive campaign perks and NFT badges based on your contribution tier.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiers.map((tier) => {
          const isSelected = activeTierId === tier.id;

          return (
            <article
              key={tier.id}
              className={`relative flex flex-col justify-between p-5 rounded-xl border transition-all duration-200 ${
                isSelected
                  ? "border-primary bg-primary/5 dark:bg-primary/10 ring-2 ring-primary ring-offset-2 dark:ring-offset-slate-900"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700"
              }`}
            >
              {tier.isPopular && (
                <span className="absolute -top-3 right-4 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500 text-white shadow-sm">
                  <Star className="w-3 h-3 fill-current" aria-hidden="true" />
                  Most Popular
                </span>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
                    <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">{tier.name}</h3>
                  </div>
                </div>

                <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                  {tier.minAmount}{" "}
                  <span className="text-xs font-normal text-slate-600 dark:text-slate-400">XLM min</span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400">{tier.description}</p>

                {tier.perks.length > 0 && (
                  <ul className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-700/60" aria-label={`Perks for ${tier.name}`}>
                    {tier.perks.map((perk, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-4 mt-auto">
                <Button
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  onClick={() => handleSelect(tier)}
                  aria-pressed={isSelected}
                  className="w-full min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 font-semibold"
                >
                  {isSelected ? "Selected Tier" : "Select Tier"}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
