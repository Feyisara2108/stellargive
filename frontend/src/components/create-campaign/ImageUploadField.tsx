"use client";

import { useId } from "react";
import { useFormContext } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
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

interface UploadFileInputProps {
  errorId: string;
  hasUploadError: boolean;
  disabled: boolean;
  onFileSelected: (file: File | null) => void;
}

/**
 * The file input, rendered inside <FormItem> so it can read the field's description/message ids
 * and append the upload error's id to `aria-describedby` (FormControl's own value is overridden by
 * the child's props).
 */
function UploadFileInput({
  errorId,
  hasUploadError,
  disabled,
  onFileSelected,
}: UploadFileInputProps) {
  const { error, formDescriptionId, formMessageId } = useFormField();
  const describedBy = [
    formDescriptionId,
    error ? formMessageId : null,
    hasUploadError ? errorId : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <FormControl>
      <Input
        type="file"
        accept="image/png,image/jpeg"
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={hasUploadError || !!error}
        onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)}
      />
    </FormControl>
  );
}

/** Optional cover image, uploaded to IPFS and stored as the `metadataUri` field. */
export function ImageUploadField({ upload, disabled }: ImageUploadFieldProps) {
  const form = useFormContext<FormValues>();
  const { selectedFileName, uploadError, isUploadingImage, uploadProgress, onImageSelected } =
    upload;
  const metadataUri = form.watch("metadataUri") ?? "";
  const metadataUriLen = metadataUri.length;
  const errorId = useId();

  // One polite live region announces start and completion only (not every % tick).
  const statusMessage = isUploadingImage
    ? "Uploading image"
    : selectedFileName && metadataUri && !uploadError
      ? "Image uploaded"
      : "";

  return (
    <FormField
      control={form.control}
      name="metadataUri"
      render={() => (
        <FormItem>
          <FormLabel>Campaign Cover Image (Optional)</FormLabel>
          <UploadFileInput
            errorId={errorId}
            hasUploadError={!!uploadError}
            disabled={!!disabled || isUploadingImage}
            onFileSelected={(file) => void onImageSelected(file)}
          />
          <FormDescription>
            Upload PNG/JPG image up to 5MB. This will be stored on IPFS.
          </FormDescription>
          <p role="status" aria-live="polite" className="sr-only">
            {statusMessage}
          </p>
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
              <p className="text-xs text-muted-foreground break-all">Uploaded to: {metadataUri}</p>
              <span
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
          {!!uploadError && (
            <p id={errorId} role="alert" className="text-xs text-destructive">
              {uploadError}
            </p>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
