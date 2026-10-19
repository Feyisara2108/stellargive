import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { FormValues } from "./schema";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Uploads the cover image to IPFS via /api/ipfs-upload and writes the returned
 * `ipfs://` URI into the form's `metadataUri` field.
 */
export function useImageUpload(form: UseFormReturn<FormValues>) {
  const [selectedFileName, setSelectedFileName] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  async function uploadImage(file: File) {
    setUploadError("");
    setIsUploadingImage(true);
    setUploadProgress(0);

    const data = new FormData();
    data.append("file", file);

    const response = await new Promise<{ metadata_uri: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/ipfs-upload");

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        }
      };

      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error("Upload failed. Please try again."));
          return;
        }
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Unexpected upload response."));
        }
      };

      xhr.onerror = () => reject(new Error("Network error while uploading image."));
      xhr.send(data);
    });

    form.setValue("metadataUri", response.metadata_uri, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setUploadProgress(100);
    setIsUploadingImage(false);
  }

  async function onImageSelected(file: File | null) {
    setUploadError("");
    if (!file) {
      setSelectedFileName("");
      form.setValue("metadataUri", "");
      return;
    }
    const isImage =
      file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/jpg";
    if (!isImage) {
      setUploadError("Only PNG or JPG images are allowed.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError("Image must be 5MB or less.");
      return;
    }
    setSelectedFileName(file.name);
    try {
      await uploadImage(file);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to upload image.";
      setUploadError(message);
      form.setValue("metadataUri", "", { shouldValidate: true, shouldDirty: true });
      setIsUploadingImage(false);
      setUploadProgress(0);
    }
  }

  function reset() {
    setSelectedFileName("");
    setUploadError("");
    setUploadProgress(0);
    setIsUploadingImage(false);
  }

  return {
    selectedFileName,
    uploadError,
    isUploadingImage,
    uploadProgress,
    onImageSelected,
    reset,
  };
}

export type ImageUploadState = ReturnType<typeof useImageUpload>;
