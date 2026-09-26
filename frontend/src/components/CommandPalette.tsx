"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Command, Search, Home, PlusCircle, User, Compass, Wallet, Sun } from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  keywords: string[];
}

const navigationItems: CommandItem[] = [
  {
    id: "home",
    label: "Home",
    href: "/",
    icon: <Home className="w-4 h-4" />,
    keywords: ["home", "main", "landing"],
  },
  {
    id: "explore",
    label: "Explore Campaigns",
    href: "/explore",
    icon: <Compass className="w-4 h-4" />,
    keywords: ["explore", "browse", "campaigns", "discover"],
  },
  {
    id: "create",
    label: "Create Campaign",
    href: "/create",
    icon: <PlusCircle className="w-4 h-4" />,
    keywords: ["create", "new", "campaign", "start"],
  },
  {
    id: "profile",
    label: "Profile",
    href: "/profile",
    icon: <User className="w-4 h-4" />,
    keywords: ["profile", "account", "user", "my campaigns"],
  },
];

const RECENT_CAMPAIGNS_KEY = "stellargive_recent_campaigns";

function getRecentCampaigns(): { id: string; title: string }[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_CAMPAIGNS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function trackRecentCampaign(id: string, title: string) {
  try {
    const recent = getRecentCampaigns().filter((c) => c.id !== id);
    recent.unshift({ id, title });
    localStorage.setItem(RECENT_CAMPAIGNS_KEY, JSON.stringify(recent.slice(0, 5)));
  } catch {}
}

interface CommandPaletteProps {
  /** Allow a parent (e.g. Navbar) to control the open state externally. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CommandPalette({ open: openProp, onOpenChange }: CommandPaletteProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const setOpen = useCallback(
    (value: boolean) => {
      if (isControlled) {
        onOpenChange?.(value);
      } else {
        setInternalOpen(value);
      }
    },
    [isControlled, onOpenChange],
  );

  const [search, setSearch] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [recentCampaigns, setRecentCampaigns] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    if (open) setRecentCampaigns(getRecentCampaigns());
  }, [open]);

  const quickActions: CommandItem[] = useMemo(() => [
    { id: "connect-wallet", label: "Connect Wallet", href: "#connect-wallet", icon: <Wallet className="w-4 h-4" />, keywords: ["connect", "wallet", "stellar"] },
    { id: "toggle-theme", label: "Toggle Theme", href: "#toggle-theme", icon: <Sun className="w-4 h-4" />, keywords: ["toggle", "theme", "dark", "light", "mode"] },
  ], []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    },
    [open, setOpen],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const sections = useMemo(() => {
    const searchLower = search.toLowerCase();
    const recentItems: CommandItem[] = recentCampaigns
      .filter((c) => c.title.toLowerCase().includes(searchLower))
      .map((c) => ({
        id: `recent-${c.id}`,
        label: c.title,
        href: `/campaign/${c.id}`,
        icon: <Compass className="w-4 h-4" />,
        keywords: ["recent", c.title.toLowerCase()],
      }));
    const navItems = navigationItems.filter(
      (item) =>
        item.label.toLowerCase().includes(searchLower) ||
        item.keywords.some((kw) => kw.includes(searchLower)),
    );
    const actionItems = quickActions.filter(
      (item) =>
        item.label.toLowerCase().includes(searchLower) ||
        item.keywords.some((kw) => kw.includes(searchLower)),
    );
    const result: { label: string; items: CommandItem[] }[] = [];
    if (recentItems.length) result.push({ label: "Recent Campaigns", items: recentItems });
    if (navItems.length) result.push({ label: "Navigation", items: navItems });
    if (actionItems.length) result.push({ label: "Quick Actions", items: actionItems });
    return result;
  }, [search, recentCampaigns, quickActions]);

  const filteredItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => {
    if (!open) {
      setAnnouncement("");
      return;
    }

    const count = filteredItems.length;
    const message =
      count === 0 ? "No results found" : `${count} result${count === 1 ? "" : "s"} available`;

    const timer = window.setTimeout(() => {
      setAnnouncement((prev) => (prev === message ? prev : message));
    }, 400);

    return () => window.clearTimeout(timer);
  }, [open, filteredItems]);

  const handleSelect = (item: CommandItem) => {
    setOpen(false);
    setSearch("");
    if (item.href === "#toggle-theme") {
      document.documentElement.classList.toggle("dark");
    } else if (item.href === "#connect-wallet") {
      document.querySelector<HTMLElement>("[data-connect-wallet]")?.click();
    } else {
      router.push(item.href);
    }
  };

  useEffect(() => {
    setActiveIndex(0);
  }, [filteredItems.length]);

  useEffect(() => {
    const el = listRef.current?.children[activeIndex];
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const handleDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % filteredItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === "Enter" && filteredItems[activeIndex]) {
      e.preventDefault();
      handleSelect(filteredItems[activeIndex]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden max-w-lg"
        aria-describedby="command-palette-description"
        onKeyDown={handleDialogKeyDown}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command Palette</DialogTitle>
          <DialogDescription id="command-palette-description">
            Quick navigation and search. Use arrow keys to navigate and Enter to select.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center border-b px-3">
          <Search className="w-4 h-4 text-muted-foreground mr-2" aria-hidden="true" />
          <Input
            placeholder="Search navigation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-12"
            autoFocus
            aria-label="Search commands"
          />
          <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
            <span className="text-xs">ESC</span>
          </kbd>
        </div>
        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>
        <div className="max-h-[300px] overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Search className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">No results found</p>
              <p className="text-xs text-muted-foreground">Try a different search term.</p>
            </div>
          ) : (
            <div ref={listRef} role="listbox" aria-label="Command options">
              {sections.map((section) => (
                <div key={section.label} className="mb-2">
                  <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {section.label}
                  </p>
                  {section.items.map((item) => {
                    const index = filteredItems.indexOf(item);
                    return (
                      <button
                        key={item.id}
                        role="option"
                        aria-selected={index === activeIndex}
                        data-index={index}
                        onClick={() => handleSelect(item)}
                        className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors focus:outline-none ${index === activeIndex ? "bg-muted" : "hover:bg-muted"}`}
                      >
                        <span className="text-muted-foreground">{item.icon}</span>
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t p-2 text-xs text-muted-foreground flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
              <Command className="w-3 h-3" />K
            </kbd>
            <span>to toggle</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
              ↑↓
            </kbd>
            <span>to navigate</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
