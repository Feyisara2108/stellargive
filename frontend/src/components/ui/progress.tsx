"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    indicatorClassName?: string;
    showValueLabel?: boolean;
  }
>(({ className, value, indicatorClassName, showValueLabel, ...props }, ref) => {
  const progress = (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn("h-full w-full flex-1 bg-primary transition-all", indicatorClassName)}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );

  if (showValueLabel) {
    return (
      <div className="w-full">
        {progress}
        <div className="text-xs font-medium text-right mt-1 text-muted-foreground">
          {Math.round(value || 0)}%
        </div>
      </div>
    );
  }

  return progress;
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
