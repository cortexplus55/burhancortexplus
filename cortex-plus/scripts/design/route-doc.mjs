#!/usr/bin/env node
/**
 * 01-rota-envanteri.md üreticisi (Faz 0). `route-inventory.mjs` çıktısını (data/rotalar.json) okur, ürün sahibinin canlıda
 * gezdiği 35 rotayla karşılaştırır ve belgeyi yazar. Yalnız belge üretir.
 *
 *   node scripts/design/route-inventory.mjs --json docs/design-migration/data/rotalar.json
 *   node scripts/design/route-doc.mjs
 */
import fs from "node:fs";

const DATA = "docs/design-migration/data/rotalar.json";
const OUT = "docs/design-migration/01-rota-envanteri.md";
const { rows, protectedPrefixes } = JSON.parse(fs.readFileSync(DATA, "utf8"));

// Ürün sahibinin canlıda (Kurucu, 1536 px) gezdiği 35 rota. /araclar/<id> ve /deneme-sinavlari/<alt> tek tek sayılır.
const USER_LIST = [
  "/ogretmen", "/araclar",
  "/araclar/birim-cember", "/araclar/parabol", "/araclar/hucre",
  "/araclar/denklem", "/araclar/integral", "/araclar/periyodik", "/araclar/birim",
  "/studio/quiz", "/studio/flashcard", "/studio/dogru-yanlis",
  "/studio/podcast", "/studio/sozlu", "/studio/yazili", "/studio/anlat",
  "/quizler", "/flashcardlar", "/soru-coz", "/yanlislarim", "/gunluk", "/ilerleme",
  "/deneme-sinavlari", "/deneme-sinavlari/hazirliklarim", "/deneme-sinavlari/ara", "/deneme-sinavlari/olustur",
  "/deneme-sinavlari/okulum", "/deneme-sinavlari/mufredat", "/deneme-sinavlari/resmi",
  "/deneme-sinavlari/:prepId", "/deneme-sinavlari/:prepId/dugum/:nodeId",
  "/dokumanlar", "/dokumanlar/:documentId", "/sohbetler", "/profil", "/ayarlar", "/pay", "/davet", "/yardim",
];
// /araclar/<id> rotaları depoda tek dinamik sayfa: /araclar/:id.
const toRepo = (u) => (u.startsWith("/araclar/") ? "/araclar/:id" : u);

const pages = rows.filter((r) => r.kind === "sayfa" && !r.fixture);
const fixtures = rows.filter((r) => r.kind === "sayfa" && r.fixture);
const apis = rows.filter((r) => r.kind === "api");
const repoUrls = new Set(pages.map((r) => r.url));
const userRepo = new Set(USER_LIST.map(toRepo));
const missingInRepo = USER_LIST.filter((u) => !repoUrls.has(toRepo(u)));
const notInUserList = pages.filter((r) => !userRepo.has(r.url));

const comps = (r) => (r.components.length ? r.components.slice(0, 4).join(", ") + (r.components.length > 4 ? ` +${r.components.length - 4}` : "") : "—");
const plan = (r) => (r.planContent.length ? `içerik (${r.planContent.length} dosya)` : r.shellPlan ? "yalnız kabuk" : "—");
const row = (r, mark = "") =>
  `| \`${r.url}\`${mark} | \`${r.file}\` | ${r.client ? "istemci" : "sunucu"}${r.redirectOnly ? ", yönlendirme" : ""} | ${r.auth} | ${plan(r)} | ${r.params.join(", ") || "—"} | ${comps(r)} |`;
const HEAD = "| Rota | Dosya | Sunucu/istemci | Giriş | Plan | Parametre | Bileşenler (ilk 4) |\n|---|---|---|---|---|---|---|";

const mark = (u) => (["/siniflar", "/takvimim", "/krediler"].includes(u) ? " ⚑" : "");
const groups = [
  ["Öğrenci uygulaması (35 rotalık listede olanlar)", pages.filter((r) => userRepo.has(r.url))],
  ["Öğrenci uygulaması (listede olmayanlar)", notInUserList.filter((r) => r.auth !== "herkese açık" && !r.url.startsWith("/admin"))],
  ["Herkese açık (pazarlama, hukuk, giriş, kayıt, ödeme dönüşü)", notInUserList.filter((r) => r.auth === "herkese açık")],
  ["Yönetim paneli (kapsam dışı; listede yok)", notInUserList.filter((r) => r.url.startsWith("/admin"))],
];

let md = `# 01 · Rota envanteri

Üretim: \`node scripts/design/route-inventory.mjs --json ${DATA}\` + \`node scripts/design/route-doc.mjs\` (yalnız okur).
Kaynak: \`src/app\` ağacı, \`src/lib/supabase/middleware.ts\` (\`PROTECTED_PREFIXES\`), üst klasörlerdeki \`layout.tsx\`.

## Özet
- Gerçek sayfa: **${pages.length}** (ayrıca ${fixtures.length} test fikstürü \`/e2e/*\`, yalnız \`E2E_FIXTURE=1\` iken açılır). API ucu: **${apis.length}**.
- Girişli sayfa: ${pages.filter((r) => r.auth !== "herkese açık").length} · herkese açık: ${pages.filter((r) => r.auth === "herkese açık").length}.
- Öğrenci kabuğunu çizen (kapsülde plan görünür): ${pages.filter((r) => r.shellPlan).length}.
- İçeriği plan okuyan (sezgi, aşağıda): ${pages.filter((r) => r.planContent.length).length}. Tam liste 03'te.
- Ürün sahibinin 35 rotalık listesi: ${USER_LIST.length} adres (araç alt sayfaları tek tek), depoda karşılığı olmayan: **${missingInRepo.length}**${missingInRepo.length ? ` (${missingInRepo.join(", ")})` : ""}.

## Sütunlar nasıl çıkarıldı
- **Giriş**: \`sayfa kapısı\` = sayfa ya da üst \`layout.tsx\` \`requireStudentArea\` / \`requireUser\` / \`requireAdminPage\` / \`requireFounderPage\` çağırıyor; \`middleware\` = yalnız ara katmanın korumalı önekleri (${protectedPrefixes.length} önek); \`herkese açık\` = ikisi de yok. Misafir /admin'de 404 alır (\`GUEST_NOT_FOUND_PREFIXES\`).
- **Plan**: \`içerik\` = sayfa dosyası ya da doğrudan içe aktardığı yerel dosyalardan biri plan okuyan bir ad taşıyor (\`isPremium\`, \`showsUpgradeChrome\`, \`planIdentity\`, \`entitlements\`, \`freeLessonGate\`, \`pathSkipKinds\` …). Kabuğun kendisi ve veri yükleyicileri (\`sor-shell\`, \`app-shell\`, \`parity-shell-props\`, \`account-context\`) sayılmaz; onlar \`yalnız kabuk\` sütunundadır. Tek kat: daha derindeki okumalar 03'teki taramada.
- **Bileşenler**: sayfa dosyasının \`@/components/*\` ve yerel içe aktarımları.
- ⚑ = ürün sahibinin 35 rotalık listesinde yok (aşağıdaki not).

## /siniflar, /takvimim, /krediler ⚑ (listede yok)
- \`/siniflar\` ve \`/siniflar/:id\`: **Çalışma grupları** (öğrenci grup kurar ya da kodla katılır; öğretmen paneli değil). Kütüphane'den açılır.
- \`/takvimim\`: **Takvimim** (ay görünümü, yaklaşan sınavlar, etkinlik ekle). Profil panelinin karosundan açılır.
- \`/krediler\`: **Kullanım limitleri**. Plan okuyor (03'te satırları var): kurucuda \`FounderCreditsView\` (kredi sınırı yok, maliyet takibi); Plus/Sigma'da dönem kotası (aylık 7.200 / haftalık 2.700 / Sigma 60.000 kredi, yüzde olarak), "Ek paket al" (\`/pay\`); ücretsizde günlük sayaçlar (günde 3 mesaj, 1 fotoğraf), ilk dersin durumu (\`firstLessonStatus\`), cüzdan bakiyesi ("Ek hakkın: yaklaşık N ders"; davet hediyesi, eski ek paket ya da promosyon). **Kredi/hediye/ödül mekanizması var**: davet kartı (\`ReferralRewardCard\`: doğrulanmış davetli ilk işinde iki tarafa bir kez 90 kredi = 3 ders, davet eden en çok 3 davet) ve cüzdan bakiyesi. Profil panelinin listesinden açılır.

## Senin gezmediklerin
- \`/mobil-uygulama\`: oturum açık öğrenciye uygulama kabuğu, misafire pazarlama sayfası (\`loadOptionalStudentShell\`). \`/yardim\` aynı.
- Giriş ve kayıt: \`/giris\` (istemci), \`/kayit\`, \`/kayit/tamamla\`, \`/sifremi-unuttum\`, \`/sifre-yenile\`, \`/email-dogrula\`, \`/onboarding\`, \`/auth/auth-code-error\`.
- Çalışma grupları: \`/siniflar\`, \`/siniflar/:id\` (yukarıda).
- \`/d/*\`: **depoda yok** (\`src/app/d\` klasörü yok).
- 404: \`src/app/not-found.tsx\`. 500: \`src/app/error.tsx\` (sayfa hatası), \`src/app/global-error.tsx\` (kök yerleşim hatası).
- E-posta şablonları (HTML, sayfa değil): \`src/lib/email/templates.ts\` (hatırlatma, doğrulama, şifre), \`lifecycle-templates.ts\` (hoş geldin, satın alma, deneme), \`plan-notice-mails.ts\` (dönem bitişi), \`campaign.ts\` (toplu), \`daily-mails.ts\` (davet), \`brand-header.ts\` (ortak başlık).
- PDF: **PDF üreten şablon yok**. Sözleşme örneği HTML sayfası (\`/odemeler/sozlesme/:siparis\`); sınav sabahı kâğıdı tarayıcının yazdırmasıyla; \`pdf-split-client.ts\` yalnız yüklenen PDF'i böler.

`;
for (const [title, list] of groups) {
  md += `## ${title} (${list.length})\n\n${HEAD}\n${list.map((r) => row(r, mark(r.url))).join("\n")}\n\n`;
}
md += `## Test fikstürleri (${fixtures.length}; canlıda 404)\n\n${fixtures.map((r) => `\`${r.url}\``).join(" · ")}\n\n`;
md += `## API uçları (${apis.length})\n\nTam liste \`${DATA}\` içinde (\`kind: "api"\`). Plan zorlaması yapan uçlar 03'te.\n`;
fs.writeFileSync(OUT, md);
console.log(`yazıldı: ${OUT} (${pages.length} sayfa, eksik ${missingInRepo.length})`);
