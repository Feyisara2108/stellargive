import { render as rtlRender, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";

export * from "@testing-library/react";

/**
 * Drop-in replacement for Testing Library's `render` that supplies a fresh
 * QueryClient, for components (e.g. CampaignCard's prefetching) that call
 * useQueryClient() even when their data hooks are mocked.
 */
export function render(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return rtlRender(ui, { wrapper: Wrapper, ...options });
}
