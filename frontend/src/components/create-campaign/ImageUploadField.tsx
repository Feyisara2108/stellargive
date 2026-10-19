"use client";

import { useFormContext } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { MAX_METADATA_URI_LEN, type FormValues } from "./schema";
import type { ImageUploadState } from "./useImageUpload";

interface ImageUploadFieldProps {
  upload: ImageUploadState;
  disabled?: boolean;
}

/** Optional cover image, uploaded to IPFS and stored as the `metadataUri` field. */
export function ImageUploadField({ upload, disabled }: ImageUploadFieldProps) {
  const form = useFormContext<FormValues>();
  const { selectedFileName, uploadError, isUploadingImage, uploadProgress, onImageSelected } =
    upload;
  const metadataUri = form.watch("metadataUri") ?? "";
  const metadataUriLen = metadataUri.length;

  return (
    <FormField
      control={form.control}
      name="metadataUri"
      render={() => (
        <FormItem>
          <FormLabel>Campaign Cover Image (Optional)</FormLabel>
          <FormControl>
            <Input
              type="file"
              accept="image/png,image/jpeg"
              disabled={disabled || isUploadingImage}
              onChange={(event) => void onImageSelected(event.target.files?.[0] ?? null)}
            />
          </FormControl>
          <FormDescription>
            Upload PNG/JPG image up to 5MB. This will be stored on IPFS.
          </FormDescription>
          {isUploadingImage && (
            <div className="space-y-1">
              <Progress value={uploadProgress} aria-label="Image upload progress" />
              <p className="text-xs text-muted-foreground">Uploading... {uploadProgress}%</p>
            </div>
          )}
          {selectedFileName && !uploadError && (
            <p className="text-xs text-muted-foreground">Selected: {selectedFileName}</p>
          )}
          {!!metadataUri && !uploadError && (
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground break-all">CID: {metadataUri}</p>
              <span
                aria-live="polite"
                className={cn(
                  "text-xs tabular-nums shrink-0",
                  metadataUriLen > MAX_METADATA_URI_LEN
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {metadataUriLen}/{MAX_METADATA_URI_LEN}
              </span>
            </div>
          )}
          {!!uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
