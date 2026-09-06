/** Read-only release check. Run from cortex-plus: node scripts/audit-live-schema.mjs */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
const expectedUrl = "https://dgjfyewgrukglsehyntc.supabase.co";
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== expectedUrl) {
  throw new Error("Unexpected Supabase project; no requests sent.");
}
if (!process.env.SUPABASE_SECRET_KEY) {
  throw new Error("SUPABASE_SECRET_KEY is required; never paste it into reports.");
}
const client = createClient(expectedUrl, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
  },
});

// Literal table references only. No rows, auth records or storage files are read.
const tables = new Set();
for (const file of fs.readdirSync("src", { recursive: true })) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  const source = fs.readFileSync(`src/${file}`, "utf8");
  for (const match of source.matchAll(/\.from\(["']([a-z_]+)["']\)/g)) {
    tables.add(match[1]);
  }
}

const checks = [...tables].sort().map((table) => ({ table, columns: "*" }));
checks.push(
  { table: "plans", columns: "billing_period,tier,period_days,monthly_allowance" },
  {
    table: "subscriptions",
    columns: "current_period_start,billing_period,cancel_at_period_end,auto_renew,renewal_reminder_sent_at,expired_notified_at",
  },
);
const results = [];
// Keep live traffic bounded. limit(0) preserves SQL error bodies unlike HEAD.
for (let i = 0; i < checks.length; i += 4) {
  results.push(...await Promise.all(checks.slice(i, i + 4).map(async (check) => {
    const { status, error } = await client.from(check.table).select(check.columns).limit(0);
    return { ...check, status, ok: !error && status >= 200 && status < 300, error: error?.message };
  })));
}
const failures = results.filter((result) => !result.ok);
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  projectRef: "dgjfyewgrukglsehyntc",
  literalTables: tables.size,
  checks: results.length,
  failures,
  scope: "Table availability and selected release columns only; does not verify RLS, grants, function bodies or migration history.",
}, null, 2));
process.exitCode = failures.length ? 1 : 0;
