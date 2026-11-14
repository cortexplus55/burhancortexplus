#!/usr/bin/env node
/**
 * E2E test hesaplarının giriş durumları (Faz 0, 2.5): her hesap bir kez giriş yapar, oturum
 * `tests/.auth/<kullanıcı>.json` olarak saklanır (gitignore). Adımlar `tests/e2e/auth.setup.ts` ile aynı: giriş formu,
 * eksik metin onayı okuma kanıtıyla (`/api/consent/accept`), çerez tercihi (analitik kapalı).
 *
 *   node scripts/seed-e2e-users.mjs     # önce hesaplar (parolalar tests/.auth/e2e-users.local.json)
 *   node scripts/e2e-login.mjs          # yerel sunucuya (http://127.0.0.1:3005) karşı
 *   E2E_BASE_URL=https://… node scripts/e2e-login.mjs --only=e2e-plus   # başka adres: tests/.auth/<host>/<kullanıcı>.json
 *
 * Parola ekrana ya da kayda yazılmaz; hata iletisinde yalnız adres yolu ve ekrandaki uyarı olur.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const ROOT = process.cwd();
const BASE = (process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3005").replace(/\/$/, "");
const HOST = new URL(BASE).hostname;
const LOCAL = HOST === "127.0.0.1" || HOST === "localhost";
const OUT_DIR = path.join(ROOT, "tests/.auth", LOCAL ? "" : HOST);
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").map((s) => s.trim()).filter(Boolean);

const secrets = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "tests/.auth/e2e-users.local.json"), "utf8")).users ?? {};
  } catch {
    return null;
  }
})();
if (!secrets || !Object.keys(secrets).length) {
  console.error("tests/.auth/e2e-users.local.json yok; önce node scripts/seed-e2e-users.mjs çalıştırın.");
  process.exit(2);
}

const policy = /COOKIE_POLICY_VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "src/lib/legal/versions.ts"), "utf8"))?.[1];
const consentCookie = {
  name: "cp_consent",
  value: encodeURIComponent(JSON.stringify({ v: policy, a: false, t: Date.now(), id: "00000000-0000-4000-8000-000000000e2e" })),
  domain: HOST,
  path: "/",
  expires: Math.floor(Date.now() / 1000) + 30 * 86_400,
  httpOnly: false,
  secure: !LOCAL,
  sameSite: "Lax",
};

async function reachable() {
  try {
    const response = await fetch(`${BASE}/giris`, { redirect: "manual" });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function login(browser, name, { email, password }) {
  const context = await browser.newContext({ baseURL: BASE });
  await context.addCookies([consentCookie]);
  const page = await context.newPage();
  try {
    await page.goto("/giris?next=/ogretmen", { timeout: 120_000 });
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Giriş yap" }).click();
    const landed = await page
      .waitForURL((url) => url.pathname.startsWith("/ogretmen") || url.pathname.startsWith("/onboarding"), { timeout: 90_000 })
      .then(() => true)
      .catch(() => false);
    if (!landed) {
      const notices = await page.locator("[data-sonner-toast], [role='status'], [role='alert']").allInnerTexts().catch(() => []);
      throw new Error(`giriş tamamlanmadı (adres ${new URL(page.url()).pathname}; uyarı: ${notices.map((t) => t.trim()).filter(Boolean).join(" | ") || "yok"})`);
    }
    if (new URL(page.url()).pathname.startsWith("/onboarding")) throw new Error("kuruluma yönlendi (profil eksik: tohum betiğini yeniden çalıştırın)");

    const now = new Date();
    const evidence = (version) => ({ version, openedAt: new Date(now.getTime() - 60_000).toISOString(), confirmedAt: now.toISOString(), scrolledToEnd: true });
    const status = await page.request.get("/api/consent/status");
    if (status.ok()) {
      const body = await status.json();
      if (body.ok && (body.missing?.length || body.ageNeeded)) {
        const documents = Object.fromEntries((body.missing ?? []).map((item) => [item.type, evidence(item.version)]));
        const accepted = await page.request.post("/api/consent/accept", {
          data: { documents, ...(body.ageNeeded ? { age: { minor: false, guardianAck: false } } : {}) },
        });
        if (!accepted.ok()) throw new Error(`metin onayı yazılamadı (${accepted.status()})`);
      }
    }
    await context.addCookies([consentCookie]);
    /*
      İlk ziyaretteki "Seri" penceresi (gamification.tsx) her temiz tarayıcıda sayfanın üstüne çıkar ve ölçümü kirletir
      (marka düğmesi, 20 px'lik bağlantı). Öğrencinin "Devam et"i aynı anahtarı yazar; oturum dosyası onunla saklanır.
    */
    await page.evaluate(() => localStorage.setItem("cortex-gamification-v1", "1"));
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await context.storageState({ path: path.join(OUT_DIR, `${name}.json`) });
  } finally {
    await context.close();
  }
}

if (!(await reachable())) {
  console.error(`${BASE} açılmıyor. Yerel sunucu: npx next dev -p 3005 (ya da başlatma ayarı cortex-plus-fikstur).`);
  process.exit(2);
}
const browser = await chromium.launch();
let failed = 0;
for (const [name, account] of Object.entries(secrets)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  try {
    await login(browser, name, account);
    console.log(`  ${name}: oturum yazıldı`);
  } catch (error) {
    failed += 1;
    console.error(`  ${name}: ${error.message}`);
  }
}
await browser.close();
console.log(`Giriş durumları: ${path.relative(ROOT, OUT_DIR) || "tests/.auth"}/<kullanıcı>.json (gitignore).`);
process.exit(failed ? 1 : 0);
