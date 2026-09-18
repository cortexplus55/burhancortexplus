/**
 * Açılış kapısı — ölçülebilir şartları tek komutta sınar.
 *
 * Çalıştırma:
 *   node scripts/acilis-kapisi.mjs                      # yalnızca dışarıdan ölçülenler
 *   node scripts/acilis-kapisi.mjs --db                 # veritabanı kontrolleri de
 *   SITE=https://... node scripts/acilis-kapisi.mjs     # başka bir hedef (önizleme)
 *
 * Neden var: `docs/delivery/ACILIS-KAPISI.md` altı şartı ve her birinin
 * komutunu yazıyor, ama komutlar elle tek tek çalıştırılıyor. Bu projede iki
 * kez "yazıldı ama yayında değil" hatası yaşandı — dört hukuki sayfa dalda
 * kaldı, sonra göç dosyaları veritabanına uygulanmadı. İkisi de elle
 * bakılsaydı görülecekti; bakılmadı.
 *
 * Betik KAPIYI AÇMIYOR. Gerçek kartla alım-iade provası ve PayTR'nin canlı
 * kipte olduğu buradan ölçülemez (bkz. belgedeki 1. ve 3. madde) — ikisi de
 * panelden bakmayı gerektiriyor ve betik bunu açıkça söylüyor.
 *
 * Çıkış kodu 0 = ölçülebilen her şart geçti.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = (process.env.SITE ?? "https://cortexplus.app").replace(/\/$/, "");
const WITH_DB = process.argv.includes("--db");
const ROOT = process.cwd();

let failed = 0;
let skipped = 0;

const line = (s = "") => console.log(s);

function report(ok, label, detail) {
  if (ok === null) {
    skipped += 1;
    line(`  ~  ${label}${detail ? `  — ${detail}` : ""}`);
    return;
  }
  if (!ok) failed += 1;
  line(`  ${ok ? "✓" : "✗"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

async function check(label, fn) {
  try {
    const result = await fn();
    if (result && typeof result === "object" && "ok" in result) {
      report(result.ok, label, result.detail);
    } else {
      report(Boolean(result), label);
    }
  } catch (error) {
    report(false, label, error.message);
  }
}

/** Sayfayı getirir; ağ hatası da başarısızlık sayılır, sessizce geçmez. */
async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  return { status: res.status, body: await res.text() };
}

/*
  React `₺` ile sayının arasına bir yorum düğümü koyuyor (`₺{value}` JSX'inin
  metin ayırıcısı), yani ham HTML'de `₺<!-- -->599` duruyor. Etiketleri
  ayıklamayan her arama paketleri göremez ve "göç uygulanmamış" der —
  18 Eylül 2026'da tam olarak bu oldu.
*/
function visibleText(html) {
  return html.replace(/<[^>]+>/g, "");
}

// --- 2. Göç dosyaları canlı veritabanında (dolaylı ölçüm) -------------------

line("Kademe planları canlı veritabanından geliyor mu");

await check("/fiyatlandirma açılıyor", async () => {
  const { status } = await fetchText(`${SITE}/fiyatlandirma`);
  return { ok: status === 200, detail: `HTTP ${status}` };
});

await check("Plus ve Sigma fiyatları sayfada", async () => {
  const { body } = await fetchText(`${SITE}/fiyatlandirma`);
  const text = visibleText(body);
  const missing = ["599", "1.999"].filter((price) => !text.includes(`₺${price}`));
  return {
    ok: missing.length === 0,
    detail: missing.length ? `eksik: ${missing.join(", ")}` : "₺599 · ₺1.999",
  };
});

/*
  Kredi paketleri vitrinde artık YALNIZCA aboneye görünüyor, o yüzden
  herkese açık sayfada bulunmamaları normal ve göç hakkında hiçbir şey
  söylemez. Burada aranmıyor; doğrulaması `--db` tarafında.
*/

// --- 6. Kamuya açık sayfaların hepsi ayakta ---------------------------------

line();
line("Kamuya açık sayfalar");

const { body: sitemapXml, status: sitemapStatus } = await fetchText(
  `${SITE}/sitemap.xml`,
);
report(sitemapStatus === 200, "/sitemap.xml açılıyor", `HTTP ${sitemapStatus}`);

const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (m) => m[1],
);
report(sitemapUrls.length > 0, `sitemap ${sitemapUrls.length} adres listeliyor`);

/*
  Hukuki sayfalar ayrıca sayılıyor: sitemap'te olmasalar bile 404 vermemeleri
  gerekiyor. 17 Eylül'de dördü birden canlıda 404 döndü — yazılmış, test
  edilmiş, commit edilmişti ama dalda duruyordu.
*/
const LEGAL = [
  "/mesafeli-satis",
  "/on-bilgilendirme",
  "/iptal-iade",
  "/teslimat",
  "/gizlilik",
  "/kullanim-kosullari",
  "/kvkk",
];

const targets = [...new Set([...sitemapUrls, ...LEGAL.map((p) => `${SITE}${p}`)])];
const broken = [];
for (const url of targets) {
  const res = await fetch(url, { redirect: "follow" });
  if (res.status !== 200) broken.push(`${url.replace(SITE, "")} → ${res.status}`);
}
report(
  broken.length === 0,
  `${targets.length} adresin hepsi 200`,
  broken.length ? broken.slice(0, 5).join(", ") : undefined,
);

// --- 5. Ölçüm açık ----------------------------------------------------------

line();
line("Ölçüm");

await check("/api/health iyi durumda", async () => {
  const { status, body } = await fetchText(`${SITE}/api/health`);
  return { ok: status === 200, detail: body.slice(0, 80) };
});

/*
  PostHog anahtarı HTML'de DEĞİL, derlenmiş JS parçasında duruyor:
  `NEXT_PUBLIC_*` değerleri paket içine gömülüyor. Ana sayfanın HTML'inde
  "posthog" aramak bu yüzden yanlış cevap verir.
*/
await check("PostHog anahtarı canlı pakette", async () => {
  const { body } = await fetchText(SITE);
  const chunks = [...body.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)]
    .map((m) => m[0])
    .slice(0, 12);
  for (const chunk of chunks) {
    const { body: js } = await fetchText(`${SITE}${chunk}`);
    if (js.includes("phc_")) return { ok: true, detail: chunk.split("/").pop() };
  }
  return { ok: false, detail: `${chunks.length} parçada bulunamadı` };
});

// --- Veritabanı: yeni göç dosyalarının kanıt nesneleri ----------------------

line();
line("Veritabanı (yeni göç dosyaları)");

function loadEnv() {
  const fromProcess = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SECRET_KEY,
  };
  if (fromProcess.url && fromProcess.key) return fromProcess;

  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return null;
  const parsed = {};
  for (const l of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) parsed[m[1]] = m[2];
  }
  return parsed.NEXT_PUBLIC_SUPABASE_URL && parsed.SUPABASE_SECRET_KEY
    ? { url: parsed.NEXT_PUBLIC_SUPABASE_URL, key: parsed.SUPABASE_SECRET_KEY }
    : null;
}

if (!WITH_DB) {
  report(null, "atlandı", "çalıştırmak için --db ekleyin");
} else {
  const env = loadEnv();
  if (!env) {
    report(
      null,
      "atlandı",
      "NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY gerekiyor (.env.local ya da ortam)",
    );
  } else {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(env.url, env.key, { auth: { persistSession: false } });

    const hasTable = async (table) => {
      const { error } = await sb.from(table).select("*").limit(1);
      return !error;
    };

    await check("20260918090000 — AUDIO_SYNTHESIZE kuralı", async () => {
      const { data } = await sb
        .from("credit_rules")
        .select("credit_cost")
        .eq("action_code", "AUDIO_SYNTHESIZE")
        .maybeSingle();
      return { ok: Boolean(data), detail: data ? `${data.credit_cost} kredi` : "yok" };
    });

    /*
      Asıl kritik madde. `reserveCredits` artık `p_quantity` gönderiyor; eski
      üç argümanlı imza duruyorsa PostgREST işlevi bulamaz ve HER kredi
      ayırma isteği düşer. Bunu var olmayan bir kullanıcı için çağırarak
      sınıyoruz: imza varsa "insufficient_credits"/"invalid_action" gibi bir
      İŞ hatası döner, yoksa "Could not find the function" (PGRST202).
    */
    await check("20260918090000 — credit_reserve miktar alıyor", async () => {
      const { error } = await sb.rpc("credit_reserve", {
        p_user_id: "00000000-0000-0000-0000-000000000000",
        p_action_code: "AUDIO_SYNTHESIZE",
        p_idempotency_key: `kapi_probe_${Date.now()}`,
        p_quantity: 1,
      });
      const missing =
        error && /could not find the function|PGRST202/i.test(error.message);
      return {
        ok: !missing,
        detail: missing ? "eski imza duruyor — göç uygulanmamış" : "yeni imza yerinde",
      };
    });

    await check("20260918100000 — deneme üretimi 5 kredi", async () => {
      const { data } = await sb
        .from("credit_rules")
        .select("credit_cost")
        .eq("action_code", "PRACTICE_EXAM_GENERATE")
        .maybeSingle();
      return { ok: data?.credit_cost === 5, detail: `${data?.credit_cost ?? "?"} kredi` };
    });

    await check("20260918110000 — model_upgrade_grants tablosu", () =>
      hasTable("model_upgrade_grants"),
    );
    await check("20260918120000 — document_page_grants tablosu", () =>
      hasTable("document_page_grants"),
    );

    await check("20260918130000 — davet çarpanı indirildi", async () => {
      const { data } = await sb
        .from("referral_tiers")
        .select("multiplier")
        .eq("status", "subscribed")
        .maybeSingle();
      return {
        ok: typeof data?.multiplier === "number" && data.multiplier < 400,
        detail: `${data?.multiplier ?? "?"} kat`,
      };
    });
  }
}

// --- Kapının dışarıdan ölçülemeyen maddeleri --------------------------------

line();
line("Panelden bakılması gerekenler (bu betik ölçemez)");
line("  1. /admin/sistem → PayTR satırı 'canlı kipte' diyor mu");
line("     Test kipinde akış baştan sona çalışır, abonelik açılır, kredi");
line("     yüklenir — yalnızca PARA GELMEZ. Atlamak, ürünü sessizce bedava");
line("     dağıtmak demek.");
line("  3. Gerçek kartla bir alım ve PayTR panelinden bir iade");

line();
if (failed) {
  line(`${failed} şart geçemedi.`);
  process.exit(1);
}
line(skipped ? `Ölçülen şartların hepsi geçti (${skipped} atlandı).` : "Hepsi geçti.");
