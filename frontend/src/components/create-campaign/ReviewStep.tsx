"use client";

import { useFormContext } from "react-hook-form";
import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Campaign } from "@/lib/soroban";
import { ReviewPreviewToggle } from "./CampaignPreview";
import type { FormValues } from "./schema";

interface ReviewStepProps {
  active: boolean;
  tokenSymbol: string;
  resolvedBeneficiaryName?: string | null;
  /** Payout split in basis points; only shown as a list when there are several beneficiaries. */
  payoutSplit: { address: string; share: number }[];
  hasMultipleBeneficiaries: boolean;
  formatPercent: (bps: number) => string;
  tags: string[];
  previewCampaign: Campaign;
  showPreview: boolean;
  onTogglePreview: () => void;
}

/** Step 3: read-only summary of the campaign before launch. */
export function ReviewStep({
  active,
  tokenSymbol,
  resolvedBeneficiaryName,
  payoutSplit,
  hasMultipleBeneficiaries,
  formatPercent,
  tags,
  previewCampaign,
  showPreview,
  onTogglePreview,
}: ReviewStepProps) {
  const form = useFormContext<FormValues>();

  return (
    <div className={cn("space-y-4 text-sm", !active && "hidden")}>
      <div className="rounded-md bg-muted p-4 space-y-3">
        <div>
          <p className="text-muted-foreground text-xs">Title</p>
          <p className="font-medium">{form.watch("title") || "N/A"}</p>
        </div>
        {hasMultipleBeneficiaries ? (
          <div>
            <p className="text-muted-foreground text-xs">Beneficiaries</p>
            <ul className="space-y-1">
              {payoutSplit.map((b, i) => (
                <li key={i} className="flex items-start justify-between gap-3">
                  <span className="font-medium break-all">{b.address || "N/A"}</span>
                  <span className="font-medium tabular-nums shrink-0">
                    {formatPercent(b.share)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div>
            <p className="text-muted-foreground text-xs">Beneficiary</p>
            <p className="font-medium break-all">{form.watch("beneficiary") || "N/A"}</p>
            {resolvedBeneficiaryName && (
              <p className="text-xs text-muted-foreground">{resolvedBeneficiaryName}</p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-muted-foreground text-xs">Target</p>
            <p className="font-medium">
              {form.watch("targetAmount") || "0"} {tokenSymbol}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Duration</p>
            <p className="font-medium">{form.watch("deadlineDays") || "0"} Days</p>
          </div>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Maximum per donor</p>
          <p className="font-medium">
            {(form.watch("maxPerDonor") ?? "").trim()
              ? `${form.watch("maxPerDonor")} ${tokenSymbol}`
              : "No cap"}
          </p>
        </div>
        {tags.length > 0 && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">Tags</p>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-medium text-primary"
                >
                  <Tag className="h-2.5 w-2.5" aria-hidden="true" />
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <ReviewPreviewToggle
        campaign={previewCampaign}
        open={showPreview}
        onToggle={onTogglePreview}
      />
    </div>
  );
}
