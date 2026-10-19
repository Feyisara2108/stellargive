"use client";

import { useRef } from "react";
import { Tag, X } from "lucide-react";
import { FormItem, FormLabel } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { MAX_TAG_COUNT, MAX_TAG_LENGTH } from "./schema";
import type { CampaignTagsState } from "./useCampaignTags";

interface TagsInputProps {
  state: CampaignTagsState;
  disabled?: boolean;
}

/** Tags input (#848): chips with Enter/comma to add and Backspace to remove. */
export function TagsInput({ state, disabled }: TagsInputProps) {
  const { tags, tagInput, setTagInput, tagError, setTagError, commitTag, removeTag } = state;
  const tagInputRef = useRef<HTMLInputElement>(null);

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <FormItem>
      <FormLabel htmlFor="campaign-tags-input">
        Tags{" "}
        <span className="text-muted-foreground font-normal text-xs">
          (Optional · up to {MAX_TAG_COUNT})
        </span>
      </FormLabel>
      <div
        className={cn(
          "flex flex-wrap gap-1.5 min-h-[42px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          disabled && "opacity-50 cursor-not-allowed",
        )}
        onClick={() => tagInputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-medium text-primary"
          >
            <Tag className="h-2.5 w-2.5" aria-hidden="true" />
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5 transition-colors"
              disabled={disabled}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          id="campaign-tags-input"
          ref={tagInputRef}
          type="text"
          value={tagInput}
          onChange={(e) => {
            setTagError("");
            setTagInput(e.target.value);
          }}
          onKeyDown={handleTagKeyDown}
          onBlur={() => {
            if (tagInput.trim()) commitTag(tagInput);
          }}
          placeholder={tags.length === 0 ? "Type a tag and press Enter or comma…" : ""}
          disabled={disabled || tags.length >= MAX_TAG_COUNT}
          className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground text-sm disabled:cursor-not-allowed"
          aria-describedby={tagError ? "campaign-tags-error" : "campaign-tags-hint"}
        />
      </div>
      {tagError ? (
        <p id="campaign-tags-error" className="text-xs text-destructive mt-1" role="alert">
          {tagError}
        </p>
      ) : (
        <p id="campaign-tags-hint" className="text-xs text-muted-foreground mt-1">
          Press <kbd className="rounded border px-1 py-0.5 text-[10px] font-mono">Enter</kbd> or{" "}
          <kbd className="rounded border px-1 py-0.5 text-[10px] font-mono">,</kbd> to add · max{" "}
          {MAX_TAG_LENGTH} chars per tag · {MAX_TAG_COUNT - tags.length} remaining
        </p>
      )}
    </FormItem>
  );
}
