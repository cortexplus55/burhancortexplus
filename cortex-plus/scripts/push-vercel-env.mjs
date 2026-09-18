#!/usr/bin/env node
/**
 * Push env vars from .env.local to Vercel project (team cortexplus55).
 * Usage: set VERCEL_TOKEN=... && node scripts/push-vercel-env.mjs
 *
 * PAYTR_* varsayilan olarak atlanir: 710114 (tusaicortex) anahtarlarinin
 * yanlislikla cortexplus.app projesine gitmesini engeller. cortexplus.app'in
 * kendi ek magazasi onaylandiginda bilerek gondermek icin --include-paytr
 * kullanin; once `node scripts/verify-paytr.mjs` ile anahtarlari dogrulayin.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");

const TEAM_SLUG = "cortexplus55";
const PROJECT = "burhancortexplus-app";

const includePaytr = process.argv.includes("--include-paytr");
const SKIP_PREFIX = [
  ...(includePaytr ? [] : ["PAYTR_"]),
  "NEXT_PUBLIC_POSTHOG",
  "SENTRY_",
  "UPSTASH_",
];
const SKIP_KEYS = new Set([
  // Google: set in Supabase; optional on Vercel unless custom server flow
]);

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function shouldInclude(key, value) {
  if (!value) return false;
  if (SKIP_KEYS.has(key)) return false;
  if (SKIP_PREFIX.some((p) => key.startsWith(p))) return false;
  return true;
}

const dryJson = process.argv.includes("--json-out");
const jsonOutPath = resolve(__dirname, ".vercel-env-payload.json");

const token = process.env.VERCEL_TOKEN;
if (!dryJson && !token) {
  console.error("Missing VERCEL_TOKEN");
  process.exit(1);
}

const raw = readFileSync(envPath, "utf8");
const parsed = parseEnv(raw);
const entries = Object.entries(parsed).filter(([k, v]) => shouldInclude(k, v));

const body = entries.map(([key, value]) => {
  const isPublic =
    key.startsWith("NEXT_PUBLIC_") ||
    key.endsWith("_MODEL") ||
    key === "EMAIL_FROM" ||
    key === "NEXT_PUBLIC_APP_NAME";
  return {
    key,
    value,
    type: isPublic ? "plain" : "encrypted",
    target: ["production", "preview", "development"],
  };
});

if (dryJson) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(jsonOutPath, JSON.stringify(body));
  console.log(body.length);
  process.exit(0);
}

const url = `https://api.vercel.com/v10/projects/${PROJECT}/env?slug=${TEAM_SLUG}&upsert=true`;
const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const text = await res.text();
if (!res.ok) {
  console.error("Vercel API error", res.status, text);
  process.exit(1);
}

console.log("OK:", entries.length, "variables upserted");
if (includePaytr) {
  const pushed = entries.filter(([k]) => k.startsWith("PAYTR_")).map(([k]) => k);
  console.log(
    pushed.length
      ? `PayTR: ${pushed.join(", ")} gonderildi. Bildirim URL'ini PayTR panelinde ayarlamayi unutmayin.`
      : "PayTR: --include-paytr verildi ama .env.local'da PAYTR_* yok.",
  );
}
console.log(text.slice(0, 500));
