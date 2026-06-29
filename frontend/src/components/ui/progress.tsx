"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

type ProgressVariant = "default" | "success" | "warning";

const indicatorVariants: Record<ProgressVariant, string> = {
  default: "bg-primary",
  success: "bg-emerald-600 dark:bg-emerald-400",
  warning: "bg-amber-500 dark:bg-amber-400",
};

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    indicatorClassName?: string;
    variant?: ProgressVariant;
  }
>(({ className, value, indicatorClassName, variant = "default", ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-4 w-full overflow-hidden rounded-full bg-secondary dark:bg-secondary/60",
      className,
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn(
        "h-full w-full flex-1 transition-all",
        indicatorVariants[variant],
        indicatorClassName,
      )}
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
export type { ProgressVariant };
