"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { CONTRACT_ID } from "@/lib/soroban";
import { cn } from "@/lib/utils";
import { useRpcHealth, type RpcStatus } from "@/hooks/useRpcHealth";

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
          copied && "text-green-500",
        )}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

const RPC_STATUS_CONFIG: Record<
  RpcStatus,
  { dot: string; label: (ms: number | null) => string }
> = {
  healthy: {
    dot: "bg-green-500",
    label: (ms) => `RPC healthy · ${ms}ms`,
  },
  degraded: {
    dot: "bg-amber-500 animate-pulse",
    label: (ms) => `RPC degraded · ${ms}ms`,
  },
  down: {
    dot: "bg-red-500 animate-pulse",
    label: () => "RPC unreachable",
  },
};

function RpcStatusDot() {
  const health = useRpcHealth();

  const dotClass = health
    ? RPC_STATUS_CONFIG[health.status].dot
    : "bg-muted-foreground/40";
  const tooltip = health
    ? RPC_STATUS_CONFIG[health.status].label(health.latencyMs)
    : "Checking RPC…";

  return (
    <span className="relative inline-flex group/rpc">
      <span
        role="status"
        aria-label={tooltip}
        className={cn("block h-2 w-2 rounded-full", dotClass)}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm opacity-0 transition-opacity group-hover/rpc:opacity-100"
      >
        {tooltip}
      </span>
    </span>
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
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">Network:</span>
            <RpcStatusDot />
          </div>
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
