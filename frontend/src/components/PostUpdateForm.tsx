// frontend/src/components/PostUpdateForm.tsx

import React, { useState, useEffect, useRef } from "react";

interface PostUpdateFormProps {
  campaignId: string;
  onSuccess: () => void;
  addUpdateMutation: (id: string, content: string) => Promise<void>;
  /**
   * When provided, the parent handles optimistic prepend + rollback.
   * The form resets the textarea immediately after calling this (optimistic),
   * before on-chain confirmation, so the UI feels instant.
   */
  onSubmit?: (content: string) => Promise<void> | void;
  /**
   * Updates the campaign already has. When known, the form shows how many of
   * the contract's MAX_CAMPAIGN_UPDATES are used and locks at the limit.
   */
  updateCount?: number;
}

const MAX_CHARACTER_LIMIT = 280;

/** Mirrors the cap in the contract's `add_update`; the 11th fails with `TooManyUpdates`. */
export const MAX_CAMPAIGN_UPDATES = 10;

const DRAFT_KEY_PREFIX = "stellargive_update_draft_";

export const PostUpdateForm: React.FC<PostUpdateFormProps> = ({
  campaignId,
  onSuccess,
  addUpdateMutation,
  onSubmit,
  updateCount,
}) => {
  const [content, setContent] = useState(() => {
    try {
      return localStorage.getItem(`${DRAFT_KEY_PREFIX}${campaignId}`) || "";
    } catch {
      return "";
    }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!content.trim()) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(`${DRAFT_KEY_PREFIX}${campaignId}`, content);
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      } catch {}
    }, 1000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [content, campaignId]);

  const remainingCharacters = MAX_CHARACTER_LIMIT - content.length;
  const isOverLimit = content.length > MAX_CHARACTER_LIMIT;
  const atUpdateLimit = updateCount !== undefined && updateCount >= MAX_CAMPAIGN_UPDATES;

  const handleContentChange = (value: string) => {
    const nextValue =
      value.length > MAX_CHARACTER_LIMIT ? value.slice(0, MAX_CHARACTER_LIMIT) : value;
    setContent(nextValue);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent || isOverLimit || atUpdateLimit) return;

    setIsSubmitting(true);
    setError(null);

    if (onSubmit) {
      // Optimistic path: reset textarea immediately so the user sees instant feedback,
      // then let the parent handle the on-chain tx and rollback on failure.
      setContent("");
      try {
        await onSubmit(trimmedContent);
        try {
          localStorage.removeItem(`${DRAFT_KEY_PREFIX}${campaignId}`);
        } catch {}
        onSuccess();
      } catch (err: unknown) {
        // Restore the content so the user can retry without retyping.
        setContent(trimmedContent);
        console.error("Failed to submit update to Soroban:", err);
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message: unknown }).message)
              : "Transaction failed. Please try again.";
        setError(msg);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Fallback path (no optimistic handling in parent).
      try {
        await addUpdateMutation(campaignId, trimmedContent);
        setContent("");
        try {
          localStorage.removeItem(`${DRAFT_KEY_PREFIX}${campaignId}`);
        } catch {}
        onSuccess();
      } catch (err: unknown) {
        console.error("Failed to submit update to Soroban:", err);
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message: unknown }).message)
              : "Transaction failed. Please try again.";
        setError(msg);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm my-4">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-lg font-semibold">Post a Campaign Update</h3>
        {updateCount !== undefined && (
          <span
            className={`text-sm ${atUpdateLimit ? "text-destructive font-medium" : "text-muted-foreground"}`}
            data-testid="update-count"
          >
            {Math.min(updateCount, MAX_CAMPAIGN_UPDATES)} of {MAX_CAMPAIGN_UPDATES} updates used
          </span>
        )}
      </div>
      {atUpdateLimit && (
        <p className="text-sm text-muted-foreground mb-3" role="status" id="update-limit-reached">
          This campaign has reached the limit of {MAX_CAMPAIGN_UPDATES} updates allowed by the
          contract, so no more updates can be posted.
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <textarea
            className="w-full p-2 border rounded-md bg-background resize-none focus:ring-2 focus:ring-primary"
            rows={4}
            maxLength={MAX_CHARACTER_LIMIT}
            placeholder="Tell your backers what's happening..."
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            disabled={isSubmitting || atUpdateLimit}
            aria-label="Campaign update content"
            aria-describedby={
              atUpdateLimit ? "update-char-count update-limit-reached" : "update-char-count"
            }
          />
          <div className="flex justify-between items-center mt-1 text-sm gap-2">
            <span
              id="update-char-count"
              className={isOverLimit ? "text-destructive font-medium" : "text-muted-foreground"}
              aria-live="polite"
            >
              {isOverLimit
                ? "0 characters remaining"
                : `${remainingCharacters} characters remaining`}
            </span>
            {draftSaved && (
              <span className="text-xs text-muted-foreground italic">Draft saved</span>
            )}
            {error && (
              <span className="text-destructive font-medium" role="alert" aria-live="assertive">
                {error}
              </span>
            )}
          </div>
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50"
          disabled={isSubmitting || !content.trim() || isOverLimit || atUpdateLimit}
        >
          {isSubmitting ? "Submitting to Soroban..." : "Post Update"}
        </button>
      </form>
    </div>
  );
};
