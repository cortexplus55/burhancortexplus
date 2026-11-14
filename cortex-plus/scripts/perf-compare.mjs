#!/usr/bin/env node
/**
 * İki performans ölçümünü karşılaştırır (Faz 0, 2.9).
 *
 *   npm run perf:compare -- docs/design-migration/perf/taban-1288c25.json docs/design-migration/perf/faz0-492e206.json
 *   npm run perf:compare -- eski.json yeni.json --markdown   # rapora girecek tablo
 *
 * Eşik önerisi (gürültü ölçümünden; 06-gozlemler.md): LCP %15, CLS 0,02 mutlak, engelleme %25, JS/CSS bayt %5.
 * Eşik aşılırsa satır "↑ kötüleşti" işaretlenir ve betik 1 koduyla çıkar.
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
const LIMITS = { lcp: { pct: 15 }, cls: { abs: 0.02 }, tbt: { pct: 25, floor: 50 }, js: { pct: 5 }, css: { pct: 5 } };

const fmt = (k, v) => (v === null || v === undefined ? "—" : k === "cls" ? v.toFixed(3) : k === "js" || k === "css" ? `${Math.round(v / 1024)} KB` : `${Math.round(v)} ms`);
const worse = (k, a, b) => {
  if (a === null || b === null) return false;
  const l = LIMITS[k];
  if (l.abs !== undefined) return b - a > l.abs;
  if (l.floor !== undefined && b - a <= l.floor) return false;
  return a > 0 ? ((b - a) / a) * 100 > l.pct : b > 0;
};

const rows = [];
let regressions = 0;
for (const r of after.routes) {
  const o = before.routes.find((x) => x.name === r.name);
  const cells = ["lcp", "cls", "tbt", "js", "css"].map((k) => {
    const a = o?.median?.[k] ?? null;
    const b = r.median?.[k] ?? null;
    const bad = worse(k, a, b);
    if (bad) regressions += 1;
    return `${fmt(k, a)} → ${fmt(k, b)}${bad ? " ↑" : ""}`;
  });
  rows.push([r.name, ...cells]);
}

if (MARKDOWN) {
  console.log(`| Rota | LCP | CLS | Engelleme | JS | CSS |\n|---|---|---|---|---|---|`);
  for (const row of rows) console.log(`| ${row.join(" | ")} |`);
} else {
  console.log(`${before.label} → ${after.label}`);
  for (const row of rows) console.log(row.map((c, i) => (i === 0 ? c.padEnd(11) : c.padEnd(24))).join(""));
}
console.log(regressions ? `\n${regressions} ölçü eşiği aştı (↑).` : "\nEşiği aşan ölçü yok.");
process.exit(regressions ? 1 : 0);
