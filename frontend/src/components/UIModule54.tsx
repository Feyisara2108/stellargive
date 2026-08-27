"use client";

import React, { useState } from "react";
import { AlertCircle, CheckCircle, Copy, ExternalLink, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface VerificationCheck {
  id: string;
  label: string;
  passed: boolean;
  timestamp?: string;
}

export interface UIModule54Props {
  beneficiaryName?: string;
  verificationLevel?: "unverified" | "basic" | "verified" | "audited";
  checks?: VerificationCheck[];
  auditHash?: string;
  isLoading?: boolean;
  error?: Error | string | null;
  onRetry?: () => void;
  onRequestVerification?: () => void;
}

export function UIModule54({
  beneficiaryName = "Beneficiary Entity",
  verificationLevel = "verified",
  checks = [],
  auditHash = "0x8f3c...b412",
  isLoading = false,
  error = null,
  onRetry,
  onRequestVerification,
}: UIModule54Props) {
  const [copied, setCopied] = useState(false);

  // 1. Loading Fallback State
  if (isLoading) {
    return (
      <div
        data-testid="uimodule54-loading"
        role="status"
        aria-busy="true"
        aria-label="Loading verification details"
        className="w-full p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse space-y-4"
      >
        <div className="h-6 w-1/2 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="h-20 w-full bg-slate-100 dark:bg-slate-800/50 rounded-lg" />
      </div>
    );
  }

  // 2. Error Fallback State
  if (error) {
    const errorMessage = typeof error === "string" ? error : error.message || "Failed to load beneficiary verification data.";

    return (
      <div
        data-testid="uimodule54-error"
        role="alert"
        className="w-full p-6 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200 space-y-4"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <h3 className="font-semibold text-base">Verification Error</h3>
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
            Retry
          </Button>
        )}
      </div>
    );
  }

  // 3. Empty Fallback State
  if (verificationLevel === "unverified" && checks.length === 0) {
    return (
      <div
        data-testid="uimodule54-empty"
        role="status"
        className="w-full p-8 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 text-center space-y-4"
      >
        <ShieldOff className="w-10 h-10 mx-auto text-amber-500 dark:text-amber-400" aria-hidden="true" />
        <div className="space-y-1">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-lg">
            Unverified Beneficiary
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            This beneficiary has not submitted identity or organization audit records yet.
          </p>
        </div>
        {onRequestVerification && (
          <Button
            type="button"
            onClick={onRequestVerification}
            className="min-h-[44px] min-w-[44px] bg-amber-600 hover:bg-amber-700 text-white focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          >
            Request Verification
          </Button>
        )}
      </div>
    );
  }

  // 4. Success State
  const handleCopyHash = () => {
    if (navigator?.clipboard && auditHash) {
      navigator.clipboard.writeText(auditHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const badgeColors = {
    unverified: "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800",
    basic: "bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800",
    verified: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
    audited: "bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800",
  };

  return (
    <section
      data-testid="uimodule54-content"
      aria-label="Beneficiary Verification and Security Status"
      className="w-full p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm space-y-5"
    >
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
            <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{beneficiaryName}</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">On-Chain Beneficiary Verification Status</p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border capitalize self-start sm:self-auto ${
            badgeColors[verificationLevel]
          }`}
        >
          <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
          {verificationLevel} Status
        </span>
      </header>

      {/* Verification Checklist */}
      {checks.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Security Checklist
          </h3>
          <ul className="space-y-2" aria-label="Verification checks">
            {checks.map((check) => (
              <li
                key={check.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle
                    className={`w-4 h-4 shrink-0 ${
                      check.passed ? "text-emerald-500 dark:text-emerald-400" : "text-slate-300 dark:text-slate-600"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{check.label}</span>
                </div>
                {check.timestamp && (
                  <span className="text-xs font-mono text-slate-600 dark:text-slate-400">{check.timestamp}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Audit Hash Copy */}
      <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
        <span className="font-mono truncate">Audit Reference: {auditHash}</span>
        <Button
          type="button"
          variant="outline"
          onClick={handleCopyHash}
          className="min-h-[44px] min-w-[44px] self-start sm:self-auto focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          aria-label="Copy audit reference hash"
        >
          <Copy className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
          {copied ? "Copied!" : "Copy Hash"}
        </Button>
      </div>
    </section>
  );
}
