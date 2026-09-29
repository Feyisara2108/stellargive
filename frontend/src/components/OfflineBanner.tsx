"use client";

import React, { useState, useEffect } from "react";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { WifiOff, RefreshCw } from "lucide-react";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsOffline(!navigator.onLine);
    }

    const handleOffline = () => {
      setIsOffline(true);
      onlineManager.setOnline(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      onlineManager.setOnline(true);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const handleRetry = async () => {
    setIsRetrying(true);
    const online = typeof navigator !== "undefined" ? navigator.onLine : true;
    onlineManager.setOnline(online);
    if (online) {
      setIsOffline(false);
    }
    try {
      await queryClient.refetchQueries();
    } catch {
      // ignore
    } finally {
      setIsRetrying(false);
    }
  };

  if (!isOffline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
      className="fixed top-0 left-0 right-0 z-50 bg-amber-600 dark:bg-amber-700 text-white px-4 py-2.5 shadow-md transition-all animate-in fade-in slide-in-from-top-4 duration-300"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>You are currently offline. Background refetches are paused.</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRetry}
          disabled={isRetrying}
          className="h-8 text-xs font-semibold bg-white text-amber-900 hover:bg-amber-50 shrink-0 flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} />
          Retry
        </Button>
      </div>
    </div>
  );
}
