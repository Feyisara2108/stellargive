import { useEffect } from "react";
import type { Path, UseFormReturn } from "react-hook-form";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { FormValues } from "./schema";

export const DRAFT_STORAGE_KEY = "create_campaign_draft";

export function clearCampaignDraft() {
  sessionStorage.removeItem(DRAFT_STORAGE_KEY);
}

/**
 * Persists the in-progress campaign (minus the beneficiary) to sessionStorage
 * and restores it on mount, so a refresh or accidental close keeps the draft.
 */
export function useCampaignDraft(
  form: UseFormReturn<FormValues>,
  tags: string[],
  setTags: (tags: string[]) => void,
) {
  // Restore draft from sessionStorage and trigger validation once on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        Object.entries(draft).forEach(([key, val]) => {
          if (key === "tags" && Array.isArray(val)) {
            setTags(val as string[]);
          } else if (val !== undefined && key !== "tags") {
            form.setValue(key as Path<FormValues>, val as string, { shouldDirty: true });
          }
        });
      } catch (e) {
        console.error("Failed to restore campaign draft", e);
      }
    }
    void form.trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save form draft to sessionStorage as user types
  const formValues = form.watch();
  const debouncedValues = useDebouncedValue(formValues, 500);

  const isDirty = form.formState.isDirty;

  useEffect(() => {
    // Only persist real edits. Without this, the debounced save re-writes the
    // blank form right after a successful submit clears the draft.
    if (!isDirty && tags.length === 0) {
      clearCampaignDraft();
      return;
    }
    const { beneficiary, ...draftToSave } = debouncedValues;
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...draftToSave, tags }));
  }, [debouncedValues, tags, isDirty]);

  return formValues;
}
