#!/usr/bin/env node
// Prints each app route's first-load client JS (raw and gzip bytes): every
// `<script src>` chunk the rendered HTML loads up front. Chunks pulled in later
// via `import()` / `next/dynamic` are not counted, which is the point — they
// don't block first load.
//
// Static routes are read from the prerendered HTML in `.next/server/app`;
// dynamic routes (`/campaign/[id]`, `/profile/[address]`) are rendered by a
// short-lived `next start`.
//
// Usage: npm run analyze && node scripts/measure-route-js.mjs [--json]
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { spawn } from "node:child_process";

const nextDir = join(process.cwd(), ".next");
const routesManifest = join(nextDir, "app-path-routes-manifest.json");
if (!existsSync(routesManifest)) {
  console.error("No .next build found; run `npm run analyze` first.");
  process.exit(1);
}

const SAMPLE_PARAMS = {
  "[id]": "1",
  "[address]": "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
};
const PORT = Number(process.env.MEASURE_PORT ?? 3999);

const routes = Object.values(JSON.parse(readFileSync(routesManifest, "utf8"))).filter(
  (r) => !r.startsWith("/api") && !r.startsWith("/_"),
);

function scriptSrcs(html) {
  const srcs = new Set();
  for (const m of html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)) {
    srcs.add(m[1].replace(/^.*?\/_next\//, ""));
  }
  return [...srcs];
}

const sizeCache = new Map();
function sizeOf(file) {
  if (!sizeCache.has(file)) {
    const path = join(nextDir, file);
    const buf = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
    sizeCache.set(file, { raw: buf.length, gzip: gzipSync(buf).length });
  }
  return sizeCache.get(file);
}

async function withServer(fn) {
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "ignore" });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        await fetch(`http://localhost:${PORT}/faq`);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    return await fn();
  } finally {
    server.kill();
  }
}

const dynamicRoutes = routes.filter((r) => r.includes("["));
const htmlByRoute = new Map();
for (const route of routes.filter((r) => !r.includes("["))) {
  const file = join(nextDir, "server", "app", route === "/" ? "index.html" : `${route}.html`);
  if (existsSync(file)) htmlByRoute.set(route, readFileSync(file, "utf8"));
}
if (dynamicRoutes.length > 0) {
  await withServer(async () => {
    for (const route of dynamicRoutes) {
      const path = route.replace(/\[[^\]]+\]/g, (seg) => SAMPLE_PARAMS[seg] ?? "1");
      const res = await fetch(`http://localhost:${PORT}${path}`).catch(() => null);
      if (res) htmlByRoute.set(route, await res.text());
    }
  });
}

const rows = [...htmlByRoute.entries()]
  .map(([route, html]) => {
    let raw = 0;
    let gzip = 0;
    for (const file of scriptSrcs(html)) {
      const s = sizeOf(file);
      raw += s.raw;
      gzip += s.gzip;
    }
    return { route, raw, gzip };
  })
  .sort((a, b) => a.route.localeCompare(b.route));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`.padStart(11);
  console.log(`${"Route".padEnd(22)}${"raw".padStart(11)}${"gzip".padStart(11)}`);
  for (const r of rows) console.log(`${r.route.padEnd(22)}${kb(r.raw)}${kb(r.gzip)}`);
  const max = rows.reduce((m, r) => Math.max(m, r.raw), 0);
  console.log(`\nLargest route: ${kb(max).trim()} raw`);
}
