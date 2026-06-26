#!/usr/bin/env node
/**
 * Soroban RPC health monitor.
 *
 * Pings the RPC endpoint's `getHealth` JSON-RPC method, logs the latency,
 * and exits non-zero on outage so a scheduler (cron / GitHub Actions) can
 * react.  On failure, webhook alerts are dispatched to any configured
 * channels (Slack, Discord).  Deduplication is handled at the workflow layer
 * (rpc-health.yml opens/closes a GitHub issue), so this script always fires
 * on failure — it does NOT suppress repeated alerts internally.
 *
 * Environment variables:
 *   SOROBAN_RPC_URL        RPC endpoint (default: https://soroban-testnet.stellar.org)
 *   RPC_TIMEOUT_MS         Per-request timeout in ms (default: 10000)
 *   SLACK_WEBHOOK_URL      Slack incoming-webhook URL  (optional)
 *   DISCORD_WEBHOOK_URL    Discord incoming-webhook URL (optional)
 *
 * Exit codes:
 *   0  RPC is healthy
 *   1  RPC is unreachable or returned an unhealthy status
 *
 * Usage:
 *   node scripts/monitor-rpc.js
 */

"use strict";

const RPC_URL =
  process.env.SOROBAN_RPC_URL ||
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ||
  "https://soroban-testnet.stellar.org";

const TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS || 10_000);
const SLACK_WEBHOOK_URL   = process.env.SLACK_WEBHOOK_URL   || "";
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
    // Discord expects { content } for a plain message
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

async function checkHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();

  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      signal: controller.signal,
    });
    const latency = Date.now() - start;

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const body = await res.json();
    const status = body?.result?.status;
    if (status !== "healthy") {
      throw new Error(
        `unexpected status: ${JSON.stringify(body?.result ?? body)}`
      );
    }

    console.log(`✅ RPC healthy — ${RPC_URL} (${latency}ms)`);
    return true;
  } catch (err) {
    const reason =
      err.name === "AbortError"
        ? `timeout after ${TIMEOUT_MS}ms`
        : err.message;
    const msg = `❌ RPC unhealthy — ${RPC_URL}: ${reason}`;
    console.error(msg);
    await dispatchAlerts(msg);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

checkHealth().then((healthy) => process.exit(healthy ? 0 : 1));
