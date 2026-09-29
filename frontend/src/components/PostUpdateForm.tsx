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
}

const MAX_CHARACTER_LIMIT = 280;

const DRAFT_KEY_PREFIX = "stellargive_update_draft_";

export const PostUpdateForm: React.FC<PostUpdateFormProps> = ({
  campaignId,
  onSuccess,
  addUpdateMutation,
  onSubmit,
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
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [content, campaignId]);

  const remainingCharacters = MAX_CHARACTER_LIMIT - content.length;
  const isOverLimit = content.length > MAX_CHARACTER_LIMIT;

  const handleContentChange = (value: string) => {
    const nextValue =
      value.length > MAX_CHARACTER_LIMIT ? value.slice(0, MAX_CHARACTER_LIMIT) : value;
    setContent(nextValue);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent || isOverLimit) return;

    setIsSubmitting(true);
    setError(null);

    if (onSubmit) {
      // Optimistic path: reset textarea immediately so the user sees instant feedback,
      // then let the parent handle the on-chain tx and rollback on failure.
      setContent("");
      try {
        await onSubmit(trimmedContent);
        try { localStorage.removeItem(`${DRAFT_KEY_PREFIX}${campaignId}`); } catch {}
        onSuccess();
      } catch (err: any) {
        // Restore the content so the user can retry without retyping.
        setContent(trimmedContent);
        console.error("Failed to submit update to Soroban:", err);
        setError(err?.message || "Transaction failed. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Fallback path (no optimistic handling in parent).
      try {
        await addUpdateMutation(campaignId, trimmedContent);
        setContent("");
        try { localStorage.removeItem(`${DRAFT_KEY_PREFIX}${campaignId}`); } catch {}
        onSuccess();
      } catch (err: any) {
        console.error("Failed to submit update to Soroban:", err);
        setError(err?.message || "Transaction failed. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm my-4">
      <h3 className="text-lg font-semibold mb-2">Post a Campaign Update</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <textarea
            className="w-full p-2 border rounded-md bg-background resize-none focus:ring-2 focus:ring-primary"
            rows={4}
            maxLength={MAX_CHARACTER_LIMIT}
            placeholder="Tell your backers what's happening..."
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            disabled={isSubmitting}
            aria-label="Campaign update content"
            aria-describedby="update-char-count"
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
          disabled={isSubmitting || !content.trim() || isOverLimit}
        >
          {isSubmitting ? "Submitting to Soroban..." : "Post Update"}
        </button>
      </form>
    </div>
  );
};
