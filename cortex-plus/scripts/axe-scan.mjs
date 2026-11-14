#!/usr/bin/env node
/**
 * Tam erişilebilirlik taraması (Faz 12B). axe `wcag2a, wcag2aa, wcag21a, wcag21aa` etiketleri; rota listesi ve
 * oturumlar görsel taban ve tasarım denetimiyle ortak (`tests/visual/route-matrix.json`, `tests/.auth/<kullanıcı>.json`).
 * Yalnız ölçer; üretim koduna dokunmaz. Sunucu: güvenli test sunucusu (3006).
 *
 *   node scripts/axe-scan.mjs --label faz12 [--widths=1280,768,375] [--only=e2e-plus] [--v2]
 *
 * `--v2`: bütün `ui.v2.*` bayrakları açık (yerel sunucuda `cx-ui-v2=all` çerezi; canlıda çerez yok sayılır).
 *
 * Çıktı: docs/design-migration/audit/axe-<label>.json (ekran başına ihlaller) ve özet (kural × etki × düğüm).
 * serious ya da critical ihlal varsa 1 koduyla çıkar.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROOT = process.cwd();
const arg = (name, fallback) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? "").slice(name.length + 3) || fallback;
const labelIndex = process.argv.indexOf("--label");
const LABEL = labelIndex > 0 ? process.argv[labelIndex + 1] : arg("label", "axe");
const BASE = (process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3006").replace(/\/$/, "");
const WIDTHS = arg("widths", "1280,768,375").split(",").map(Number);
const ONLY = arg("only", "").split(",").filter(Boolean);
const HEIGHT = { 1280: 800, 768: 1024, 375: 812 };
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const V2 = process.argv.includes("--v2");

const matrix = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/visual/route-matrix.json"), "utf8"));
const state = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/.auth/e2e-state.json"), "utf8")).users;
const fill = (p, ctx) => p.replace(/\{(\w+)\}/g, (_, k) => ctx?.[k] ?? "");

/** Misafir rotaları (oturumsuz) + oturumlu matris + kurucu fikstürü. */
function cases() {
  const out = [];
  const add = (user, route) => {
    if (ONLY.length && !ONLY.includes(user)) return;
    const needed = [...route.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    if (!["kurucu", "misafir"].includes(user) && needed.some((k) => !state[user]?.[k])) return;
    const url = ["kurucu", "misafir"].includes(user) ? route.path : fill(route.path, state[user]);
    out.push({ user, route: { ...route, url } });
  };
  for (const route of [
    { name: "ana-sayfa", path: "/", ready: "h1" },
    { name: "giris", path: "/giris", ready: "h1" },
    { name: "kayit", path: "/kayit", ready: "main" },
    { name: "fiyatlandirma", path: "/fiyatlandirma", ready: "h1" },
    { name: "bulunamadi", path: "/bu-sayfa-yok", ready: "h1" },
  ]) add("misafir", route);
  for (const route of matrix.routes) add("e2e-plus", route);
  for (const user of matrix.planUsers) {
    for (const route of matrix.routes.filter((r) => matrix.planRoutes.includes(r.name))) add(user, route);
  }
  for (const route of matrix.founderRoutes) add("kurucu", route);
  return out;
}

const policy = /COOKIE_POLICY_VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "src/lib/legal/versions.ts"), "utf8"))?.[1];

async function scan(browser, { user, route }, width) {
  const mobile = width < 768;
  const storageState = ["kurucu", "misafir"].includes(user) ? undefined : path.join(ROOT, "tests/.auth", `${user}.json`);
  const context = await browser.newContext({
    baseURL: BASE,
    storageState,
    viewport: { width, height: HEIGHT[width] ?? 900 },
    ...(mobile ? { isMobile: true, hasTouch: true } : {}),
    reducedMotion: "reduce",
    colorScheme: "dark",
  });
  if (!storageState) {
    await context.addCookies([{ name: "cp_consent", value: encodeURIComponent(JSON.stringify({ v: policy, a: false, t: Date.now(), id: "00000000-0000-4000-8000-000000000e2e" })), domain: new URL(BASE).hostname, path: "/" }]);
  }
  if (V2) await context.addCookies([{ name: "cx-ui-v2", value: "all", domain: new URL(BASE).hostname, path: "/" }]);
  const page = await context.newPage();
  const key = `${user} ${route.name} ${width}${V2 ? " v2" : ""}`;
  try {
    await page.goto(route.url, { timeout: 150_000 });
    await page.locator(route.ready ?? "h1").first().waitFor({ state: "visible", timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const result = await new AxeBuilder({ page }).withTags(TAGS).exclude("nextjs-portal").analyze();
    const violations = result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
      sample: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
      detail: v.nodes.slice(0, 6).map((n) => `${n.html.slice(0, 90)} :: ${(n.failureSummary ?? "").split(/\r?\n/).slice(-1)[0].trim().slice(0, 140)}`),
      help: v.help,
    }));
    return { key, user, route: route.name, url: route.url, width, violations };
  } catch (error) {
    return { key, user, route: route.name, url: route.url, width, error: String(error.message).slice(0, 200) };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch();
const results = [];
const all = cases();
const CONCURRENCY = 4;
const jobs = all.flatMap((c) => WIDTHS.map((w) => [c, w]));
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const [c, w] = jobs[next++];
      results.push(await scan(browser, c, w));
    }
  }),
);
await browser.close();

const summary = {};
let seriousNodes = 0;
for (const r of results) {
  for (const v of r.violations ?? []) {
    const k = `${v.impact} ${v.id}`;
    summary[k] ??= { screens: 0, nodes: 0, example: r.key, help: v.help };
    summary[k].screens += 1;
    summary[k].nodes += v.nodes;
    if (v.impact === "serious" || v.impact === "critical") seriousNodes += v.nodes;
  }
}
const errors = results.filter((r) => r.error);
const outDir = path.join(ROOT, "docs/design-migration/audit");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `axe-${LABEL}.json`), JSON.stringify({ label: LABEL, base: BASE, tags: TAGS, screens: results.length, errors: errors.length, summary, results: results.sort((a, b) => a.key.localeCompare(b.key)) }, null, 2));
console.log(`ekran: ${results.length}, hata: ${errors.length}, serious+critical düğüm: ${seriousNodes}`);
for (const [k, v] of Object.entries(summary).sort()) console.log(`  ${k}: ${v.screens} ekran, ${v.nodes} düğüm (örnek: ${v.example})`);
for (const e of errors.slice(0, 10)) console.log(`  HATA ${e.key}: ${e.error}`);
process.exit(seriousNodes > 0 ? 1 : 0);
