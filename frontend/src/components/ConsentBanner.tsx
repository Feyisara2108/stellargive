"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const CONSENT_KEY = "stellargive_analytics_consent";

export function ConsentBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (consent === null) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setIsVisible(false);
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const handleDecline = () => {
    localStorage.setItem(CONSENT_KEY, "declined");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg"
      role="dialog"
      aria-labelledby="consent-title"
      aria-describedby="consent-description"
    >
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <h3 id="consent-title" className="text-sm font-semibold mb-1">
              Cookie & Analytics Consent
            </h3>
            <p id="consent-description" className="text-sm text-muted-foreground">
              We use cookies and analytics to improve your experience and monitor application
              performance. Your choice will be saved for future visits.
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDecline}
              className="flex-1 sm:flex-none"
            >
              Decline
            </Button>
            <Button size="sm" onClick={handleAccept} className="flex-1 sm:flex-none">
              Accept
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDecline}
              aria-label="Close consent banner"
              className="shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function getAnalyticsConsent(): "accepted" | "declined" | null {
  if (typeof window === "undefined") return null;
  const consent = localStorage.getItem(CONSENT_KEY);
  if (consent === "accepted") return "accepted";
  if (consent === "declined") return "declined";
  return null;
}
