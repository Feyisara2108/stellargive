"use client";

import React from "react";
import { Button } from "@/components/ui/button";

export function StickyDonateBar({ onOpen, disabled }: { onOpen: () => void; disabled?: boolean }) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
      <div
        className="max-w-4xl mx-auto p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">Support this campaign</div>
          <Button onClick={onOpen} disabled={disabled} className="ml-2">
            Donate
          </Button>
        </div>
      </div>
    </div>
  );
}
