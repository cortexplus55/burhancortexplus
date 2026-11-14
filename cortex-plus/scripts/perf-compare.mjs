#!/usr/bin/env node
/**
 * İki performans ölçümünü karşılaştırır (Faz 0, 2.9).
 *
 *   npm run perf:compare -- docs/design-migration/perf/taban-1288c25.json docs/design-migration/perf/faz0-492e206.json
 *   npm run perf:compare -- eski.json yeni.json --markdown   # rapora girecek tablo
 *
 * Eşikler ANA-PROMPT §3.6: medyan LCP ≤ +%15, CLS ≤ +0,02 mutlak ve hiçbir rotada 0,1 üstü yok, engelleme süresi ≤ +%20,
 * JS + CSS bayt toplamı ≤ +%10. Eşik aşılırsa satır "↑" işaretlenir ve betik 1 koduyla çıkar.
 */
import fs from "node:fs";

const [oldFile, newFile] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const MARKDOWN = process.argv.includes("--markdown");
if (!oldFile || !newFile) {
  console.error("Kullanım: npm run perf:compare -- <eski.json> <yeni.json> [--markdown]");
  process.exit(2);
}
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const before = read(oldFile);
const after = read(newFile);
const LIMITS = { lcp: { pct: 15 }, cls: { abs: 0.02, max: 0.1 }, tbt: { pct: 20 }, bytes: { pct: 10 } };

const kb = (v) => `${Math.round(v / 1024)} KB`;
const fmt = (k, v) => (v === null || v === undefined ? "—" : k === "cls" ? v.toFixed(3) : k === "js" || k === "css" || k === "bytes" ? kb(v) : `${Math.round(v)} ms`);
const worse = (k, a, b) => {
  if (a === null || b === null || a === undefined || b === undefined) return false;
  const l = LIMITS[k];
  if (!l) return false;
  if (l.abs !== undefined) return b - a > l.abs || (l.max !== undefined && b > l.max);
  return a > 0 ? ((b - a) / a) * 100 > l.pct : b > 0;
};

const rows = [];
let regressions = 0;
for (const r of after.routes) {
  const o = before.routes.find((x) => x.name === r.name);
  const value = (m, k) => (k === "bytes" ? (m?.js ?? 0) + (m?.css ?? 0) || null : (m?.[k] ?? null));
  const cells = ["lcp", "cls", "tbt", "js", "css", "bytes"].map((k) => {
    const a = value(o?.median, k);
    const b = value(r.median, k);
    const bad = worse(k, a, b);
    if (bad) regressions += 1;
    return `${fmt(k, a)} → ${fmt(k, b)}${bad ? " ↑" : ""}`;
  });
  rows.push([r.name, ...cells]);
}

if (MARKDOWN) {
  console.log(`| Rota | LCP | CLS | Engelleme | JS | CSS | JS + CSS |\n|---|---|---|---|---|---|---|`);
  for (const row of rows) console.log(`| ${row.join(" | ")} |`);
} else {
  console.log(`${before.label} → ${after.label}`);
  for (const row of rows) console.log(row.map((c, i) => (i === 0 ? c.padEnd(11) : c.padEnd(22))).join(""));
}
console.log(regressions ? `\n${regressions} ölçü eşiği aştı (↑).` : "\nEşiği aşan ölçü yok.");
process.exit(regressions ? 1 : 0);
