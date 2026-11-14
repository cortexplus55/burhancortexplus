#!/usr/bin/env node
/**
 * Girişli ekran ölçümü (Faz 0; Prompt 1'in 1.3 maddesi): test hesabının oturumuyla ekranları açar ve her genişlikte
 * ölçer. Yalnız okur; hiçbir düğmeye basmaz, hiçbir şey üretmez.
 *
 *   node scripts/design/measure-screens.mjs                       # 1.3: 12 ekran × 768 ve 375, e2e-plus
 *   node scripts/design/measure-screens.mjs --user=e2e-sigma --widths=1280,768,375 --routes=/krediler,/profil
 *   node scripts/design/measure-screens.mjs --plans                # 8 hesabın planı doğru görünüyor mu (/krediler)
 *
 * Ölçüler: durum kodu ve son adres, kabuk var mı, yatay taşma (belge scrollWidth − clientWidth), en küçük yazı,
 * eşik altı dokunma hedefi (768 altı 44 px, üstü 40 px; 06-gozlemler.md §7), ekrandaki marka (brand) düğmesi sayısı,
 * konsol hatası. Sonuç `docs/design-migration/data/` altına JSON; ekran görüntüleri `--shots=<klasör>` verilirse.
 * Ön koşul: `node scripts/seed-e2e-users.mjs` ve `node scripts/e2e-login.mjs` (yerel sunucu 3005).
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const ROOT = process.cwd();
const arg = (name, fallback) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? "").slice(name.length + 3) || fallback;
const BASE = (process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3005").replace(/\/$/, "");
const PLANS = process.argv.includes("--plans");
const USER = arg("user", "e2e-plus");
const SCREENS_1_3 = [
  "/deneme-sinavlari", "/araclar", "/dokumanlar", "/yanlislarim", "/siniflar", "/ilerleme",
  "/takvimim", "/krediler", "/davet", "/sohbetler", "/profil", "/ayarlar",
];
const ROUTES = arg("routes", "").split(",").filter(Boolean);
const WIDTHS = arg("widths", "768,375").split(",").map(Number);
const SHOTS = arg("shots", "");
const OUT = arg("out", PLANS ? "docs/design-migration/data/test-hesaplari-plan.json" : "docs/design-migration/data/onizleme-12-ekran.json");
const HEIGHT = { 1280: 800, 768: 1024, 375: 812 };

const authFile = (user) => path.join(ROOT, "tests/.auth", `${user}.json`);

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.locator("header.cx-home-top, main").first().waitFor({ state: "attached", timeout: 20_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
}

/* Sayfa içinde çalışır: yalnız görünen öğeler; satır içi bağlantılar (paragraf ya da liste metninin içindeki) dokunma
   hedefi sayılmaz (WCAG 2.5.8 istisnası). */
function measureInPage(threshold) {
  const root = document.documentElement;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0;
  };
  let minFont = Infinity;
  let minFontText = "";
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    const el = node.parentElement;
    if (!text || !el || el.closest("[aria-hidden='true'], svg, script, style, noscript, .sr-only") || !visible(el)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < minFont) { minFont = size; minFontText = text.slice(0, 40); }
  }
  const small = [];
  for (const el of document.querySelectorAll("a[href], button, [role='button'], [role='tab'], input:not([type='hidden']), select, textarea, summary")) {
    if (!visible(el) || el.closest("[aria-hidden='true'], [inert]")) continue;
    if (el.matches("a") && el.closest("p, li") && !el.closest("nav")) continue;
    const r = el.getBoundingClientRect();
    const size = Math.min(r.width, r.height);
    if (size + 0.5 < threshold) small.push({ size: Math.round(size), label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40) });
  }
  /* Marka düğmesi hesaplanan renkten: `--cx-gradient-brand` (#4f46e5 → #6366f1) ya da düz marka zemini (#4f46e5,
     #6366f1, eski #4353f3). Sınıf adına bakmak eksik sayıyordu (birincil düğmeler birkaç ayrı sınıfla çiziliyor). */
  const BRAND_RGB = ["79, 70, 229", "99, 102, 241", "67, 83, 243"];
  const brandEls = [...document.querySelectorAll("a[href], button, [role='button']")].filter((el) => {
    if (!visible(el) || el.closest("[aria-hidden='true'], [inert]")) return false;
    const s = getComputedStyle(el);
    return BRAND_RGB.some((rgb) => s.backgroundImage.includes(rgb) || s.backgroundColor === `rgb(${rgb})`);
  });
  const brands = brandEls.length;
  const brandLabels = brandEls.map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40));
  const capsule = document.querySelector(".cx-capsule, [class*='cx-pring']")?.getAttribute("aria-label")
    ?? document.querySelector("[aria-label^='Profil']")?.getAttribute("aria-label") ?? null;
  return {
    overflow: root.scrollWidth - root.clientWidth,
    shell: Boolean(document.querySelector("header.cx-home-top, nav[aria-label]")),
    minFont: minFont === Infinity ? null : minFont,
    minFontText,
    smallTargets: small.sort((a, b) => a.size - b.size).slice(0, 6),
    smallTargetCount: small.length,
    brands,
    brandLabels,
    capsule,
    title: document.title,
    h1: document.querySelector("h1")?.textContent?.trim() ?? null,
    quota: document.querySelector(".cp-quota-pct")?.textContent?.trim() ?? null,
  };
}

async function measure(browser, user, route, width) {
  const mobile = width < 768;
  const context = await browser.newContext({
    baseURL: BASE,
    storageState: authFile(user),
    viewport: { width, height: HEIGHT[width] ?? 900 },
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text().slice(0, 160)); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${String(err.message).slice(0, 160)}`));
  try {
    const response = await page.goto(route, { timeout: 120_000 });
    await settle(page);
    const data = await page.evaluate(measureInPage, mobile ? 44 : 40);
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, `${user}${route.replace(/\//g, "_")}-${width}.png`), fullPage: false });
    }
    return { user, route, width, status: response?.status() ?? null, finalPath: new URL(page.url()).pathname, ...data, consoleErrors: errors };
  } catch (error) {
    return { user, route, width, error: String(error.message).slice(0, 200), consoleErrors: errors };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch();
const results = [];
if (PLANS) {
  const users = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/.auth/e2e-state.json"), "utf8")).users;
  for (const user of Object.keys(users)) results.push(await measure(browser, user, "/krediler", 1280));
} else {
  if (!fs.existsSync(authFile(USER))) { console.error(`${authFile(USER)} yok; önce e2e-login.mjs.`); process.exit(2); }
  for (const route of ROUTES.length ? ROUTES : SCREENS_1_3) for (const width of WIDTHS) results.push(await measure(browser, USER, route, width));
}
await browser.close();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({ base: BASE.includes("127.0.0.1") ? "yerel (3005)" : BASE, measuredAt: new Date().toISOString(), results }, null, 1)}\n`);
for (const r of results) {
  console.log(
    r.error
      ? `${r.user} ${r.route} ${r.width}: HATA ${r.error}`
      : `${r.user} ${r.route} ${r.width}: ${r.status} ${r.finalPath} | kabuk ${r.shell ? "var" : "YOK"} | taşma ${r.overflow} | yazı ${r.minFont} | küçük hedef ${r.smallTargetCount} | brand ${r.brands} | kapsül ${r.capsule ?? "-"}${r.quota ? ` | ${r.quota}` : ""} | konsol ${r.consoleErrors.length}`,
  );
}
console.log(`yazıldı: ${OUT}`);
