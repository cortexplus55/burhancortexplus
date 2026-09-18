#!/usr/bin/env node
/**
 * PayTR bağlantı doğrulaması — mağaza anahtarları geldikten sonra tek komutla
 * uçtan uca kontrol.
 *
 * Kullanım:
 *   npx dotenv -e .env.local -- node scripts/verify-paytr.mjs
 *
 * Anahtarları terminale yapıştırmayın; `.env.local` kullanın.
 *
 * Hiçbir kontrol para çekmez:
 *  - `get-token` yalnızca ödeme oturumu açar, kart görmez;
 *  - callback yoklaması var olmayan bir sipariş sorar, işlem geri alınır.
 *
 * İmza mantığının kaynağı `src/lib/payments/paytr.ts`. Buradaki kopya
 * `tests/unit/paytr.test.ts` içinde o dosyaya karşı sabitlenir — biri
 * değişirse test kırılır.
 */
import crypto from "node:crypto";

const TUSAICORTEX_STORE = "710114";
const CALLBACK_PATH = "/api/payments/paytr/callback";
const DEFAULT_ORIGIN = "https://cortexplus.app";

/** iFrame token imzası: alan sırası PayTR tarafından sabittir. */
export function paytrTokenHash({
  merchantId,
  merchantKey,
  merchantSalt,
  userIp,
  merchantOid,
  email,
  amountKurus,
  basket,
  noInstallment,
  maxInstallment,
  currency,
  testMode,
}) {
  const hashStr = [
    merchantId,
    userIp,
    merchantOid,
    email,
    String(amountKurus),
    basket,
    noInstallment,
    maxInstallment,
    currency,
    testMode,
  ].join("");
  return crypto
    .createHmac("sha256", merchantKey)
    .update(hashStr + merchantSalt)
    .digest("base64");
}

/** Bildirim imzası: merchant_oid + salt + status + total_amount. */
export function callbackHash({
  merchantKey,
  merchantSalt,
  merchantOid,
  status,
  totalAmount,
}) {
  return crypto
    .createHmac("sha256", merchantKey)
    .update(merchantOid + merchantSalt + status + totalAmount)
    .digest("base64");
}

export function buildBasket(productName, amountKurus) {
  return Buffer.from(
    JSON.stringify([[productName, (amountKurus / 100).toFixed(2), 1]]),
  ).toString("base64");
}

/** Agent proxy arkasındaysak undici'yi ona yönlendir. */
async function fetchOptions() {
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (!proxy) return {};
  try {
    const { ProxyAgent } = await import("undici");
    return { dispatcher: new ProxyAgent(proxy) };
  } catch {
    return {};
  }
}

const results = [];
function record(ok, label, detail) {
  results.push({ ok, label, detail });
  const mark = ok === true ? "✓" : ok === false ? "✗" : "•";
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const merchantId = process.env.PAYTR_MERCHANT_ID?.trim() ?? "";
  const merchantKey = process.env.PAYTR_MERCHANT_KEY?.trim() ?? "";
  const merchantSalt = process.env.PAYTR_MERCHANT_SALT?.trim() ?? "";
  const testMode = process.env.PAYTR_TEST_MODE?.trim() ?? "1";
  const noInstallment = process.env.PAYTR_NO_INSTALLMENT?.trim() ?? "0";
  const maxInstallment = process.env.PAYTR_MAX_INSTALLMENT?.trim() ?? "0";
  const origin = (process.env.PAYTR_VERIFY_ORIGIN?.trim() || DEFAULT_ORIGIN)
    .replace(/\/$/, "");

  console.log("PayTR bağlantı doğrulaması");
  console.log(`Hedef: ${origin}${CALLBACK_PATH}`);
  console.log(`Test modu: ${testMode === "1" ? "açık (test_mode=1)" : "KAPALI — gerçek para"}`);
  console.log("");

  // 1) Anahtarlar var mı?
  const missing = [
    !merchantId && "PAYTR_MERCHANT_ID",
    !merchantKey && "PAYTR_MERCHANT_KEY",
    !merchantSalt && "PAYTR_MERCHANT_SALT",
  ].filter(Boolean);

  if (missing.length) {
    record(false, "Anahtarlar", `eksik: ${missing.join(", ")}`);
    console.log("");
    console.log("PayTR panelinde: Mağazalar → cortexplus.app → Entegrasyon Bilgileri.");
    console.log("Üç değeri .env.local'a yazın, sonra bu komutu tekrar çalıştırın.");
    process.exit(1);
  }
  record(true, "Anahtarlar", "üçü de tanımlı");

  // 2) Yanlış mağazanın anahtarları mı? 710114 tusaicortex.com'a ait.
  if (merchantId === TUSAICORTEX_STORE) {
    record(
      false,
      "Mağaza no",
      `${TUSAICORTEX_STORE} tusaicortex.com mağazası — cortexplus.app için ek mağazanın anahtarları gerekli`,
    );
    process.exit(1);
  }
  record(true, "Mağaza no", `${merchantId} (tusaicortex mağazası değil)`);

  // 3) İmza gidiş-dönüşü — ağ gerektirmez.
  const probeOid = `cpverify${crypto.randomBytes(10).toString("hex")}`;
  const signed = callbackHash({
    merchantKey,
    merchantSalt,
    merchantOid: probeOid,
    status: "success",
    totalAmount: "100",
  });
  const roundTrip =
    callbackHash({
      merchantKey,
      merchantSalt,
      merchantOid: probeOid,
      status: "success",
      totalAmount: "100",
    }) === signed;
  record(roundTrip, "Bildirim imzası", roundTrip ? "HMAC tutarlı" : "HMAC tutarsız");

  // 4) PayTR gerçekten token veriyor mu? Anahtarların ve mağazanın canlı
  //    olduğunun tek kesin kanıtı bu.
  const basket = buildBasket("Cortex Plus dogrulama", 100);
  const tokenOid = `cpverify${crypto.randomBytes(10).toString("hex")}`;
  const token = paytrTokenHash({
    merchantId,
    merchantKey,
    merchantSalt,
    userIp: "127.0.0.1",
    merchantOid: tokenOid,
    email: "cortexplus@cortexplus.app",
    amountKurus: 100,
    basket,
    noInstallment,
    maxInstallment,
    currency: "TL",
    testMode,
  });

  const params = new URLSearchParams({
    merchant_id: merchantId,
    user_ip: "127.0.0.1",
    merchant_oid: tokenOid,
    email: "cortexplus@cortexplus.app",
    payment_amount: "100",
    paytr_token: token,
    user_basket: basket,
    debug_on: "1",
    no_installment: noInstallment,
    max_installment: maxInstallment,
    user_name: "Cortex Plus dogrulama",
    user_address: "Cortex Plus",
    user_phone: "0000000000",
    merchant_ok_url: `${origin}/odeme/basarili`,
    merchant_fail_url: `${origin}/odeme/basarisiz`,
    timeout_limit: "30",
    currency: "TL",
    test_mode: testMode,
  });

  const opts = await fetchOptions();
  try {
    const res = await fetch("https://www.paytr.com/odeme/api/get-token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      cache: "no-store",
      ...opts,
    });
    const payload = await res.json();
    if (payload.status === "success" && payload.token) {
      record(true, "PayTR get-token", "mağaza canlı, token alındı");
    } else {
      record(false, "PayTR get-token", `reddedildi: ${payload.reason ?? JSON.stringify(payload)}`);
    }
  } catch (err) {
    record(null, "PayTR get-token", `ulaşılamadı: ${(err?.message ?? err).toString().slice(0, 120)}`);
  }

  // 5) Canlı callback ucu: bozuk imza INVALID almalı.
  try {
    const res = await fetch(`${origin}${CALLBACK_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        merchant_oid: probeOid,
        status: "success",
        total_amount: "100",
        hash: "bozuk",
      }).toString(),
      ...opts,
    });
    const body = (await res.text()).trim();
    const ok = res.status === 400 && body === "INVALID";
    record(ok, "Callback — bozuk imza", `HTTP ${res.status} ${body} ${ok ? "(doğru: reddetti)" : "(INVALID beklenirdi)"}`);
  } catch (err) {
    record(null, "Callback — bozuk imza", `ulaşılamadı: ${(err?.message ?? err).toString().slice(0, 120)}`);
  }

  // 6) Doğru imzalı ama var olmayan sipariş: INVALID'i geçip RETRY almalı.
  //    RETRY, Vercel'deki anahtarların buradakilerle aynı olduğunu kanıtlar;
  //    sipariş bulunamadığı için veritabanı işlemi geri alınır.
  try {
    const res = await fetch(`${origin}${CALLBACK_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        merchant_oid: probeOid,
        status: "success",
        total_amount: "100",
        hash: signed,
      }).toString(),
      ...opts,
    });
    const body = (await res.text()).trim();
    if (res.status === 500 && body === "RETRY") {
      record(true, "Callback — Vercel anahtarları", "imza doğrulandı, anahtarlar eşleşiyor");
    } else if (body === "INVALID") {
      record(
        false,
        "Callback — Vercel anahtarları",
        "imza reddedildi: Vercel'deki PAYTR_MERCHANT_KEY/SALT buradakinden farklı ya da tanımsız",
      );
    } else {
      record(null, "Callback — Vercel anahtarları", `beklenmedik yanıt: HTTP ${res.status} ${body}`);
    }
  } catch (err) {
    record(null, "Callback — Vercel anahtarları", `ulaşılamadı: ${(err?.message ?? err).toString().slice(0, 120)}`);
  }

  console.log("");
  const failed = results.filter((r) => r.ok === false);
  const unknown = results.filter((r) => r.ok === null);
  if (failed.length) {
    console.log(`SONUÇ: ${failed.length} kontrol başarısız — ödeme akışı henüz açılmamalı.`);
    process.exit(1);
  }
  if (unknown.length) {
    console.log(`SONUÇ: ${unknown.length} kontrol yapılamadı (ağ). Kalanlar geçti.`);
    process.exit(2);
  }
  console.log("SONUÇ: bağlantı hazır. PAYTR_TEST_MODE=1 ile test kartından bir ödeme deneyin,");
  console.log("ardından PAYTR_TEST_MODE=0 yapıp /fiyatlandirma butonlarının 'Yakında' olmadığını görün.");
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  await main();
}
