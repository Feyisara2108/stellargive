#!/usr/bin/env node
/**
 * Soroban RPC health monitor.
 *
 * Probes one or more RPC endpoints with `getHealth` (+ optional `getLatestLedger`),
 * logs latency, and exits non-zero only when every endpoint is unhealthy so a
 * scheduler (cron / GitHub Actions) can react. On total failure, webhook alerts
 * are dispatched to any configured channels (Slack, Discord). Deduplication is
 * handled at the workflow layer (rpc-health.yml opens/closes a GitHub issue).
 *
 * Environment variables:
 *   SOROBAN_RPC_URL          Primary RPC endpoint
 *   SOROBAN_RPC_FALLBACK_URL Secondary endpoint tried after the primary fails
 *   SOROBAN_RPC_URLS         Comma-separated list (overrides the two above when set)
 *   NEXT_PUBLIC_SOROBAN_RPC_URL  Fallback if none of the above are set
 *   RPC_TIMEOUT_MS           Per-request timeout in ms (default: 10000)
 *   SLACK_WEBHOOK_URL        Slack incoming-webhook URL  (optional)
 *   DISCORD_WEBHOOK_URL      Discord incoming-webhook URL (optional)
 *
 * Exit codes:
 *   0  At least one RPC endpoint is healthy
 *   1  Every configured RPC endpoint is unreachable or unhealthy
 *
 * Usage:
 *   node scripts/monitor-rpc.js
 */

"use strict";

function resolveRpcUrls() {
  if (process.env.SOROBAN_RPC_URLS) {
    return process.env.SOROBAN_RPC_URLS.split(",")
      .map((u) => u.trim())
      .filter(Boolean);
  }

  const urls = [];
  const primary =
    process.env.SOROBAN_RPC_URL ||
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ||
    "https://soroban-testnet.stellar.org";
  urls.push(primary);

  const fallback = process.env.SOROBAN_RPC_FALLBACK_URL;
  if (fallback && fallback !== primary) {
    urls.push(fallback);
  }

  return urls;
}

const RPC_URLS = resolveRpcUrls();
const TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS || 10_000);
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";

// ── Webhook helpers ────────────────────────────────────────────────────────────

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
}

async function alertSlack(text) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    await postJson(SLACK_WEBHOOK_URL, { text });
    console.error("  → Slack alert sent");
  } catch (err) {
    console.error(`  → Failed to post Slack alert: ${err.message}`);
  }
}

async function alertDiscord(content) {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    await postJson(DISCORD_WEBHOOK_URL, { content });
    console.error("  → Discord alert sent");
  } catch (err) {
    console.error(`  → Failed to post Discord alert: ${err.message}`);
  }
}

async function dispatchAlerts(message) {
  await Promise.all([alertSlack(message), alertDiscord(message)]);
}

// ── Health check ───────────────────────────────────────────────────────────────

async function rpcCall(url, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method }),
      signal: controller.signal,
    });
    const latency = Date.now() - start;

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const body = await res.json();
    if (body.error) {
      throw new Error(`RPC error: ${JSON.stringify(body.error)}`);
    }
    return { body, latency };
  } finally {
    clearTimeout(timer);
  }
}

async function checkEndpoint(url) {
  try {
    const { body, latency } = await rpcCall(url, "getHealth");
    const status = body?.result?.status;
    if (status !== "healthy") {
      throw new Error(`unexpected status: ${JSON.stringify(body?.result ?? body)}`);
    }

    // Stronger probe: a node can report healthy while lagging on ledger sync.
    try {
      const ledger = await rpcCall(url, "getLatestLedger");
      const sequence = ledger.body?.result?.sequence;
      if (typeof sequence !== "number" || sequence <= 0) {
        throw new Error(`invalid latest ledger: ${JSON.stringify(ledger.body?.result)}`);
      }
      console.log(`✅ RPC healthy — ${url} (${latency}ms, ledger ${sequence})`);
    } catch (ledgerErr) {
      // getLatestLedger is best-effort; do not fail solely on it if getHealth passed,
      // but log so operators notice stalled nodes.
      console.warn(`⚠️  getLatestLedger weak on ${url}: ${ledgerErr.message}`);
      console.log(`✅ RPC healthy — ${url} (${latency}ms)`);
    }

    return { ok: true, url, latency };
  } catch (err) {
    const reason = err.name === "AbortError" ? `timeout after ${TIMEOUT_MS}ms` : err.message;
    console.error(`❌ RPC unhealthy — ${url}: ${reason}`);
    return { ok: false, url, reason };
  }
}

async function checkHealth() {
  console.log(`Checking ${RPC_URLS.length} RPC endpoint(s)…`);
  const failures = [];

  for (const url of RPC_URLS) {
    const result = await checkEndpoint(url);
    if (result.ok) {
      if (failures.length > 0) {
        console.log(`ℹ️  Primary endpoint(s) failed; succeeded via fallback ${url}`);
      }
      return true;
    }
    failures.push(result);
  }

  const summary = failures.map((f) => `${f.url}: ${f.reason}`).join("; ");
  const msg = `❌ All RPC endpoints unhealthy (${RPC_URLS.length}): ${summary}`;
  console.error(msg);
  await dispatchAlerts(msg);
  return false;
}

checkHealth().then((healthy) => process.exit(healthy ? 0 : 1));
