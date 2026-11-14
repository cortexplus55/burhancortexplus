#!/usr/bin/env node
/**
 * Production duman testi (OTONOM §4): yalnız okur. Ödeme, model çağrısı, hesap oluşturma YOK.
 *
 *   node scripts/smoke-prod.mjs                          # https://cortexplus.app, oturumsuz rotalar
 *   node scripts/smoke-prod.mjs --auth                   # + e2e-plus ile salt-okur girişli sayfalar
 *   node scripts/smoke-prod.mjs --base https://... --expect-duel-404
 *
 * Denetler: beklenen durum kodu, `<html lang="tr">`, konsol hatası, aynı kökenden başarısız ya da 5xx istek.
 * Girişli adım hazırlığı olan test hesabıyla ana ekranı ve hazırlık sayfasını AÇMAZ: hazırlık sayfası açılınca sıradaki
 * ders arka planda yazılır (gerçek model çağrısı, maliyet; 06 §12, 05). Yalnız salt-okur sayfalar.
 * Çıkış kodu: 0 hepsi geçti, 1 en az bir rota düştü.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const BASE = opt("base", "https://cortexplus.app").replace(/\/$/, "");
const AUTH = argv.includes("--auth");
const HOST = new URL(BASE).hostname;

/** [yol, beklenen son durum, açıklama]. Korunan yol oturumsuz girişe yönlenir (son durum 200, son yol /giris). */
const GUEST = [
  ["/", 200, "ana sayfa"],
  ["/giris", 200, "giriş"],
  ["/kayit", 200, "kayıt"],
  ["/pay", 200, "/pay (oturumsuz: girişe yönlenir)"],
  ["/d/ZZZZZZZZ", 404, "düello bağlantısı (bayrak kapalıyken 404)"],
  ["/robots.txt", 200, "robots.txt"],
  ["/bu-sayfa-yok-smoke", 404, "bulunamadı"],
];
const SIGNED_IN = [
  ["/krediler", 200, "kullanım limitleri"],
  ["/ayarlar", 200, "ayarlar"],
  ["/profil", 200, "profil"],
  ["/araclar", 200, "çalışma stüdyosu"],
];

async function check(browser, [route, expected, label], storageState) {
  const context = await browser.newContext({ baseURL: BASE, ...(storageState ? { storageState } : {}) });
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e.message).slice(0, 160)}`));
  page.on("requestfailed", (r) => {
    if (new URL(r.url()).hostname === HOST && !/aborted|ERR_ABORTED/.test(r.failure()?.errorText ?? "")) failed.push(`${r.failure()?.errorText} ${new URL(r.url()).pathname}`);
  });
  page.on("response", (r) => {
    if (new URL(r.url()).hostname === HOST && r.status() >= 500) failed.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  try {
    const response = await page.goto(route, { waitUntil: "load", timeout: 60_000 });
    await page.waitForTimeout(2_000);
    const status = response?.status() ?? 0;
    const isText = route.endsWith(".txt");
    const lang = isText ? "tr" : await page.evaluate(() => document.documentElement.lang);
    // 404 sayfasının kendi isteği (ve bilinçli 404 rota) hata sayılmaz.
    const consoleErrors = errors.filter((e) => !(expected === 404 && /404|Not Found/i.test(e)));
    const problems = [];
    if (status !== expected) problems.push(`durum ${status} (beklenen ${expected})`);
    if (lang !== "tr") problems.push(`lang="${lang}"`);
    if (consoleErrors.length) problems.push(`konsol: ${consoleErrors.slice(0, 2).join(" | ")}`);
    if (failed.length) problems.push(`istek: ${failed.slice(0, 2).join(" | ")}`);
    return { route, label, ok: problems.length === 0, status, final: new URL(page.url()).pathname, problems };
  } catch (error) {
    return { route, label, ok: false, problems: [String(error.message).slice(0, 160)] };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch();
const results = [];
for (const item of GUEST) results.push(await check(browser, item));
if (AUTH) {
  execFileSync(process.execPath, [path.join("scripts", "e2e-login.mjs"), "--only=e2e-plus"], { stdio: "inherit", env: { ...process.env, E2E_BASE_URL: BASE } });
  const state = path.join(ROOT, "tests/.auth", HOST, "e2e-plus.json");
  if (!fs.existsSync(state)) results.push({ route: "(giriş)", label: "e2e-plus", ok: false, problems: ["giriş durumu yazılamadı"] });
  else for (const item of SIGNED_IN) results.push(await check(browser, item, state));
}
await browser.close();

for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.route.padEnd(20)} ${String(r.status ?? "-").padEnd(4)} ${r.label}${r.ok ? "" : ` → ${r.problems.join("; ")}`}`);
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? `\n${bad} rota düştü.` : `\nProduction duman testi geçti (${results.length} rota, ${BASE}).`);
process.exit(bad ? 1 : 0);
