"use client";

import * as React from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

type ThemeMode = "system" | "light" | "dark";

const OPTIONS: { value: ThemeMode; label: string; Icon: LucideIcon }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

function isThemeMode(value: string | undefined): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

/**
 * Three-way theme picker rendered as an ARIA radiogroup. next-themes persists
 * the explicit choice (including "system") to localStorage under `theme`.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // Avoid hydration mismatch: the stored theme is only known on the client.
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const current: ThemeMode = mounted && isThemeMode(theme) ? theme : "system";

  const select = (index: number) => {
    const option = OPTIONS[index];
    setTheme(option.value);
    buttonRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = OPTIONS.length - 1;
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = index === 0 ? last : index - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    select(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }, index) => {
        const checked = mounted && current === value;
        return (
          <button
            key={value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            disabled={!mounted}
            // Roving tabindex: only the selected option is in the tab order.
            tabIndex={current === value ? 0 : -1}
            onClick={() => setTheme(value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:pointer-events-none",
              checked && "bg-background text-foreground shadow-sm",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
