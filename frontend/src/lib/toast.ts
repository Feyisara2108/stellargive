"use client";

import { toast } from "sonner";

/**
 * Standardized notification helper wrapping sonner toast.
 * Provides loading, success, and error states with consistent copy
 * and explorer action handling.
 */

export const notify = {
  /**
   * Show a loading toast that can be updated in place.
   * @param message - Loading message (default: "Submitting transaction...")
   * @returns Toast ID for updating
   */
  loading: (message = "Submitting transaction..."): string | number => {
    return toast.loading(message);
  },

  /**
   * Show a success toast with optional explorer link.
   * @param message - Success message
   * @param options - Optional config including toastId for updating in place
   */
  success: (message: string, options?: { id?: string | number; hash?: string }): void => {
    const action = options?.hash
      ? {
          label: "View Explorer",
          onClick: () =>
            window.open(`https://stellar.expert/explorer/testnet/tx/${options.hash}`, "_blank"),
        }
      : undefined;

    if (options?.id) {
      toast.success(message, { id: options.id, action });
    } else {
      toast.success(message, { action });
    }
  },

  /**
   * Show an error toast.
   * @param message - Error message
   * @param options - Optional config including toastId for updating in place
   */
  error: (message: string, options?: { id?: string | number }): void => {
    if (options?.id) {
      toast.error(message, { id: options.id });
    } else {
      toast.error(message);
    }
  },
};

/**
 * Generate a standardized explorer action for transaction hash.
 * @param hash - Transaction hash
 * @returns Action object for sonner toast
 */
export function txAction(hash: string) {
  return {
    label: "View Explorer",
    onClick: () => window.open(`https://stellar.expert/explorer/testnet/tx/${hash}`, "_blank"),
  };
}
