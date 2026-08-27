import React, { useState } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { useQuery } from "@tanstack/react-query";

interface UIModuleProps {
  fetchData?: () => Promise<{ message: string }>;
}

export const UIModule59 = ({ fetchData }: UIModuleProps = {}) => {
  const { isConnected, address } = useWallet();
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [clicked, setClicked] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["module59Data"],
    queryFn:
      fetchData ||
      (async () => {
        return { message: "Hello from query 59" };
      }),
  });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] p-6 text-center">
        <p className="text-red-600 dark:text-red-400 mb-4" role="alert">
          Something went wrong loading this module.
        </p>
        <button
          data-testid="mod59-retry"
          onClick={() => refetch()}
          className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 w-full max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Module 59</h1>
      {isConnected ? (
        <p className="text-sm text-gray-700 dark:text-gray-300 break-all">Connected as {address}</p>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">Not connected</p>
      )}

      {isLoading ? (
        <div className="space-y-2 animate-pulse" role="status" aria-label="Loading">
          <span className="sr-only">Loading...</span>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
        </div>
      ) : (
        <p className="text-sm text-gray-700 dark:text-gray-300">{data?.message}</p>
      )}

      <input
        data-testid="mod59-input"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        aria-label="Module 59 input"
        className="min-h-[44px] w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
      />
      {isFocused && (
        <span className="text-xs text-gray-500 dark:text-gray-400">Input is focused</span>
      )}

      {!isLoading && !data?.message && (
        <p className="text-sm text-gray-500 dark:text-gray-400" role="status">
          No data available.
        </p>
      )}

      <button
        data-testid="mod59-button"
        onClick={() => setClicked(true)}
        className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        Click Me 59
      </button>
      {clicked && (
        <span className="text-sm text-green-600 dark:text-green-400">Button was clicked</span>
      )}
    </div>
  );
};
