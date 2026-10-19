"use client";

import { useFormContext } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ImageUploadField } from "./ImageUploadField";
import { TagsInput } from "./TagsInput";
import { MAX_DESCRIPTION_LEN, MAX_TITLE_LEN, type FormValues } from "./schema";
import type { CampaignTagsState } from "./useCampaignTags";
import type { ImageUploadState } from "./useImageUpload";

interface DetailsStepProps {
  active: boolean;
  disabled?: boolean;
  tags: CampaignTagsState;
  upload: ImageUploadState;
}

/** Step 1: title, description, category, tags, cover image and social links. */
export function DetailsStep({ active, disabled, tags, upload }: DetailsStepProps) {
  const form = useFormContext<FormValues>();
  const titleLen = (form.watch("title") ?? "").length;

  return (
    <div className={cn("space-y-4", !active && "hidden")}>
      <FormField
        control={form.control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel>Campaign Title</FormLabel>
              <span
                aria-live="polite"
                className={cn(
                  "text-xs tabular-nums",
                  titleLen > MAX_TITLE_LEN ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {titleLen}/{MAX_TITLE_LEN}
              </span>
            </div>
            <FormControl>
              <Input
                placeholder="Flood Relief 2024"
                maxLength={MAX_TITLE_LEN}
                {...field}
                disabled={disabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="description"
        render={({ field }) => {
          const descValue = field.value ?? "";
          const descLength = descValue.length;
          const remaining = MAX_DESCRIPTION_LEN - descLength;
          const isWarning = remaining < 20 && descLength <= MAX_DESCRIPTION_LEN;
          const isOverLimit = descLength > MAX_DESCRIPTION_LEN;

          return (
            <FormItem>
              <FormLabel>Campaign Description</FormLabel>
              <FormControl>
                <textarea
                  placeholder="Provide a detailed description of the campaign..."
                  rows={3}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  {...field}
                  disabled={disabled}
                />
              </FormControl>
              <div className="flex items-center justify-between text-xs">
                <FormMessage />
                <span
                  aria-live="polite"
                  className={cn(
                    "tabular-nums transition-colors ml-auto",
                    isOverLimit
                      ? "text-destructive font-semibold"
                      : isWarning
                        ? "text-amber-600 dark:text-amber-400 font-medium"
                        : "text-muted-foreground",
                  )}
                >
                  {descLength} / {MAX_DESCRIPTION_LEN} characters
                </span>
              </div>
            </FormItem>
          );
        }}
      />
      <FormField
        control={form.control}
        name="category"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Category (Optional)</FormLabel>
            <FormControl>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...field}
                disabled={disabled}
              >
                <option value="">Select Category</option>
                <option value="medical">Medical</option>
                <option value="food">Food</option>
                <option value="shelter">Shelter</option>
                <option value="education">Education</option>
                <option value="relief">Relief</option>
                <option value="other">Other</option>
              </select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <TagsInput state={tags} disabled={disabled} />

      <ImageUploadField upload={upload} disabled={disabled} />

      <FormField
        control={form.control}
        name="website"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Website (Optional)</FormLabel>
            <FormControl>
              <Input placeholder="https://myrelief.org" {...field} disabled={disabled} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="twitter"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Twitter Link (Optional)</FormLabel>
            <FormControl>
              <Input placeholder="https://twitter.com/mycampaign" {...field} disabled={disabled} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
