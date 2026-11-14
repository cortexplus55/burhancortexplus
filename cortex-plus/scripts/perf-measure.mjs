#!/usr/bin/env node
/**
 * Performans ve yerleşim kayması ölçümü (Faz 0, 2.9). Yalnız ölçer; üretim koduna dokunmaz.
 *
 *   npm run perf:measure -- --base http://127.0.0.1:3101 --label taban-1288c25
 *   npm run perf:measure -- --base http://127.0.0.1:3103 --label faz0-492e206 --runs 5
 *
 * Telefon kipi (375 × 812, dokunmatik), CDP ile CPU 4× yavaş ve "Hızlı 4G" (60 ms gecikme, 9 Mbit/sn iniş, 1,5 Mbit/sn
 * çıkış). Her rota için 1 ısınma + N ölçüm (varsayılan 5); her ölçüm boş önbellekli yeni bir bağlamda. Medyan raporlanır.
 * Ölçüler: LCP, CLS (kullanıcı girdisi olmayan kaymalar), toplam engelleme süresi yaklaşığı (50 ms üstü uzun görevlerin
 * fazlası), aktarılan JS ve CSS baytı, DOM düğüm sayısı. Pencere: `load` + 3 sn.
 *
 * Girişli rotalar `e2e-plus` oturumuyla (tests/.auth/e2e-plus.json; önce `npm run e2e:login` aynı sunucuya ya da aynı
 * makineye karşı). Sunucu model anahtarı boş başlatılmalı (hazırlık sayfası arka planda ders yazmaya kalkar).
 * Çıktı: docs/design-migration/perf/<label>.json
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : fallback;
};
const BASE = (opt("base", "") || "").replace(/\/$/, "");
const LABEL = opt("label", "");
const RUNS = Number(opt("runs", "5"));
const WARM = Number(opt("warm", "1"));
if (!BASE || !LABEL) {
  console.error("Kullanım: npm run perf:measure -- --base <url> --label <ad> [--runs 5]");
  process.exit(2);
}

const state = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/.auth/e2e-state.json"), "utf8")).users["e2e-plus"];
const AUTH = path.join(ROOT, "tests/.auth/e2e-plus.json");

// Taze giriş: bir saatten eski oturum dosyasıyla açılan bağlamlar yenileme jetonunu yarıştırır ve oturum kapanır.
if (!argv.includes("--skip-login")) {
  execFileSync(process.execPath, [path.join("scripts", "e2e-login.mjs"), "--only=e2e-plus"], { stdio: "inherit", env: { ...process.env, E2E_BASE_URL: BASE } });
}

/** Temsilci rotalar ve neden seçildikleri (rapor bu listeyi kullanır). */
const PERF_ROUTES = [
  { name: "ana-sayfa", path: "/", auth: false, why: "Misafirin ilk gördüğü ve en ağır pazarlama sayfası (kokpit turu)" },
  { name: "giris", path: "/giris", auth: false, why: "Giriş akışının ilk ekranı" },
  { name: "kayit", path: "/kayit", auth: false, why: "Kayıt sihirbazı (dönüşüm yolu)" },
  { name: "404", path: "/bu-sayfa-yok-e2e", auth: false, why: "Bulunamadı sayfası (Faz 12'de değişecek)" },
  { name: "ogretmen", path: "/ogretmen", auth: true, why: "Girişli ana ekran: kabuk, kapsül, sohbet" },
  { name: "hazirlik", path: `/deneme-sinavlari/${state.prepId}`, auth: true, why: "Hazırlık sayfası: çalışma yolu" },
  { name: "ders", path: `/deneme-sinavlari/${state.prepId}/dugum/${state.lessonNodeId}`, auth: true, why: "Ders ekranı (açılış kartı)" },
  { name: "konu-testi", path: `/deneme-sinavlari/${state.prepId}/dugum/${state.quizNodeId}`, auth: true, why: "Konu testi düğümü" },
  { name: "kutuphane", path: "/dokumanlar", auth: true, why: "Kütüphane bir panel; ilk sayfası Belgelerim" },
  { name: "araclar", path: "/araclar", auth: true, why: "Çalışma Stüdyosu (kart ızgarası)" },
  { name: "pay", path: "/pay", auth: true, why: "Abonelik ve fiyat (satın alma yolu)" },
];

const NETWORK = { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8, connectionType: "cellular4g" };

const OBSERVERS = () => {
  window.__perf = { lcp: 0, cls: 0, tbt: 0 };
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__perf.tbt += Math.max(0, e.duration - 50); }).observe({ type: "longtask", buffered: true });
  } catch {}
};

async function measureOnce(browser, route) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    ...(route.auth ? { storageState: AUTH } : {}),
  });
  await context.addInitScript(OBSERVERS);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", NETWORK);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const types = new Map();
  const bytes = { js: 0, css: 0, total: 0 };
  cdp.on("Network.responseReceived", (e) => types.set(e.requestId, e.type));
  cdp.on("Network.loadingFinished", (e) => {
    const t = types.get(e.requestId);
    bytes.total += e.encodedDataLength;
    if (t === "Script") bytes.js += e.encodedDataLength;
    if (t === "Stylesheet") bytes.css += e.encodedDataLength;
  });
  try {
    const response = await page.goto(route.path, { waitUntil: "load", timeout: 180_000 });
    const finalPath = new URL(page.url()).pathname;
    await page.waitForTimeout(3_000);
    const perf = await page.evaluate(() => ({ ...window.__perf, dom: document.querySelectorAll("*").length }));
    return { status: response?.status() ?? null, finalPath, lcp: Math.round(perf.lcp), cls: Number(perf.cls.toFixed(4)), tbt: Math.round(perf.tbt), js: bytes.js, css: bytes.css, total: bytes.total, dom: perf.dom };
  } finally {
    await context.close();
  }
}

const median = (values) => {
  const v = values.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Number(((v[mid - 1] + v[mid]) / 2).toFixed(4));
};

const browser = await chromium.launch();
const routes = [];
for (const route of PERF_ROUTES) {
  if (route.auth && !fs.existsSync(AUTH)) throw new Error("tests/.auth/e2e-plus.json yok: npm run e2e:seed && npm run e2e:login");
  for (let i = 0; i < WARM; i += 1) await measureOnce(browser, route).catch(() => null);
  const runs = [];
  for (let i = 0; i < RUNS; i += 1) runs.push(await measureOnce(browser, route).catch((e) => ({ error: String(e.message).slice(0, 160) })));
  const ok = runs.filter((r) => !r.error);
  const med = Object.fromEntries(["lcp", "cls", "tbt", "js", "css", "total", "dom"].map((k) => [k, median(ok.map((r) => r[k]))]));
  const redirected = ok.find((r) => r.finalPath && r.finalPath !== route.path.split("?")[0]);
  routes.push({ name: route.name, path: route.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id"), why: route.why, status: ok[0]?.status ?? null, ...(redirected ? { redirectedTo: redirected.finalPath } : {}), median: med, runs });
  console.log(`  ${route.name.padEnd(11)} LCP ${med.lcp} ms · CLS ${med.cls} · TBT ${med.tbt} ms · JS ${Math.round((med.js ?? 0) / 1024)} KB · CSS ${Math.round((med.css ?? 0) / 1024)} KB · DOM ${med.dom}${redirected ? ` (→ ${redirected.finalPath})` : ""}`);
}
await browser.close();

const out = path.join(ROOT, "docs/design-migration/perf", `${LABEL}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ label: LABEL, measuredAt: new Date().toISOString(), profile: { viewport: "375x812", cpu: "4x", network: "Hızlı 4G (60 ms, 9/1.5 Mbit)", warm: WARM, runs: RUNS }, routes }, null, 1)}\n`);
console.log(`yazıldı: ${path.relative(ROOT, out)}`);
