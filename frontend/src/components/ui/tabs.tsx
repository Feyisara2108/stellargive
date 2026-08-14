"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TabsContextValue {
  /** The value of the currently selected tab. */
  selected: string;
  /** Stable ID prefix used to derive tab/panel element IDs. */
  baseId: string;
  /** Callback fired when the user selects a tab. */
  onSelect: (value: string) => void;
  /** Ordered list of tab values, kept in sync by TabsTrigger registration. */
  values: React.MutableRefObject<string[]>;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const ctx = React.useContext(TabsContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside <Tabs>.`);
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Tabs (root)
// ---------------------------------------------------------------------------

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The value of the tab that should be selected by default (uncontrolled). */
  defaultValue: string;
  /** Controlled selected value. */
  value?: string;
  /** Callback when the selected tab changes. */
  onValueChange?: (value: string) => void;
}

/**
 * Root container that owns selection state and exposes it via context.
 * Renders a plain `<div>` so callers control layout freely.
 */
const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ defaultValue, value: controlledValue, onValueChange, className, children, ...props }, ref) => {
    const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
    const isControlled = controlledValue !== undefined;
    const selected = isControlled ? controlledValue : uncontrolled;

    // Stable base ID for aria wiring — safe for SSR because it is only used
    // for attribute strings, never rendered as visible text.
    const baseId = React.useId();

    // Ordered registry of tab values, populated by TabsTrigger on mount.
    const values = React.useRef<string[]>([]);

    const onSelect = React.useCallback(
      (value: string) => {
        if (!isControlled) setUncontrolled(value);
        onValueChange?.(value);
      },
      [isControlled, onValueChange],
    );

    return (
      <TabsContext.Provider value={{ selected, baseId, onSelect, values }}>
        <div ref={ref} className={cn("w-full", className)} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  },
);
Tabs.displayName = "Tabs";

// ---------------------------------------------------------------------------
// TabsList
// ---------------------------------------------------------------------------

export interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Accessible label for the tablist — required when there is no visible heading nearby. */
  "aria-label"?: string;
}

/**
 * The container for `<TabsTrigger>` elements.
 * Implements roving `tabIndex` and full keyboard navigation:
 * ArrowRight/ArrowLeft — move focus and activate next/previous tab
 * Home / End           — jump to first / last tab
 */
const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, children, ...props }, ref) => {
    const { values } = useTabsContext("TabsList");

    // Reset the registry on each render pass so stale entries from unmounted
    // triggers are cleared before children re-register themselves.
    values.current = [];

    return (
      <div
        ref={ref}
        role="tablist"
        className={cn("flex items-center border-b border-border", className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
TabsList.displayName = "TabsList";

// ---------------------------------------------------------------------------
// TabsTrigger
// ---------------------------------------------------------------------------

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Must match the `value` prop of the corresponding `<TabsContent>`. */
  value: string;
}

/**
 * A single tab button.  Registers itself into the ordered `values` registry so
 * `TabsList` can compute roving focus targets without needing an explicit config array.
 */
const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value, className, children, onClick, onKeyDown, ...props }, ref) => {
    const { selected, baseId, onSelect, values } = useTabsContext("TabsTrigger");

    const isSelected = selected === value;

    // Register this value into the ordered list on every render pass.
    // TabsList clears the array before each render, so the order naturally
    // mirrors DOM order.
    if (!values.current.includes(value)) {
      values.current.push(value);
    }

    // Resolve the DOM node for a given tab value so we can move focus.
    const getButtonForValue = (v: string): HTMLButtonElement | null => {
      const id = `${baseId}-tab-${v}`;
      return document.getElementById(id) as HTMLButtonElement | null;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const all = values.current;
      const currentIndex = all.indexOf(value);
      let nextValue: string | undefined;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          nextValue = all[(currentIndex + 1) % all.length];
          break;
        case "ArrowLeft":
          e.preventDefault();
          nextValue = all[(currentIndex - 1 + all.length) % all.length];
          break;
        case "Home":
          e.preventDefault();
          nextValue = all[0];
          break;
        case "End":
          e.preventDefault();
          nextValue = all[all.length - 1];
          break;
        default:
          break;
      }

      if (nextValue !== undefined) {
        onSelect(nextValue);
        getButtonForValue(nextValue)?.focus();
      }

      onKeyDown?.(e);
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onSelect(value);
      onClick?.(e);
    };

    return (
      <button
        ref={ref}
        id={`${baseId}-tab-${value}`}
        role="tab"
        aria-selected={isSelected}
        aria-controls={`${baseId}-panel-${value}`}
        // Roving tabIndex: only the selected tab is in the natural tab order.
        tabIndex={isSelected ? 0 : -1}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          // Base
          "relative pb-3 text-sm font-medium transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm",
          // Spacing between triggers — handled here rather than on the list so
          // callers do not need to know the internals.
          "mr-6 last:mr-0",
          // Active underline via a pseudo-element substitute using box-shadow
          // (avoids absolute positioning leaking outside overflow:hidden parents).
          isSelected
            ? "border-b-2 border-primary text-foreground -mb-px"
            : "text-muted-foreground hover:text-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
TabsTrigger.displayName = "TabsTrigger";

// ---------------------------------------------------------------------------
// TabsContent
// ---------------------------------------------------------------------------

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Must match the `value` prop of the corresponding `<TabsTrigger>`. */
  value: string;
}

/**
 * The panel that is shown when its `value` matches the selected tab.
 * Hidden panels are rendered but hidden with `hidden` so content (e.g. forms)
 * is not torn down when switching tabs.
 */
const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ value, className, children, ...props }, ref) => {
    const { selected, baseId } = useTabsContext("TabsContent");

    const isSelected = selected === value;

    return (
      <div
        ref={ref}
        id={`${baseId}-panel-${value}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${value}`}
        // Keep content mounted so stateful children (forms, lists) survive tab
        // switches.  Only visually (and for AT) hide inactive panels.
        hidden={!isSelected}
        tabIndex={0}
        className={cn("focus:outline-none", className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
TabsContent.displayName = "TabsContent";

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { Tabs, TabsList, TabsTrigger, TabsContent };
