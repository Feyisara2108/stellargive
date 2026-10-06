// Fails if any production dependency uses a license outside ALLOWED, apart from
// the explicit, narrowly-scoped EXCEPTIONS below. Replaces a license-checker
// one-liner because its --excludePackages flag needs exact versions.
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const checker = require("license-checker");

const ALLOWED = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "CC0-1.0",
  "CC-BY-3.0",
  "CC-BY-4.0",
  "Unlicense",
  "BlueOak-1.0.0",
  "Python-2.0",
]);

// Prebuilt libvips binaries for sharp, an optional Next.js dependency used for
// server-side image optimisation. LGPL is satisfied by dynamic linking and the
// library never ships in the browser bundle.
const EXCEPTIONS = [{ prefix: "@img/sharp-libvips-", license: "LGPL-3.0-or-later" }];

const start = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// license-checker appends "*" to licenses it guessed from LICENSE text (e.g. "Apache*").
const allowedId = (id) =>
  id.endsWith("*") ? [...ALLOWED].some((a) => a.startsWith(id.slice(0, -1))) : ALLOWED.has(id);

// Evaluates simple SPDX expressions: "(A OR B)" needs one allowed, "(A AND B)" needs all.
function isAllowed(expression) {
  const expr = expression.replace(/[()]/g, "").trim();
  if (/\sOR\s/.test(expr)) return expr.split(/\s+OR\s+/).some(isAllowed);
  if (/\sAND\s/.test(expr)) return expr.split(/\s+AND\s+/).every(isAllowed);
  return allowedId(expr);
}

checker.init({ start, production: true, excludePrivatePackages: true }, (err, packages) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  const violations = Object.entries(packages).filter(([id, info]) => {
    const licenses = [info.licenses].flat().map(String);
    if (licenses.every(isAllowed)) return false;
    return !EXCEPTIONS.some((e) => id.startsWith(e.prefix) && licenses.includes(e.license));
  });
  for (const [id, info] of violations) {
    console.error(`Disallowed license: ${id} (${[info.licenses].flat().join(", ")})`);
  }
  if (violations.length) process.exit(1);
  console.log(`License check passed for ${Object.keys(packages).length} production packages.`);
});
