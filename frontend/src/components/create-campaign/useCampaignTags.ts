import { useState } from "react";
import { MAX_TAG_COUNT, MAX_TAG_LENGTH } from "./schema";

/** Tag chips state for the Details step (#848). Tags are client-side only. */
export function useCampaignTags() {
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagError, setTagError] = useState("");

  function commitTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (!tag) return;
    if (tags.length >= MAX_TAG_COUNT) {
      setTagError(`Maximum ${MAX_TAG_COUNT} tags allowed.`);
      return;
    }
    if (tag.length > MAX_TAG_LENGTH) {
      setTagError(`Tag must be ${MAX_TAG_LENGTH} characters or fewer.`);
      return;
    }
    if (tags.includes(tag)) {
      setTagError("Tag already added.");
      return;
    }
    setTags((prev) => [...prev, tag]);
    setTagInput("");
    setTagError("");
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
    setTagError("");
  }

  function reset() {
    setTags([]);
    setTagInput("");
  }

  return {
    tags,
    setTags,
    tagInput,
    setTagInput,
    tagError,
    setTagError,
    commitTag,
    removeTag,
    reset,
  };
}

export type CampaignTagsState = ReturnType<typeof useCampaignTags>;
