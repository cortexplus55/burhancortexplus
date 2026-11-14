#!/usr/bin/env node
/**
 * Otomatik tasarım denetimi (Faz 0, 2.7). Her rota × genişlik × plan için kuralları ölçer; çıta (ratchet) tutar.
 *
 *   npm run design:audit                       # ölç, audit/<tarih>.json yaz, taban çizgisiyle karşılaştır
 *   npm run design:audit -- --update-baseline  # bugünkü sayıları taban çizgisi yap (yalnız bilinçli)
 *   npm run design:audit -- --skip-login --only=e2e-plus --widths=1280
 *
 * Rota listesi görsel tabanla ortak: tests/visual/route-matrix.json. Sunucu: güvenli test sunucusu (3006; model
 * anahtarı, SMTP, Resend boş; tests/visual/visual.config.ts ile aynı). Kurucu gerçek hesap değil, fikstürle ölçülür.
 *
 * Kurallar (başarısız sayılan 1–6; 7 yalnız listelenir):
 *  1 overflowX      belge scrollWidth > innerWidth (ekran başına 1)
 *  2 smallTarget    görünür etkileşimli öğenin kısa kenarı < 40 px (768 altında < 44; ürün sahibinin kararı, 14 Kasım 2026)
 *  3 smallFont      görünür metnin hesaplanan yazı boyu < 11 px
 *  4 multiBrand     ekranda birden çok marka düğmesi (ekran başına 1)
 *  5 unlabeledIcon  metni ve aria-label / aria-labelledby / title'ı olmayan button ve a
 *  6 contrast       axe "color-contrast" (düğüm sayısı)
 *  7 bilgi          kenarlıklı kart adayları, Plus dışı altın, odakta outline'ı olmayan öğeler, konsol hataları
 * Bir kuralın toplamı taban çizgisinden fazlaysa betik 1 koduyla çıkar.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROOT = process.cwd();
const arg = (name, fallback) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? "").slice(name.length + 3) || fallback;
const BASE = (process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3006").replace(/\/$/, "");
const WIDTHS = arg("widths", "1280,768,375").split(",").map(Number);
const ONLY = arg("only", "").split(",").filter(Boolean);
const UPDATE = process.argv.includes("--update-baseline");
const BASELINE = path.join(ROOT, "docs/design-migration/audit-baseline.json");
const OUT_DIR = path.join(ROOT, "docs/design-migration/audit");
const HEIGHT = { 1280: 800, 768: 1024, 375: 812 };
const RULES = ["overflowX", "smallTarget", "smallFont", "multiBrand", "unlabeledIcon", "contrast"];

const matrix = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/visual/route-matrix.json"), "utf8"));
const statePath = path.join(ROOT, "tests/.auth/e2e-state.json");

if (!process.argv.includes("--skip-login")) {
  execFileSync(process.execPath, [path.join("scripts", "e2e-login.mjs")], { stdio: "inherit", env: { ...process.env, E2E_BASE_URL: BASE } });
}
const state = JSON.parse(fs.readFileSync(statePath, "utf8")).users;
const fill = (p, ctx) => p.replace(/\{(\w+)\}/g, (_, k) => ctx?.[k] ?? "");

/** Ölçülecek ekranlar: [kullanıcı, rota]. Kurucu fikstürü oturumsuz. */
function cases() {
  const out = [];
  const add = (user, route) => {
    if (ONLY.length && !ONLY.includes(user)) return;
    const needed = [...route.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    if (user !== "kurucu" && needed.some((k) => !state[user]?.[k])) return; // tohumda bu rota için kayıt yok
    const url = user === "kurucu" ? route.path : fill(route.path, state[user]);
    out.push({ user, route: { ...route, url } });
  };
  for (const route of [...matrix.routes, { ...matrix.profilePanel, panel: true }]) add("e2e-plus", route);
  for (const user of matrix.planUsers) {
    for (const route of matrix.routes.filter((r) => matrix.planRoutes.includes(r.name))) add(user, route);
    add(user, { ...matrix.profilePanel, panel: true });
  }
  for (const route of matrix.founderRoutes) add("kurucu", route);
  return out;
}

/* Sayfa içinde çalışır. */
function auditInPage(threshold) {
  const root = document.documentElement;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0;
  };
  const hidden = (el) => Boolean(el.closest("[aria-hidden='true'], [inert], nextjs-portal"));
  const label = (el) => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 50);
  const where = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}`;

  const result = { overflowX: 0, smallTarget: [], smallFont: [], brand: [], unlabeledIcon: [], borderedCards: [], gold: [] };
  if (root.scrollWidth > window.innerWidth) result.overflowX = root.scrollWidth - window.innerWidth;

  const interactive = "a[href], button, [role='button'], input:not([type='hidden']), select, textarea, [tabindex]:not([tabindex='-1'])";
  for (const el of document.querySelectorAll(interactive)) {
    if (!visible(el) || hidden(el)) continue;
    if (el.matches("a") && el.closest("p, li") && !el.closest("nav")) continue; // satır içi bağlantı
    const r = el.getBoundingClientRect();
    if (Math.min(r.width, r.height) + 0.5 < threshold) result.smallTarget.push({ size: Math.round(Math.min(r.width, r.height)), label: label(el), at: where(el) });
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!node.textContent.trim() || !el || hidden(el) || el.closest("svg, script, style, noscript, .sr-only") || !visible(el)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 11) result.smallFont.push({ size, text: node.textContent.trim().slice(0, 40), at: where(el) });
  }

  const BRAND_RGB = ["79, 70, 229", "99, 102, 241", "67, 83, 243"];
  for (const el of document.querySelectorAll("a[href], button, [role='button']")) {
    if (!visible(el) || hidden(el)) continue;
    const s = getComputedStyle(el);
    const computed = BRAND_RGB.some((rgb) => s.backgroundImage.includes(rgb) || s.backgroundColor === `rgb(${rgb})`);
    if (el.matches("[data-variant='brand'], .cx-brand") || computed) result.brand.push(label(el));

    const text = (el.innerText || "").trim();
    const named = el.getAttribute("aria-label")?.trim() || el.getAttribute("aria-labelledby") || el.getAttribute("title")?.trim()
      || el.querySelector("img[alt]:not([alt=''])") || el.querySelector("svg[aria-label]");
    if (!text && !named) result.unlabeledIcon.push({ at: where(el), href: el.getAttribute("href") });
  }

  const SURFACE_EXEMPT = "[role='dialog'], [role='menu'], [role='listbox'], [role='alert'], [role='status'], aside, details, .cx-popover, .cx-pp-panel, input, textarea, select, button, a";
  const toHsl = (rgb) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(rgb);
    if (!m || (m[4] !== undefined && Number(m[4]) < 0.2)) return null;
    const [r, g, b] = [m[1], m[2], m[3]].map((v) => Number(v) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (d === 0) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s, l };
  };
  const isGold = (c) => { const v = toHsl(c); return Boolean(v && v.h >= 32 && v.h <= 50 && v.s >= 0.6 && v.l >= 0.35 && v.l <= 0.8); };
  const PLUS_IDENTITY = "[class*='--plus'], [class*='plus-'], .cx-streak, [class*='streak'], [class*='star']";
  for (const el of document.body.querySelectorAll("*")) {
    if (!visible(el) || hidden(el)) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const border = ["Top", "Right", "Bottom", "Left"].some((side) => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none");
    if (border && parseFloat(s.borderTopLeftRadius) >= 16 && r.width >= 120 && r.height >= 60 && !el.matches(SURFACE_EXEMPT) && !el.closest("[role='dialog'], .cx-pp-panel")) {
      result.borderedCards.push(where(el));
    }
    const ownText = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (((ownText && isGold(s.color)) || isGold(s.backgroundColor) || /245, 158, 11|251, 191, 36/.test(s.backgroundImage)) && !el.closest(PLUS_IDENTITY)) {
      result.gold.push(`${where(el)} ${label(el).slice(0, 30)}`);
    }
  }
  return result;
}

async function outlineless(page) {
  await page.keyboard.press("Tab").catch(() => {});
  return page.evaluate(() => {
    const out = [];
    const list = [...document.querySelectorAll("a[href], button, input:not([type='hidden']), select, textarea, [tabindex]:not([tabindex='-1'])")]
      .filter((el) => el.getBoundingClientRect().width > 0 && !el.closest("[aria-hidden='true'], [inert]"))
      .slice(0, 40);
    for (const el of list) {
      el.focus({ preventScroll: true });
      const s = getComputedStyle(el);
      if ((s.outlineStyle === "none" || parseFloat(s.outlineWidth) === 0) && s.boxShadow === "none") out.push((el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30));
    }
    document.activeElement?.blur?.();
    return out;
  });
}

async function auditCase(browser, { user, route }, width) {
  const mobile = width < 768;
  if (route.panel && mobile) return null; // telefonda kapsül yok
  const storageState = user === "kurucu" ? undefined : path.join(ROOT, "tests/.auth", `${user}.json`);
  const context = await browser.newContext({
    baseURL: BASE,
    storageState,
    viewport: { width, height: HEIGHT[width] ?? 900 },
    ...(mobile ? { isMobile: true, hasTouch: true } : {}),
    reducedMotion: "reduce",
    colorScheme: "dark",
  });
  if (user === "kurucu") {
    const policy = /COOKIE_POLICY_VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "src/lib/legal/versions.ts"), "utf8"))?.[1];
    await context.addCookies([{ name: "cp_consent", value: encodeURIComponent(JSON.stringify({ v: policy, a: false, t: Date.now(), id: "00000000-0000-4000-8000-000000000e2e" })), domain: new URL(BASE).hostname, path: "/" }]);
  }
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 160)}`));
  const key = `${user} ${route.name} ${width}`;
  try {
    let response = await page.goto(route.url, { timeout: 150_000 });
    if ((response?.status() ?? 0) >= 500) { await page.waitForTimeout(2000); response = await page.goto(route.url, { timeout: 150_000 }); }
    if (!route.url.startsWith("/e2e/") && new URL(page.url()).pathname.startsWith("/giris")) {
      await page.waitForTimeout(3000);
      await page.goto(route.url, { timeout: 150_000 });
      if (new URL(page.url()).pathname.startsWith("/giris")) throw new Error("oturum yok (giriş sayfasına düştü)");
    }
    await page.locator(route.ready ?? "h1").first().waitFor({ state: "visible", timeout: 60_000 });
    if (route.panel) {
      await page.locator("button.cx-capsule").first().click();
      await page.locator(".cx-pp-panel").first().waitFor({ state: "visible" });
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const data = await page.evaluate(auditInPage, mobile ? 44 : 40);
    const axe = await new AxeBuilder({ page }).withRules(["color-contrast"]).exclude("nextjs-portal").analyze();
    const contrast = axe.violations.flatMap((v) => v.nodes.map((n) => ({ target: n.target.join(" "), summary: n.failureSummary?.split("\n").slice(-1)[0]?.trim().slice(0, 120) })));
    const focusless = await outlineless(page);
    return {
      key, user, route: route.name, url: route.url, width, status: response?.status() ?? null,
      counts: {
        overflowX: data.overflowX > 0 ? 1 : 0,
        smallTarget: data.smallTarget.length,
        smallFont: data.smallFont.length,
        multiBrand: data.brand.length > 1 ? 1 : 0,
        unlabeledIcon: data.unlabeledIcon.length,
        contrast: contrast.length,
      },
      detail: { overflowPx: data.overflowX, smallTarget: data.smallTarget, smallFont: data.smallFont.slice(0, 10), brand: data.brand, unlabeledIcon: data.unlabeledIcon, contrast: contrast.slice(0, 15) },
      info: { borderedCards: data.borderedCards.slice(0, 15), gold: data.gold.slice(0, 15), outlineNone: focusless.slice(0, 15), consoleErrors: consoleErrors.slice(0, 10) },
    };
  } catch (error) {
    return { key, user, route: route.name, url: route.url, width, error: String(error.message).slice(0, 200) };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch();
const results = [];
const list = cases();
let done = 0;
for (const c of list) {
  for (const width of WIDTHS) {
    const r = await auditCase(browser, c, width);
    if (r) results.push(r);
  }
  done += 1;
  if (done % 10 === 0) console.log(`  ${done}/${list.length} rota`);
}
await browser.close();

const totals = Object.fromEntries(RULES.map((rule) => [rule, results.reduce((sum, r) => sum + (r.counts?.[rule] ?? 0), 0)]));
const errors = results.filter((r) => r.error);
const byRoute = new Map();
for (const r of results) {
  if (!r.counts) continue;
  const k = `${r.user} ${r.route}`;
  byRoute.set(k, (byRoute.get(k) ?? 0) + RULES.reduce((s, rule) => s + r.counts[rule], 0));
}
const top = [...byRoute.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const outFile = path.join(OUT_DIR, `${stamp}.json`);
fs.writeFileSync(outFile, `${JSON.stringify({ measuredAt: new Date().toISOString(), base: BASE.includes("127.0.0.1") ? "yerel güvenli sunucu" : BASE, totals, screens: results.length, errors: errors.length, top, results }, null, 1)}\n`);

console.log("\nKural            Toplam  Taban");
const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : null;
let worse = [];
for (const rule of RULES) {
  const before = baseline?.totals?.[rule];
  console.log(`${rule.padEnd(16)} ${String(totals[rule]).padStart(6)}  ${before === undefined ? "—" : String(before).padStart(5)}`);
  if (before !== undefined && totals[rule] > before) worse.push(`${rule}: ${before} → ${totals[rule]}`);
}
console.log(`\nEkran: ${results.length} · ölçülemeyen: ${errors.length}${errors.length ? ` (${errors.map((e) => `${e.key}: ${e.error}`).slice(0, 5).join("; ")})` : ""}`);
console.log("En çok ihlal eden 10 rota:");
for (const [k, n] of top) console.log(`  ${String(n).padStart(4)}  ${k}`);
console.log(`Ayrıntı: ${path.relative(ROOT, outFile)}`);

if (errors.length && !UPDATE) worse.push(`${errors.length} ekran ölçülemedi`);
if (!baseline || UPDATE) {
  if (errors.length) {
    console.error("Ölçülemeyen ekran varken taban çizgisi yazılmadı.");
    process.exit(1);
  }
  fs.writeFileSync(BASELINE, `${JSON.stringify({ updatedAt: new Date().toISOString(), screens: results.length, totals, top }, null, 1)}\n`);
  console.log(`Taban çizgisi yazıldı: ${path.relative(ROOT, BASELINE)}`);
} else if (worse.length) {
  console.error(`\nÇITA AŞILDI: ${worse.join(" · ")}`);
  process.exit(1);
} else {
  const better = RULES.filter((rule) => totals[rule] < (baseline.totals?.[rule] ?? 0));
  if (better.length) console.log(`Azalan kurallar (${better.join(", ")}): taban çizgisini güncelleyebilirsiniz (--update-baseline).`);
}
