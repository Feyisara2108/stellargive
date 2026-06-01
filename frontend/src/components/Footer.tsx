"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { CONTRACT_ID } from "@/lib/soroban";
import { cn } from "@/lib/utils";

function truncate(id: string) {
  if (!id || id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-6)}`;
}

function ContractIdDisplay() {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!CONTRACT_ID) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CONTRACT_ID);
      setCopied(true);
      toast.success("Contract ID copied!");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — copy it manually.");
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="font-medium">Contract ID:</span>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="font-mono hover:text-foreground transition-colors"
        title={expanded ? "Click to collapse" : "Click to expand"}
      >
        {expanded ? CONTRACT_ID : truncate(CONTRACT_ID)}
      </button>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy contract ID"
        className={cn(
          "inline-flex items-center justify-center rounded-md p-1 transition-colors hover:bg-muted hover:text-foreground",
          copied && "text-green-500"
        )}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t mt-auto">
      <div className="container flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">
            stellar<span className="text-primary">Give</span>
          </span>
          <ContractIdDisplay />
        </div>
        <nav className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <Link href="/explore" className="hover:text-foreground transition-colors">
            Explore
          </Link>
          <Link href="/activity" className="hover:text-foreground transition-colors">
            Activity
          </Link>
          <Link href="/faq" className="hover:text-foreground transition-colors">
            FAQ
          </Link>
          <a
            href="https://stellar.expert/explorer/testnet"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Explorer
          </a>
        </nav>
      </div>
    </footer>
  );
}
