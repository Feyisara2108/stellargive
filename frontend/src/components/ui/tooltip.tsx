"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TooltipContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerId: string;
  contentId: string;
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

function useTooltipContext(component: string): TooltipContextValue {
  const ctx = React.useContext(TooltipContext);
  if (!ctx) throw new Error(`<${component}> must be rendered inside <Tooltip>.`);
  return ctx;
}

// ---------------------------------------------------------------------------
// TooltipProvider
//
// Optional wrapper that sets a shared `delayDuration` for all descendant
// tooltips — matches the Radix API so the call-site shape is compatible if
// the project later migrates to @radix-ui/react-tooltip.
// ---------------------------------------------------------------------------

export interface TooltipProviderProps {
  /** Delay in ms before tooltip opens on hover. Default: 300. */
  delayDuration?: number;
  children: React.ReactNode;
}

const TooltipDelayContext = React.createContext<number>(300);

export function TooltipProvider({ delayDuration = 300, children }: TooltipProviderProps) {
  return (
    <TooltipDelayContext.Provider value={delayDuration}>{children}</TooltipDelayContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Tooltip (root)
// ---------------------------------------------------------------------------

export interface TooltipProps {
  /** Controlled open state. */
  open?: boolean;
  /** Callback when open state changes. */
  onOpenChange?: (open: boolean) => void;
  /** Delay in ms before tooltip opens on hover. Overrides TooltipProvider. */
  delayDuration?: number;
  children: React.ReactNode;
}

export function Tooltip({ open: controlledOpen, onOpenChange, delayDuration, children }: TooltipProps) {
  const providerDelay = React.useContext(TooltipDelayContext);
  const delay = delayDuration ?? providerDelay;

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? !!controlledOpen : uncontrolledOpen;

  const openTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openTimerRef.current) {
        clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
      if (next) {
        // Delay opening so rapid mouse passes don't flash the tooltip.
        openTimerRef.current = setTimeout(() => {
          if (!isControlled) setUncontrolledOpen(true);
          onOpenChange?.(true);
        }, delay);
      } else {
        if (!isControlled) setUncontrolledOpen(false);
        onOpenChange?.(false);
      }
    },
    [delay, isControlled, onOpenChange],
  );

  // Clean up pending timer on unmount.
  React.useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
    };
  }, []);

  const baseId = React.useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-tooltip`;

  return (
    <TooltipContext.Provider value={{ open, setOpen, triggerId, contentId }}>
      {children}
    </TooltipContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// TooltipTrigger
//
// Wraps its child in a <span> so that pointer/focus events are captured even
// when the child is a disabled <button> (disabled elements don't fire events).
// The span is role="none" so it doesn't pollute the accessibility tree.
// ---------------------------------------------------------------------------

export interface TooltipTriggerProps {
  children: React.ReactNode;
  /** Extra class applied to the wrapper span. */
  className?: string;
  asChild?: boolean;
}

export const TooltipTrigger = React.forwardRef<HTMLSpanElement, TooltipTriggerProps>(
  ({ children, className }, ref) => {
    const { setOpen, contentId } = useTooltipContext("TooltipTrigger");

    return (
      <span
        ref={ref}
        role="none"
        // Inline-flex so the wrapper doesn't change the button's layout.
        className={cn("inline-flex", className)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        // Dismiss on Escape anywhere in the trigger area.
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        // Wire the child to the tooltip content via aria-describedby.
        // We clone the child to inject the attribute without breaking its ref.
        // If the child is not a valid React element we render it as-is.
      >
        {React.isValidElement(children)
          ? React.cloneElement(children as React.ReactElement<any>, {
              "aria-describedby": contentId,
            })
          : children}
      </span>
    );
  },
);
TooltipTrigger.displayName = "TooltipTrigger";

// ---------------------------------------------------------------------------
// TooltipContent
// ---------------------------------------------------------------------------

export type TooltipSide = "top" | "bottom" | "left" | "right";
export type TooltipAlign = "start" | "center" | "end";

export interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Which side of the trigger to render on. Default: "top". */
  side?: TooltipSide;
  /** Alignment along the cross axis. Default: "center". */
  align?: TooltipAlign;
  /** Gap between the trigger wrapper and the tooltip in px. Default: 6. */
  sideOffset?: number;
}

// Tailwind classes for each side + alignment combination.
const sideClasses: Record<TooltipSide, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
  left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
  right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
};

const alignOverrides: Partial<Record<TooltipSide, Record<TooltipAlign, string>>> = {
  top: {
    start: "bottom-full left-0 -translate-x-0 mb-1.5",
    center: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    end: "bottom-full right-0 translate-x-0 mb-1.5",
  },
  bottom: {
    start: "top-full left-0 -translate-x-0 mt-1.5",
    center: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    end: "top-full right-0 translate-x-0 mt-1.5",
  },
};

export const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ side = "top", align = "center", className, children, ...props }, ref) => {
    const { open, contentId } = useTooltipContext("TooltipContent");

    if (!open) return null;

    const positionClass =
      alignOverrides[side]?.[align] ?? sideClasses[side];

    return (
      <div
        ref={ref}
        id={contentId}
        role="tooltip"
        // animate-in / fade-in come from tailwindcss-animate, already installed.
        className={cn(
          "absolute z-50 w-max max-w-xs rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md",
          "animate-in fade-in-0 zoom-in-95 duration-150",
          positionClass,
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
TooltipContent.displayName = "TooltipContent";
