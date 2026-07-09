"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Command, Search, Home, PlusCircle, User, Compass } from "lucide-react";

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

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const router = useRouter();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const filteredItems = navigationItems.filter((item) => {
    const searchLower = search.toLowerCase();
    return (
      item.label.toLowerCase().includes(searchLower) ||
      item.keywords.some((keyword) => keyword.includes(searchLower))
    );
  });

  const handleSelect = (href: string) => {
    setOpen(false);
    setSearch("");
    router.push(href);
  };

  const handleKeyDownInList = (e: React.KeyboardEvent, href: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(href);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden max-w-lg"
        aria-describedby="command-palette-description"
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
        <div className="max-h-[300px] overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No results found</div>
          ) : (
            <div role="listbox" aria-label="Command options">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  role="option"
                  aria-selected="false"
                  onClick={() => handleSelect(item.href)}
                  onKeyDown={(e) => handleKeyDownInList(e, item.href)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-muted transition-colors focus:bg-muted focus:outline-none"
                >
                  <span className="text-muted-foreground">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
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
