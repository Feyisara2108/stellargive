"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

interface Props {
  children: React.ReactNode;
  /** Optional heading shown above the default message. */
  heading?: string;
  /** Optional fallback UI; overrides the default error card entirely. */
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Class-based React error boundary that catches rendering errors thrown by its
 * subtree and shows a friendly "Something went wrong" card with a retry button.
 *
 * Use this to wrap individual sections (e.g. a data-heavy sidebar or a
 * dynamically-imported panel) so a single crash doesn't blank out the whole page.
 *
 * For route-level crashes, Next.js `app/error.tsx` fires automatically — this
 * component is for finer-grained, intra-page containment.
 *
 * @example
 * <ErrorBoundary heading="Activity feed">
 *   <ActivityFeed />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error("[ErrorBoundary] caught error:", error, info.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const heading = this.props.heading
      ? `${this.props.heading} couldn't load`
      : "Something went wrong";

    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
      >
        <div className="rounded-full bg-destructive/10 p-3">
          <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-foreground">{heading}</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            An unexpected error occurred in this section. You can try again or go back to explore
            campaigns.
          </p>
        </div>
        {process.env.NODE_ENV !== "production" && this.state.error && (
          <details className="text-left max-w-md w-full">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Error details (dev only)
            </summary>
            <pre className="mt-2 overflow-auto text-xs bg-muted p-3 rounded-md whitespace-pre-wrap break-words">
              {this.state.error.message}
              {this.state.error.stack ? `\n\n${this.state.error.stack}` : ""}
            </pre>
          </details>
        )}
        <div className="flex gap-3">
          <Button size="sm" onClick={this.reset}>
            <RotateCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/explore">Browse campaigns</Link>
          </Button>
        </div>
      </div>
    );
  }
}
