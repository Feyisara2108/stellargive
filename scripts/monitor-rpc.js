#!/usr/bin/env node
/**
 * Soroban RPC health monitor.
 *
 * Pings the RPC endpoint's `getHealth` method, logs the latency, and exits
 * non-zero if the node is unreachable or unhealthy so a scheduler (cron /
 * GitHub Actions) can alert. If SLACK_WEBHOOK_URL is set, an alert is also
 * posted there.
 *
 * Env:
 *   SOROBAN_RPC_URL        RPC endpoint (default: https://soroban-testnet.stellar.org)
 *   RPC_TIMEOUT_MS         per-request timeout in ms (default: 10000)
 *   SLACK_WEBHOOK_URL      optional Slack incoming-webhook URL for alerts
 *
 * Usage: node scripts/monitor-rpc.js
 */

const RPC_URL =
  process.env.SOROBAN_RPC_URL ||
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ||
  "https://soroban-testnet.stellar.org";
const TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS || 10000);
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

async function alertSlack(text) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error(`Failed to post Slack alert: ${err.message}`);
  }
}

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
      throw new Error(`unexpected status: ${JSON.stringify(body?.result ?? body)}`);
    }

    console.log(`✅ RPC healthy — ${RPC_URL} (${latency}ms)`);
    return true;
  } catch (err) {
    const reason = err.name === "AbortError" ? `timeout after ${TIMEOUT_MS}ms` : err.message;
    const msg = `❌ RPC unhealthy — ${RPC_URL}: ${reason}`;
    console.error(msg);
    await alertSlack(msg);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

checkHealth().then((ok) => process.exit(ok ? 0 : 1));
