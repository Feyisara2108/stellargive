"use client";

import { Eye } from "lucide-react";
import { CampaignCard } from "@/components/CampaignCard";
import type { Campaign } from "@/lib/soroban";

interface PreviewToggleProps {
  campaign: Campaign;
  open: boolean;
  onToggle: () => void;
}

/** Review-step preview toggle (#847) for mobile / quick review. */
export function ReviewPreviewToggle({ campaign, open, onToggle }: PreviewToggleProps) {
  return (
    <div className="lg:hidden space-y-3 pt-2">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        aria-expanded={open}
        aria-controls="campaign-preview-panel"
      >
        <Eye className="h-4 w-4" aria-hidden="true" />
        {open ? "Hide preview" : "Show card preview"}
      </button>
      {open && (
        <div
          id="campaign-preview-panel"
          aria-label="Live campaign card preview"
          className="max-w-sm"
        >
          <p className="text-xs text-muted-foreground mb-2">
            This is how your campaign card will look to donors.
          </p>
          <div inert aria-hidden="true">
            <CampaignCard campaign={campaign} isPreview />
          </div>
        </div>
      )}
    </div>
  );
}

/** Mobile preview toggle for steps 1 & 2 (#847). */
export function MobileLivePreview({ campaign, open, onToggle }: PreviewToggleProps) {
  return (
    <div className="lg:hidden pt-2 border-t">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
        aria-expanded={open}
        aria-controls="mobile-live-preview"
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        {open ? "Hide card preview" : "Show live card preview"}
      </button>
      {open && (
        <div
          id="mobile-live-preview"
          aria-label="Live campaign card preview"
          className="mt-3 max-w-[340px] mx-auto border rounded-xl p-3 bg-muted/20"
        >
          <p className="text-[11px] text-muted-foreground mb-2">
            Live preview reflects current form input in real time.
          </p>
          <div inert aria-hidden="true">
            <CampaignCard campaign={campaign} isPreview />
          </div>
        </div>
      )}
    </div>
  );
}

/** Desktop live preview (#847): persistent alongside the form across all steps. */
export function DesktopLivePreview({ campaign }: { campaign: Campaign }) {
  return (
    <aside
      className="hidden lg:flex flex-col space-y-2 sticky top-0"
      aria-labelledby="desktop-live-preview-heading"
    >
      <div className="flex items-center justify-between">
        <h2
          id="desktop-live-preview-heading"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
        >
          <Eye className="w-3.5 h-3.5 text-primary" aria-hidden="true" /> Live Card Preview
        </h2>
        <span className="text-[10px] text-muted-foreground">Updates live</span>
      </div>
      <div
        className="w-full max-w-[340px] border rounded-xl p-3 bg-muted/20 shadow-sm"
        inert
        aria-hidden="true"
      >
        <CampaignCard campaign={campaign} isPreview />
      </div>
    </aside>
  );
}
