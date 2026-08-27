"use client";

import React, { useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface Milestone {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  description: string;
  isCompleted: boolean;
}

export interface UIModule53Props {
  milestones?: Milestone[];
  isLoading?: boolean;
  error?: Error | string | null;
  onRetry?: () => void;
  onSelectTier?: (amount: number) => void;
}

const DEFAULT_DONATION_TIERS = [10, 25, 50, 100];

export function UIModule53({
  milestones = [],
  isLoading = false,
  error = null,
  onRetry,
  onSelectTier,
}: UIModule53Props) {
  const [selectedTier, setSelectedTier] = useState<number | null>(null);

  // 1. Loading State
  if (isLoading) {
    return (
      <div
        data-testid="uimodule53-loading"
        role="status"
        aria-busy="true"
        aria-label="Loading campaign milestones"
        className="w-full p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse space-y-4"
      >
        <div className="h-6 w-1/3 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="h-4 w-2/3 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="space-y-3 pt-2">
          <div className="h-16 w-full bg-slate-100 dark:bg-slate-800/50 rounded-lg" />
          <div className="h-16 w-full bg-slate-100 dark:bg-slate-800/50 rounded-lg" />
        </div>
      </div>
    );
  }

  // 2. Error Fallback State
  if (error) {
    const errorMessage = typeof error === "string" ? error : error.message || "Failed to load milestone data.";

    return (
      <div
        data-testid="uimodule53-error"
        role="alert"
        className="w-full p-6 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200 space-y-4"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <h3 className="font-semibold text-base">Error Loading Milestones</h3>
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
  if (!milestones || milestones.length === 0) {
    return (
      <div
        data-testid="uimodule53-empty"
        role="status"
        className="w-full p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-center space-y-3"
      >
        <Target className="w-10 h-10 mx-auto text-slate-400 dark:text-slate-500" aria-hidden="true" />
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-lg">No Milestones Defined</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          This campaign has not configured specific funding milestones yet.
        </p>
      </div>
    );
  }

  // 4. Success State
  const totalTarget = milestones.reduce((sum, m) => sum + m.targetAmount, 0);
  const totalCurrent = milestones.reduce((sum, m) => sum + m.currentAmount, 0);
  const overallProgress = totalTarget > 0 ? Math.min(100, Math.round((totalCurrent / totalTarget) * 100)) : 0;

  const handleTierClick = (amount: number) => {
    setSelectedTier(amount);
    if (onSelectTier) {
      onSelectTier(amount);
    }
  };

  return (
    <section
      data-testid="uimodule53-content"
      aria-label="Donation Milestones and Impact Calculator"
      className="w-full p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm space-y-6"
    >
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Campaign Milestones
          </h2>
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            {overallProgress}% Overall Progress
          </span>
        </div>

        {/* Accessibility Progress Bar */}
        <div
          role="progressbar"
          aria-valuenow={overallProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Overall campaign milestone progress"
          className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"
        >
          <div
            className="h-full bg-primary transition-all duration-300 rounded-full"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </header>

      {/* Milestone List */}
      <div className="space-y-3">
        {milestones.map((milestone) => {
          const progress =
            milestone.targetAmount > 0
              ? Math.min(100, Math.round((milestone.currentAmount / milestone.targetAmount) * 100))
              : 0;

          return (
            <article
              key={milestone.id}
              className="p-4 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/40 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {milestone.isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-label="Completed" />
                  ) : (
                    <Target className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                  )}
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                    {milestone.title}
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-600 dark:text-slate-300 shrink-0">
                  {milestone.currentAmount} / {milestone.targetAmount} XLM
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">{milestone.description}</p>
              <div
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progress for ${milestone.title}`}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"
              >
                <div
                  className={`h-full transition-all duration-300 ${
                    milestone.isCompleted ? "bg-emerald-500" : "bg-blue-600 dark:bg-blue-500"
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </article>
          );
        })}
      </div>

      {/* Interactive Quick Tiers */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
          Select Donation Tier (XLM)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {DEFAULT_DONATION_TIERS.map((amount) => {
            const isSelected = selectedTier === amount;
            return (
              <button
                key={amount}
                type="button"
                onClick={() => handleTierClick(amount)}
                aria-pressed={isSelected}
                className={`min-h-[44px] min-w-[44px] px-4 py-2.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 border ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/80"
                }`}
              >
                {amount} XLM
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
