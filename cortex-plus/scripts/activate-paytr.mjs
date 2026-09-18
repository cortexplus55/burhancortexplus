#!/usr/bin/env node
/**
 * PayTR'ı tek komutla canlıya alır.
 *
 * Kullanım:
 *   VERCEL_TOKEN=... \
 *   PAYTR_MERCHANT_ID=... PAYTR_MERCHANT_KEY=... PAYTR_MERCHANT_SALT=... \
 *   node scripts/activate-paytr.mjs
 *
 * Adımlar (herhangi biri düşerse sonrakine geçilmez):
 *  1. Anahtar biçimi ve 710114 (tusaicortex) koruması
 *  2. PayTR'dan gerçek `get-token` — mağazanın canlı olduğunun kanıtı
 *  3. Anahtarları Vercel'e yaz (production + preview + development)
 *  4. Production'ı yeniden dağıt — env değişkeni dağıtım olmadan etkimez
 *  5. Dağıtım READY olana kadar bekle
 *  6. Canlıdan doğrula: callback imzası ve /fiyatlandirma butonları
 *
 * `--dry-run` 3. adımdan itibaren hiçbir şey yazmaz, yalnızca ne yapacağını söyler.
 * Hiçbir adım karttan para çekmez. Anahtarlar ekrana basılmaz.
 */
import crypto from "node:crypto";
import { buildBasket, paytrTokenHash, callbackHash } from "./verify-paytr.mjs";

const TEAM_SLUG = "cortexplus55";
const PROJECT = "burhancortexplus-app";
const TUSAICORTEX_STORE = "710114";
const ORIGIN = (process.env.PAYTR_VERIFY_ORIGIN?.trim() || "https://cortexplus.app").replace(/\/$/, "");
const CALLBACK_PATH = "/api/payments/paytr/callback";
const dryRun = process.argv.includes("--dry-run");

const step = (n, label) => console.log(`\n[${n}/6] ${label}`);
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
  console.error(`  ✗ ${m}`);
  process.exit(1);
};
const info = (m) => console.log(`  • ${m}`);

async function dispatcher() {
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (!proxy) return {};
  try {
    const { ProxyAgent } = await import("undici");
    return { dispatcher: new ProxyAgent(proxy) };
  } catch {
    return {};
  }
}

const merchantId = process.env.PAYTR_MERCHANT_ID?.trim() ?? "";
const merchantKey = process.env.PAYTR_MERCHANT_KEY?.trim() ?? "";
const merchantSalt = process.env.PAYTR_MERCHANT_SALT?.trim() ?? "";
const testMode = process.env.PAYTR_TEST_MODE?.trim() ?? "0";
const noInstallment = process.env.PAYTR_NO_INSTALLMENT?.trim() ?? "0";
const maxInstallment = process.env.PAYTR_MAX_INSTALLMENT?.trim() ?? "0";
const vercelToken = process.env.VERCEL_TOKEN?.trim() ?? "";

console.log("PayTR aktivasyonu");
console.log(`Proje: ${TEAM_SLUG}/${PROJECT}  →  ${ORIGIN}`);
console.log(`Test modu: ${testMode === "1" ? "AÇIK — gerçek para çekilmez" : "kapalı — gerçek ödeme alınır"}`);
if (dryRun) console.log("DRY RUN: hiçbir şey yazılmayacak.");

const opts = await dispatcher();

// ---------------------------------------------------------------- 1
step(1, "Anahtarlar");
{
  const missing = [
    !merchantId && "PAYTR_MERCHANT_ID",
    !merchantKey && "PAYTR_MERCHANT_KEY",
    !merchantSalt && "PAYTR_MERCHANT_SALT",
  ].filter(Boolean);
  if (missing.length) bad(`eksik: ${missing.join(", ")}`);
  if (merchantId === TUSAICORTEX_STORE) {
    bad(`${TUSAICORTEX_STORE} tusaicortex.com mağazası — cortexplus.app'in kendi anahtarları gerekli`);
  }
  if (!/^\d{5,8}$/.test(merchantId)) bad(`mağaza no sayı olmalı, gelen uzunluk: ${merchantId.length}`);
  if (merchantKey.length < 8 || merchantSalt.length < 8) bad("merchant key/salt fazla kısa — eksik kopyalanmış olabilir");
  ok(`mağaza ${merchantId}, key ${merchantKey.length} karakter, salt ${merchantSalt.length} karakter`);
}

// ---------------------------------------------------------------- 2
step(2, "PayTR mağazası canlı mı (gerçek get-token)");
{
  const basket = buildBasket("Cortex Plus aktivasyon", 100);
  const oid = `cpactivate${crypto.randomBytes(8).toString("hex")}`;
  const token = paytrTokenHash({
    merchantId, merchantKey, merchantSalt,
    userIp: "127.0.0.1", merchantOid: oid,
    email: "cortexplus@cortexplus.app", amountKurus: 100,
    basket, noInstallment, maxInstallment, currency: "TL", testMode,
  });
  const body = new URLSearchParams({
    merchant_id: merchantId, user_ip: "127.0.0.1", merchant_oid: oid,
    email: "cortexplus@cortexplus.app", payment_amount: "100",
    paytr_token: token, user_basket: basket, debug_on: "1",
    no_installment: noInstallment, max_installment: maxInstallment,
    user_name: "Cortex Plus aktivasyon", user_address: "Cortex Plus",
    user_phone: "0000000000",
    merchant_ok_url: `${ORIGIN}/odeme/basarili`,
    merchant_fail_url: `${ORIGIN}/odeme/basarisiz`,
    timeout_limit: "30", currency: "TL", test_mode: testMode,
  });

  let payload;
  try {
    const res = await fetch("https://www.paytr.com/odeme/api/get-token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(), cache: "no-store", ...opts,
    });
    payload = await res.json();
  } catch (err) {
    bad(`PayTR'a ulaşılamadı: ${String(err?.message ?? err).slice(0, 140)}`);
  }
  if (payload.status !== "success" || !payload.token) {
    bad(`PayTR reddetti: ${payload.reason ?? JSON.stringify(payload)}`);
  }
  ok("mağaza canlı, token alındı — anahtarlar doğru");
}

// ---------------------------------------------------------------- 3
step(3, "Anahtarları Vercel'e yaz");
if (!vercelToken && !dryRun) {
  bad("VERCEL_TOKEN yok. Vercel → Account Settings → Tokens → Create Token (scope: cortexplus55)");
}
if (dryRun) {
  info("dry run: PAYTR_MERCHANT_ID / _KEY / _SALT encrypted olarak yazılacaktı");
} else {
  const envBody = [
    ["PAYTR_MERCHANT_ID", merchantId],
    ["PAYTR_MERCHANT_KEY", merchantKey],
    ["PAYTR_MERCHANT_SALT", merchantSalt],
    ["PAYTR_TEST_MODE", testMode],
  ].map(([key, value]) => ({
    key, value, type: "encrypted",
    target: ["production", "preview", "development"],
  }));

  const res = await fetch(
    `https://api.vercel.com/v10/projects/${PROJECT}/env?slug=${TEAM_SLUG}&upsert=true`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${vercelToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(envBody), ...opts,
    },
  );
  if (!res.ok) bad(`Vercel env hatası ${res.status}: ${(await res.text()).slice(0, 300)}`);
  ok(`${envBody.length} değişken yazıldı (encrypted)`);
}

// ---------------------------------------------------------------- 4
step(4, "Production'ı yeniden dağıt");
let deploymentId = null;
if (dryRun) {
  info("dry run: son production dağıtımı yeniden tetiklenecekti");
} else {
  const listRes = await fetch(
    `https://api.vercel.com/v6/deployments?app=${PROJECT}&target=production&limit=1&slug=${TEAM_SLUG}`,
    { headers: { Authorization: `Bearer ${vercelToken}` }, ...opts },
  );
  if (!listRes.ok) bad(`dağıtım listesi alınamadı ${listRes.status}: ${(await listRes.text()).slice(0, 200)}`);
  const latest = (await listRes.json()).deployments?.[0];
  if (!latest?.uid) bad("production dağıtımı bulunamadı");
  info(`son dağıtım: ${latest.uid}`);

  const redeployRes = await fetch(`https://api.vercel.com/v13/deployments?slug=${TEAM_SLUG}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${vercelToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: PROJECT, deploymentId: latest.uid, target: "production" }),
    ...opts,
  });
  if (!redeployRes.ok) bad(`yeniden dağıtım hatası ${redeployRes.status}: ${(await redeployRes.text()).slice(0, 300)}`);
  deploymentId = (await redeployRes.json()).id;
  ok(`yeni dağıtım başladı: ${deploymentId}`);
}

// ---------------------------------------------------------------- 5
step(5, "Dağıtım hazır olana kadar bekle");
if (dryRun || !deploymentId) {
  info("dry run: beklenmedi");
} else {
  const deadline = Date.now() + 10 * 60 * 1000;
  let state = "QUEUED";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10_000));
    const res = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}?slug=${TEAM_SLUG}`, {
      headers: { Authorization: `Bearer ${vercelToken}` }, ...opts,
    });
    if (!res.ok) continue;
    state = (await res.json()).readyState ?? state;
    info(`durum: ${state}`);
    if (state === "READY") break;
    if (state === "ERROR" || state === "CANCELED") bad(`dağıtım ${state}`);
  }
  if (state !== "READY") bad("dağıtım 10 dakikada hazır olmadı");
  ok("dağıtım READY");
}

// ---------------------------------------------------------------- 6
step(6, "Canlıdan doğrula");
{
  const probeOid = `cpverify${crypto.randomBytes(10).toString("hex")}`;
  const signed = callbackHash({
    merchantKey, merchantSalt, merchantOid: probeOid,
    status: "success", totalAmount: "100",
  });

  // Doğru imzalı ama var olmayan sipariş: INVALID'i geçip RETRY almalı.
  // RETRY, canlıdaki anahtarların buradakiyle aynı olduğunu kanıtlar.
  try {
    const res = await fetch(`${ORIGIN}${CALLBACK_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        merchant_oid: probeOid, status: "success",
        total_amount: "100", hash: signed,
      }).toString(),
      ...opts,
    });
    const text = (await res.text()).trim();
    if (text === "RETRY") ok("callback imzası doğrulandı — canlı anahtarlar eşleşiyor");
    else if (text === "INVALID") bad("canlı anahtarlar eşleşmiyor — dağıtım env'i almamış olabilir");
    else info(`beklenmedik callback yanıtı: HTTP ${res.status} ${text}`);
  } catch (err) {
    info(`callback yoklanamadı: ${String(err?.message ?? err).slice(0, 140)}`);
  }

  try {
    const res = await fetch(`${ORIGIN}/fiyatlandirma`, { ...opts });
    const html = await res.text();
    const soon = (html.match(/Yakında/g) ?? []).length;
    if (soon === 0) ok("/fiyatlandirma artık 'Yakında' demiyor — satın alma açık");
    else bad(`/fiyatlandirma'da ${soon} kez 'Yakında' — isPaytrConfigured() hâlâ false`);
  } catch (err) {
    info(`/fiyatlandirma okunamadı: ${String(err?.message ?? err).slice(0, 140)}`);
  }
}

console.log("");
if (dryRun) {
  console.log("DRY RUN bitti. Gerçek çalıştırma için --dry-run'ı kaldırın.");
} else {
  console.log("PayTR canlı.");
  console.log(`Son elle adım: PayTR panelinde Bildirim URL = ${ORIGIN}${CALLBACK_PATH}`);
  if (testMode === "1") {
    console.log("UYARI: PAYTR_TEST_MODE=1 — butonlar canlı görünür ama para çekilmez.");
    console.log("Testi bitirince PAYTR_TEST_MODE=0 ile bu komutu tekrar çalıştırın.");
  }
}
