"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { captureRouteError } from "@/lib/sentry";

// Route-segment error boundary. Next.js renders this in place of `page.tsx`
// when a render-time error escapes a Client/Server component below this
// segment. The surrounding `layout.tsx` (including the global Footer) keeps
// rendering, so users retain navigation and theming.
//
// `global-error.tsx` is the next line of defence — it fires only when the
// root layout itself throws and replaces the entire shell.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    captureRouteError(error, {
      pathname,
      digest: error.digest,
      boundary: "app/error.tsx",
    });
  }, [error, pathname]);

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-16 text-center"
    >
      <div className="rounded-full bg-destructive/10 p-3 mb-4">
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Something went wrong on this page.</h2>
      <p className="text-muted-foreground max-w-md mb-6">
        The error has been reported. You can try reloading this section, or
        head back to the home page.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/">Go home</Link>
        </Button>
      </div>
      {process.env.NODE_ENV !== "production" && (
        <details className="mt-8 text-left max-w-xl w-full">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Error details (development only)
          </summary>
          <pre className="mt-2 overflow-auto text-xs bg-muted p-3 rounded-md whitespace-pre-wrap break-words">
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
            {error.stack ? `\n\n${error.stack}` : ""}
          </pre>
        </details>
      )}
    </div>
  );
}
